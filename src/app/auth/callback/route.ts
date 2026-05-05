import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/dashboard';

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=missing_code', request.url));
  }

  // Build the response first so we can attach session cookies to it
  const response = NextResponse.redirect(new URL(next, origin));

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          // Write session cookies onto the redirect response
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { session }, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !session?.user?.email) {
    console.error('[auth/callback]', error?.message);
    return NextResponse.redirect(new URL('/login?error=auth_failed', request.url));
  }

  const authUser = session.user;
  const email    = authUser.email!;

  // Create public.users row if this is a fresh sign-up
  const [existing] = await db.select({ id: users.id, team: users.team })
    .from(users).where(eq(users.email, email));

  let isNewUser = false;
  if (!existing) {
    const emailPrefix = email.split('@')[0].replace(/[^a-z0-9_]/gi, '_').toLowerCase();
    const name = (authUser.user_metadata?.name as string | undefined)?.trim() || emailPrefix;
    const now = new Date().toISOString();
    await db.insert(users).values({
      username:     emailPrefix,
      passwordHash: '',
      name,
      email,
      role:         'ic',
      team:         null,
      jobTitle:     null,
      isActive:     1,
      createdAt:    now,
      updatedAt:    now,
    }).onConflictDoNothing();
    isNewUser = true;
  }

  // Send new users to onboarding to complete their profile
  if (isNewUser || !existing?.team) {
    response.headers.set('location', new URL('/onboarding', origin).toString());
  }

  return response;
}

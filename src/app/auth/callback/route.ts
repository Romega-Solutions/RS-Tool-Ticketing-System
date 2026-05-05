import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';

export const runtime = 'nodejs';

// Supabase redirects here after the user clicks the confirmation link in their email.
// We exchange the code for a session, ensure public.users exists, then go to /dashboard.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/dashboard';

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=missing_code', request.url));
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch { /* read-only context */ }
        },
      },
    }
  );

  const { data: { session }, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !session?.user?.email) {
    console.error('[auth/callback] exchange error:', error?.message);
    return NextResponse.redirect(new URL('/login?error=auth_failed', request.url));
  }

  const authUser = session.user;
  const email = authUser.email!;

  // Ensure a public.users row exists — create with defaults if this is a fresh signup
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (!existing) {
    const emailPrefix = email.split('@')[0].replace(/[^a-z0-9_]/gi, '_').toLowerCase();
    const name = (authUser.user_metadata?.name as string | undefined)?.trim() || emailPrefix;
    const now = new Date().toISOString();

    await db.insert(users).values({
      username:     emailPrefix,
      passwordHash: '',        // not used — auth is managed by Supabase
      name,
      email,
      role:         'ic',     // all self-signups start as IC; admin can promote
      team:         null,
      jobTitle:     null,
      isActive:     1,
      createdAt:    now,
      updatedAt:    now,
    }).onConflictDoNothing();
  }

  return NextResponse.redirect(new URL(next, origin));
}

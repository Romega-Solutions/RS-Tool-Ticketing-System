import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

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
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
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

  // Accounts are created by an admin in User Management — the portal is the
  // source of truth. A sign-in for an email with no account is rejected.
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from('users')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  if (!existing) {
    return NextResponse.redirect(new URL('/login?error=not_allowed', request.url));
  }

  return response;
}

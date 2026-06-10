import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { lookupOrgAuthProfileByEmail } from '@/lib/orgchart';

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

  const admin = createAdminClient();
  const orgProfile = await lookupOrgAuthProfileByEmail(email);

  // Create public.users row if this is a fresh sign-up
  const { data: existing } = await admin
    .from('users')
    .select('id, team')
    .eq('email', email)
    .maybeSingle();

  let isNewUser = false;
  if (!existing) {
    if (!orgProfile) {
      return NextResponse.redirect(new URL('/login?error=not_allowed', request.url));
    }
    const now = new Date().toISOString();
    const { error: insertError } = await admin.from('users').upsert({
      username:      orgProfile.username,
      password_hash: '',
      name:          orgProfile.name,
      email:         orgProfile.email,
      role:          orgProfile.role,
      team:          orgProfile.team,
      job_title:     orgProfile.jobTitle,
      is_active:     1,
      created_at:    now,
      updated_at:    now,
    }, { onConflict: 'email', ignoreDuplicates: true });
    if (insertError) {
      console.error('[auth/callback] users insert failed:', insertError);
      return NextResponse.redirect(new URL('/login?error=signup_failed', request.url));
    }
    // ignoreDuplicates silently no-ops on username clashes etc., so re-fetch
    // and hard-fail rather than redirecting to /onboarding with no DB row.
    const { data: verify } = await admin
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle();
    if (!verify) {
      console.error('[auth/callback] users row missing after upsert for', email);
      return NextResponse.redirect(new URL('/login?error=signup_failed', request.url));
    }
    isNewUser = true;
  } else if (orgProfile) {
    await admin.from('users').update({
      name:       orgProfile.name,
      team:       orgProfile.team,
      job_title:  orgProfile.jobTitle,
      updated_at: new Date().toISOString(),
    }).eq('email', email);
  }

  // Send new users to onboarding to complete their profile
  if (isNewUser || !(orgProfile?.team ?? existing?.team)) {
    response.headers.set('location', new URL('/onboarding', origin).toString());
  }

  return response;
}

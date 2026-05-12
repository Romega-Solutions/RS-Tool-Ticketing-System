import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { lookupPerson } from '@/lib/orgchart';

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

  // Create public.users row if this is a fresh sign-up
  const { data: existing } = await admin
    .from('users')
    .select('id, team')
    .eq('email', email)
    .maybeSingle();

  let isNewUser = false;
  if (!existing) {
    const emailPrefix = email.split('@')[0].replace(/[^a-z0-9_]/gi, '_').toLowerCase();
    const name = (
      (authUser.user_metadata?.full_name as string | undefined) ||
      (authUser.user_metadata?.name as string | undefined)
    )?.trim() || emailPrefix;
    const now = new Date().toISOString();
    await admin.from('users').upsert({
      username:      emailPrefix,
      password_hash: '',
      name,
      email,
      role:          'ic',
      team:          null,
      job_title:     null,
      is_active:     1,
      created_at:    now,
      updated_at:    now,
    }, { onConflict: 'email', ignoreDuplicates: true });
    isNewUser = true;

    // Enrich new user from org chart (silent fail — never blocks auth)
    try {
      // Email is the primary key; name is the fallback
      const orgMatch = await lookupPerson({ email, name });
      if (orgMatch) {
        await admin.from('users').update({
          team:      orgMatch.department,
          job_title: orgMatch.title,
          updated_at: new Date().toISOString(),
        }).eq('email', email);
      }
    } catch { /* org chart unavailable — proceed normally */ }
  }

  // Send new users to onboarding to complete their profile
  if (isNewUser || !existing?.team) {
    response.headers.set('location', new URL('/onboarding', origin).toString());
  }

  return response;
}

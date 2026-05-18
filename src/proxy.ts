import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session — must not be removed or PKCE flow breaks
  const { data: { user }, error } = await supabase.auth.getUser();

  // A stale cookie with a dead refresh token makes getUser() fail every
  // request, spamming "Invalid Refresh Token" in the server log forever.
  // Expire the Supabase auth cookies so the dead token stops being replayed.
  const sessionBroken = !user && !!error;
  function clearAuthCookies(res: NextResponse): NextResponse {
    for (const c of request.cookies.getAll()) {
      if (/^sb-.*-auth-token/.test(c.name)) {
        res.cookies.set(c.name, '', { maxAge: 0, path: '/' });
      }
    }
    return res;
  }

  const { pathname } = request.nextUrl;
  const isLoginPage = pathname === '/login';

  if (isLoginPage) {
    if (user) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
    return sessionBroken ? clearAuthCookies(supabaseResponse) : supabaseResponse;
  }

  if (!user) {
    const redirect = NextResponse.redirect(new URL('/login', request.url));
    return sessionBroken ? clearAuthCookies(redirect) : redirect;
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|images|api|auth|onboarding|guide).*)',
  ],
};

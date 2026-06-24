import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';
import { hasSupabaseConfig } from '@/lib/supabase/config';

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // App Router doesn't pass the current pathname to layouts, and Next.js 16
  // dropped the legacy `x-invoke-path` header. Forward it on the request so
  // server components (e.g. (app)/layout.tsx) can enforce path-based access as
  // a centralized backstop. Rebuilt from request.headers on each call so the
  // Supabase cookie refresh in setAll() is preserved.
  const withPathname = () => {
    const headers = new Headers(request.headers);
    headers.set('x-pathname', pathname);
    return NextResponse.next({ request: { headers } });
  };

  let supabaseResponse = withPathname();

  if (!hasSupabaseConfig()) {
    return supabaseResponse;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = withPathname();
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

  const isLoginPage = pathname === '/login';
  // Public application form is open to the world — no auth required.
  const isPublicApply = pathname === '/apply' || pathname.startsWith('/apply/');

  if (isPublicApply) {
    return supabaseResponse;
  }

  if (isLoginPage) {
    // ?stale=1 is set by (app)/layout when getSession() is null but a
    // Supabase auth cookie still exists — clear the dead cookies and render
    // /login, otherwise we'd bounce the user straight back into the app.
    const isStale = request.nextUrl.searchParams.get('stale') === '1';
    if (isStale) {
      return clearAuthCookies(supabaseResponse);
    }
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
    '/((?!_next/static|_next/image|favicon.ico|images|api|auth|onboarding|guide|apply).*)',
  ],
};

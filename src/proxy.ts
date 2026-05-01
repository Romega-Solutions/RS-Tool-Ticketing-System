import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { canAccessPath, defaultLandingPath, normalizeRole } from '@/lib/rbac';

export async function proxy(req: NextRequest) {
  const token = req.cookies.get('session_token')?.value;
  const isAuthPage = req.nextUrl.pathname.startsWith('/login');

  const payload = token ? await verifyToken(token) : null;
  const role = normalizeRole(payload?.role);

  if (isAuthPage) {
    if (payload) {
      return NextResponse.redirect(new URL(defaultLandingPath(role), req.url));
    }
    return NextResponse.next();
  }

  if (!token || !payload) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  if (!canAccessPath(req.nextUrl.pathname, role)) {
    return NextResponse.redirect(new URL(defaultLandingPath(role), req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};

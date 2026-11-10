import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { VIEW_AS_COOKIE } from '@/lib/session';
import {
  isAllowedPreviewEmail,
  previewEmailForRole,
  previewRoleSwitcherStatus,
} from '@/lib/preview-role-switcher';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Preview-only: signs the browser in as one of the five fake role accounts.
// Every guard is re-checked on every request; any failure is a plain 404 so
// the route looks like it doesn't exist outside a correctly set up preview.

function notFound() {
  return new NextResponse('Not Found', { status: 404 });
}

async function readRole(request: NextRequest): Promise<unknown> {
  const type = request.headers.get('content-type') ?? '';
  try {
    if (type.includes('application/json')) {
      const body = (await request.json()) as { role?: unknown };
      return body?.role;
    }
    const form = await request.formData();
    return form.get('role');
  } catch {
    return null;
  }
}

// A cross-site form must not be able to sign a reviewer into a test account.
function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    return new URL(origin).host === request.nextUrl.host;
  } catch {
    return false;
  }
}

export async function GET() {
  return notFound();
}

export async function POST(request: NextRequest) {
  try {
    if (!previewRoleSwitcherStatus().enabled) return notFound();
    if (!isSameOrigin(request)) return notFound();

    const email = previewEmailForRole(await readRole(request));
    if (!email || !isAllowedPreviewEmail(email)) return notFound();

    const admin = createAdminClient();

    // Only sign into an account the seed script created. Without this check
    // generating a link could create a brand-new auth user.
    const { data: row } = await admin
      .from('users')
      .select('id, email, is_active')
      .eq('email', email)
      .maybeSingle();
    if (!row || !row.is_active || !isAllowedPreviewEmail(row.email)) return notFound();

    const { data: link, error: linkError } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
    });
    const tokenHash = link?.properties?.hashed_token;
    if (linkError || !tokenHash || link.user?.email?.toLowerCase() !== email) {
      console.error('[preview/switch-role] generateLink failed:', linkError?.message);
      return notFound();
    }

    const response = NextResponse.redirect(new URL('/dashboard', request.url), 303);
    response.cookies.delete(VIEW_AS_COOKIE);

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      {
        cookies: {
          getAll() { return request.cookies.getAll(); },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options),
            );
          },
        },
      },
    );

    const { data: verified, error: verifyError } = await supabase.auth.verifyOtp({
      type: 'magiclink',
      token_hash: tokenHash,
    });
    if (verifyError || verified.user?.email?.toLowerCase() !== email) {
      console.error('[preview/switch-role] verifyOtp failed:', verifyError?.message);
      return notFound();
    }

    return response;
  } catch (err) {
    console.error('[preview/switch-role]', err instanceof Error ? err.message : err);
    return notFound();
  }
}

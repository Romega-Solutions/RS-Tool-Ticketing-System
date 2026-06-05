// Public, unauthenticated consent-confirm link target. The n8n consent email
// sends the candidate here. Clicking records agreement (method='link') with the
// click IP + timestamp — the GDPR proof — and renders a branded thank-you page.
//
// Idempotent: re-clicking an already-agreed token shows the same confirmation.
// Unknown / revoked tokens show a neutral "link no longer valid" page.

import { type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { consentHtmlPage, clientIpFrom } from '@/lib/talent-consent-page';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function html(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  if (!token || token.length < 16) {
    return html(consentHtmlPage({
      variant: 'neutral',
      heading: 'Link no longer valid',
      message: 'This consent link is invalid or has expired. If you still want to be featured, please reply to the email from our recruiting team.',
    }), 404);
  }

  const supabase = createAdminClient();
  const { data: candidate, error } = await supabase
    .from('candidates')
    .select('id, consent_status')
    .eq('consent_token', token)
    .maybeSingle();

  if (error || !candidate || candidate.consent_status === 'revoked') {
    return html(consentHtmlPage({
      variant: 'neutral',
      heading: 'Link no longer valid',
      message: 'This consent link is invalid or has been withdrawn. If you still want to be featured, please reply to the email from our recruiting team.',
    }), candidate ? 200 : 404);
  }

  const base = (process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_BASE_URL || '').replace(/\/+$/, '');
  const withdrawUrl = base ? `${base}/api/public/talents/revoke/${token}` : undefined;

  // Idempotent: already agreed → show the same confirmation.
  if (candidate.consent_status === 'agreed') {
    return html(consentHtmlPage({
      variant: 'success',
      heading: "You're all set",
      message: 'Thanks — your consent is already on file. Romega Solutions may feature your anonymized profile (first name + last initial, role, skills, and location) on our public talent page.',
      withdrawUrl,
    }));
  }

  const now = new Date().toISOString();
  const ip = clientIpFrom(req.headers);
  const { error: updErr } = await supabase
    .from('candidates')
    .update({
      consent_status:    'agreed',
      consent_agreed_at: now,
      consent_agreed_ip: ip,
      consent_method:    'link',
      updated_at:        now,
    })
    .eq('id', candidate.id)
    .eq('consent_token', token);

  if (updErr) {
    return html(consentHtmlPage({
      variant: 'error',
      heading: 'Something went wrong',
      message: 'We could not record your consent just now. Please try the link again in a moment, or reply to our email.',
    }), 500);
  }

  return html(consentHtmlPage({
    variant: 'success',
    heading: 'Thank you — consent recorded',
    message: 'Romega Solutions may now feature your anonymized profile (first name + last initial, role, skills, and location) on our public talent page. We never publish your email, phone, or résumé.',
    withdrawUrl,
    footnote: 'You can withdraw your consent at any time using the link below.',
  }));
}

// Public, unauthenticated consent-withdrawal link target (GDPR right to
// withdraw / erasure). Reachable from the confirm page and the consent email.
// Sets consent_status='revoked', unpublishes the candidate, and clears the
// token so the link cannot be reused.

import { type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { consentHtmlPage } from '@/lib/talent-consent-page';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function html(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  if (!token || token.length < 16) {
    return html(consentHtmlPage({
      variant: 'neutral',
      heading: 'Link no longer valid',
      message: 'This withdrawal link is invalid or has already been used.',
    }), 404);
  }

  const supabase = createAdminClient();
  const { data: candidate } = await supabase
    .from('candidates')
    .select('id')
    .eq('consent_token', token)
    .maybeSingle();

  // Idempotent: token already cleared (revoked before) → still show success.
  if (!candidate) {
    return html(consentHtmlPage({
      variant: 'success',
      heading: 'Consent withdrawn',
      message: 'Your profile is not shown on our public talent page. If this was a mistake, please reply to our recruiting team.',
    }));
  }

  const now = new Date().toISOString();
  const { error: updErr } = await supabase
    .from('candidates')
    .update({
      consent_status:   'revoked',
      is_public_talent: false,
      consent_token:    null,
      updated_at:       now,
    })
    .eq('id', candidate.id);

  if (updErr) {
    return html(consentHtmlPage({
      variant: 'error',
      heading: 'Something went wrong',
      message: 'We could not process your withdrawal just now. Please try again in a moment, or reply to our email and we will remove your profile.',
    }), 500);
  }

  return html(consentHtmlPage({
    variant: 'success',
    heading: 'Consent withdrawn',
    message: 'Done — your profile will no longer appear on our public talent page. We have recorded your withdrawal.',
  }));
}

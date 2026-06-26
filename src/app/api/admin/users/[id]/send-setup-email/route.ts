import { NextResponse } from 'next/server';
import { z } from 'zod';
import { route, requireAdmin, parseBody, badRequest, notFound } from '@/lib/api';
import { createAdminClient } from '@/lib/supabase/admin';
import { enforceRateLimit, keyByUser } from '@/lib/rate-limit';
import { recordAudit } from '@/lib/audit';
import { resolvePlaceholders } from '@/lib/email-templates';
import { getAccountSetupTemplate, saveAccountSetupTemplate } from '@/lib/email-templates-store';
import { sendAccountSetupEmail } from '@/lib/n8n';
import { publicBaseUrl } from '@/lib/app-url';

export const runtime = 'nodejs';

// The (possibly tweaked) template the dialog is sending. Raw — with {{tokens}}
// still in it — so the server stays authoritative for the recipient's details.
const bodySchema = z.object({
  subject:       z.string().trim().min(1).max(300).optional(),
  body:          z.string().trim().min(1).max(20_000).optional(),
  saveAsDefault: z.boolean().optional(),
});

// POST — render the account-setup template for this user and email it via n8n.
export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const session = await requireAdmin();
  await enforceRateLimit({ key: keyByUser('admin-setup-email', session.id), limit: 30, windowSeconds: 60 });

  const { id } = await params;
  const userId = Number(id);
  if (!Number.isInteger(userId) || userId <= 0) throw badRequest('Invalid user id');

  const input = await parseBody(req, bodySchema);

  // Always an externally-clickable URL — never localhost (see lib/app-url).
  const base = publicBaseUrl();

  const admin = createAdminClient();
  const { data: user } = await admin
    .from('users')
    .select('id, email, name, role, team')
    .eq('id', userId)
    .maybeSingle();
  if (!user) throw notFound('User not found');
  if (!user.email) throw badRequest('That user has no email address on file.');

  // Prefer the dialog's edited subject/body; fall back to the saved default.
  const saved = await getAccountSetupTemplate();
  const subjectTpl = input.subject ?? saved.subject;
  const bodyTpl    = input.body ?? saved.body;

  const resolved = resolvePlaceholders(
    { subject: subjectTpl, body: bodyTpl },
    {
      name:      user.name,
      email:     user.email,
      role:      user.role,
      team:      user.team,
      loginLink: `${base}/login`,
      guideLink: `${base}/guide`,
    },
  );

  // The OpenClaw sender takes plain text; resolved.text is the rendered body.
  const result = await sendAccountSetupEmail({
    to:      user.email,
    subject: resolved.subject,
    body:    resolved.text,
  });
  if (!result.ok) {
    // Email pipeline down — surface it; do NOT mark the user as invited.
    return NextResponse.json({ ok: false, error: result.error }, { status: 502 });
  }

  const sentAt = new Date().toISOString();
  await admin.from('users').update({ setup_email_sent_at: sentAt }).eq('id', userId);

  // Persist the tweak as the new org-wide default only when both fields were sent.
  if (input.saveAsDefault && input.subject && input.body) {
    try {
      await saveAccountSetupTemplate({ subject: input.subject, body: input.body, updatedBy: session.id });
    } catch {
      /* best-effort: the email already went out; saving the default is secondary */
    }
  }

  await recordAudit({ actorId: session.id, action: 'user.setup_email_sent', targetUserId: userId });

  return NextResponse.json({ ok: true, sentAt });
});

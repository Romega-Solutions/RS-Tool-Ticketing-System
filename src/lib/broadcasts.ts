import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/n8n';
import { publicBaseUrl } from '@/lib/app-url';

export type BroadcastTarget = 'active' | 'all' | 'selected';

export type BroadcastRecipient = {
  id: number;
  name: string;
  email: string | null;
  role: string;
  team: string | null;
  isActive: boolean;
};

export type BroadcastInput = {
  target: BroadcastTarget;
  selectedUserIds: number[];
  subject: string;
  message: string;
  inApp: boolean;
  sendEmail: boolean;
};

export type BroadcastResult = {
  recipientCount: number;
  notificationCount: number;
  emailCount: number;
};

const MAX_SUBJECT_LENGTH = 120;
const MAX_MESSAGE_LENGTH = 4000;

export function normalizeBroadcastInput(raw: {
  target?: unknown;
  selectedUserIds?: unknown;
  subject?: unknown;
  message?: unknown;
  inApp?: unknown;
  sendEmail?: unknown;
}): BroadcastInput {
  const target = raw.target === 'all' || raw.target === 'selected' ? raw.target : 'active';
  const subject = String(raw.subject ?? '').trim().slice(0, MAX_SUBJECT_LENGTH);
  const message = String(raw.message ?? '').trim().slice(0, MAX_MESSAGE_LENGTH);
  const selectedUserIds = Array.isArray(raw.selectedUserIds)
    ? [...new Set(raw.selectedUserIds.map(Number).filter(Number.isFinite))]
    : [];
  const inApp = raw.inApp !== false;
  const email = raw.sendEmail !== false;

  if (!subject) throw new Error('Subject is required.');
  if (!message) throw new Error('Message is required.');
  if (!inApp && !email) throw new Error('Choose at least one delivery method.');
  if (target === 'selected' && selectedUserIds.length === 0) {
    throw new Error('Select at least one recipient.');
  }

  return { target, selectedUserIds, subject, message, inApp, sendEmail: email };
}

export function selectBroadcastRecipients(
  users: BroadcastRecipient[],
  input: Pick<BroadcastInput, 'target' | 'selectedUserIds'>,
): BroadcastRecipient[] {
  const selected = new Set(input.selectedUserIds);
  const seen = new Set<number>();

  return users.filter((user) => {
    if (seen.has(user.id)) return false;
    if (input.target === 'active' && !user.isActive) return false;
    if (input.target === 'selected' && !selected.has(user.id)) return false;
    seen.add(user.id);
    return true;
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderBroadcastEmail(input: {
  subject: string;
  message: string;
  senderName: string;
}): { subject: string; html: string; text: string } {
  const baseUrl = publicBaseUrl();
  const safeSubject = escapeHtml(input.subject);
  const safeSender = escapeHtml(input.senderName);
  const safeMessage = escapeHtml(input.message).replace(/\n/g, '<br />');
  const text = `${input.subject}\n\n${input.message}\n\nSent by ${input.senderName}\nOpen the portal: ${baseUrl}`;

  return {
    subject: input.subject,
    text,
    html: `
      <div style="font-family:Arial,sans-serif;color:#1f2937;line-height:1.5">
        <h2 style="margin:0 0 12px">${safeSubject}</h2>
        <div style="white-space:normal;margin:0 0 16px">${safeMessage}</div>
        <p style="margin:0 0 16px;color:#6b7280;font-size:13px">Sent by ${safeSender}</p>
        <a href="${baseUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:8px;padding:10px 14px">Open Romega Portal</a>
      </div>
    `.trim(),
  };
}

export async function sendBroadcast(input: {
  actorId: number;
  actorName: string;
  recipients: BroadcastRecipient[];
  subject: string;
  message: string;
  inApp: boolean;
  email: boolean;
}): Promise<BroadcastResult> {
  const sb = createAdminClient();
  let notificationCount = 0;

  if (input.inApp && input.recipients.length > 0) {
    const rows = input.recipients.map((recipient) => ({
      user_id: recipient.id,
      actor_id: input.actorId,
      type: 'broadcast',
      title: input.subject,
      body: input.message,
      link: '/dashboard',
    }));
    const { error } = await sb.from('notifications').insert(rows);
    if (error) throw new Error(`Could not create notifications: ${error.message}`);
    notificationCount = rows.length;
  }

  let emailCount = 0;
  if (input.email) {
    const rendered = renderBroadcastEmail({
      subject: input.subject,
      message: input.message,
      senderName: input.actorName,
    });
    for (const recipient of input.recipients) {
      if (!recipient.email?.trim()) continue;
      sendEmail({ to: recipient.email, subject: rendered.subject, html: rendered.html, text: rendered.text });
      emailCount += 1;
    }
  }

  return {
    recipientCount: input.recipients.length,
    notificationCount,
    emailCount,
  };
}

'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/session';
import { canAccessAdmin } from '@/lib/rbac';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  normalizeBroadcastInput,
  selectBroadcastRecipients,
  sendBroadcast,
  type BroadcastRecipient,
} from '@/lib/broadcasts';

export type BroadcastActionState =
  | { ok: true; recipientCount: number; notificationCount: number; emailCount: number }
  | { ok: false; error: string };

function parseSelectedUserIds(value: FormDataEntryValue | null): number[] {
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.map(Number).filter(Number.isFinite) : [];
  } catch {
    return [];
  }
}

export async function sendBroadcastAction(formData: FormData): Promise<BroadcastActionState> {
  const session = await getSession();
  if (!session || !canAccessAdmin(session.role)) {
    return { ok: false, error: 'Not authorized.' };
  }

  try {
    const input = normalizeBroadcastInput({
      target: formData.get('target'),
      selectedUserIds: parseSelectedUserIds(formData.get('selectedUserIds')),
      subject: formData.get('subject'),
      message: formData.get('message'),
      inApp: formData.get('inApp') === 'on',
      sendEmail: formData.get('sendEmail') === 'on',
    });

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('users')
      .select('id, name, email, role, team, is_active')
      .order('name');
    if (error) throw new Error(`Could not load users: ${error.message}`);

    const users = ((data ?? []) as Array<Record<string, unknown>>)
      .map((row): BroadcastRecipient => ({
        id: Number(row.id),
        name: String(row.name ?? 'Unnamed user'),
        email: typeof row.email === 'string' ? row.email : null,
        role: String(row.role ?? 'ic'),
        team: typeof row.team === 'string' ? row.team : null,
        isActive: Boolean(row.is_active),
      }))
      .filter(user => user.id !== session.id);

    const recipients = selectBroadcastRecipients(users, input);
    if (recipients.length === 0) {
      return { ok: false, error: 'No recipients matched this broadcast.' };
    }

    const result = await sendBroadcast({
      actorId: session.id,
      actorName: session.name,
      recipients,
      subject: input.subject,
      message: input.message,
      inApp: input.inApp,
      email: input.sendEmail,
    });

    revalidatePath('/admin/broadcasts');
    return { ok: true, ...result };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not send broadcast.' };
  }
}

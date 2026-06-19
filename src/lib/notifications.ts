import { createAdminClient } from '@/lib/supabase/admin';

// In-app notification helpers. Backed by the `notifications` table (see
// src/db/schema.ts). All writes are best-effort: if the table hasn't been
// migrated yet, inserts no-op rather than breaking the triggering action
// (commenting, adding a member, the cron sweep).

export type NotificationType = 'project_added' | 'mentioned' | 'task_due';

export interface NotificationRow {
  id:         number;
  type:       string;
  title:      string;
  body:       string | null;
  link:       string | null;
  is_read:    number;
  created_at: string;
}

function isMissingTable(msg: string | undefined): boolean {
  if (!msg) return false;
  const m = msg.toLowerCase();
  return m.includes('relation') && m.includes('does not exist');
}

export async function createNotification(input: {
  userId:   number;
  actorId?: number | null;
  type:     NotificationType;
  title:    string;
  body?:    string | null;
  link?:    string | null;
}): Promise<void> {
  // Never notify the actor about their own action.
  if (input.actorId != null && input.actorId === input.userId) return;

  const sb = createAdminClient();
  const { error } = await sb.from('notifications').insert({
    user_id:  input.userId,
    actor_id: input.actorId ?? null,
    type:     input.type,
    title:    input.title,
    body:     input.body ?? null,
    link:     input.link ?? null,
  });
  if (error && !isMissingTable(error.message)) {
    console.error('[notifications] insert failed:', error.message);
  }
}

export async function listNotifications(
  userId: number,
  limit = 20,
): Promise<{ items: NotificationRow[]; unreadCount: number }> {
  const sb = createAdminClient();

  const { data, error } = await sb.from('notifications')
    .select('id, type, title, body, link, is_read, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    if (isMissingTable(error.message)) return { items: [], unreadCount: 0 };
    throw error;
  }

  // Accurate unread count across all rows, not just the latest `limit`.
  const { count } = await sb.from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', 0);

  return { items: (data ?? []) as NotificationRow[], unreadCount: count ?? 0 };
}

export async function markNotificationsRead(
  userId: number,
  opts: { id?: number; all?: boolean },
): Promise<void> {
  const sb = createAdminClient();
  let q = sb.from('notifications').update({ is_read: 1 }).eq('user_id', userId);
  if (!opts.all) {
    if (opts.id == null) return; // nothing to do without an explicit target
    q = q.eq('id', opts.id);
  }
  const { error } = await q;
  if (error && !isMissingTable(error.message)) {
    console.error('[notifications] mark read failed:', error.message);
  }
}

// ── Convenience wrappers ───────────────────────────────────────────────────

export async function notifyMention(opts: {
  recipientIds: number[];
  actorId:      number;
  actorName:    string;
  projectName:  string;
  snippet?:     string | null;
  link:         string;
}): Promise<void> {
  const unique = [...new Set(opts.recipientIds)];
  await Promise.all(unique.map(userId => createNotification({
    userId,
    actorId: opts.actorId,
    type:    'mentioned',
    title:   `${opts.actorName} tagged you in ${opts.projectName}`,
    body:    opts.snippet ?? null,
    link:    opts.link,
  })));
}

export async function notifyProjectAdded(opts: {
  recipientId: number;
  actorId:     number;
  actorName:   string;
  projectName: string;
  projectId:   number | string;
}): Promise<void> {
  await createNotification({
    userId:  opts.recipientId,
    actorId: opts.actorId,
    type:    'project_added',
    title:   `You have been added to ${opts.projectName}`,
    body:    `${opts.actorName} added you to this project.`,
    link:    `/projects/${opts.projectId}`,
  });
}

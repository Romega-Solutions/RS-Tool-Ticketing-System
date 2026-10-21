import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/n8n';
import { projectPathById } from '@/lib/project-slug-server';
import { renderNotificationEmail, type NotificationTaskMeta } from '@/lib/email-templates';

// In-app notification helpers. Backed by the `notifications` table (see
// src/db/schema.ts). All writes are best-effort: if the table hasn't been
// migrated yet, inserts no-op rather than breaking the triggering action
// (commenting, adding a member, the cron sweep).
//
// `createNotification` is also the SINGLE choke point for notification EMAIL:
// after the in-app row insert it looks up the recipient's email + per-user
// `notification_prefs` and, when enabled, fires a (best-effort, non-blocking)
// email through n8n. Every existing wrapper therefore gains email for free.

export type NotificationType =
  | 'project_added' | 'mentioned' | 'task_due' | 'task_assigned'
  | 'time_edit_requested' | 'time_edit_decided' | 'thread_reply'
  // In-app only (never mapped in EMAIL_PREF_KEY): filing receipt, supervisor
  // approved / waiting on admin, and the supervisor's "still waiting" reminder.
  | 'time_edit_received' | 'time_edit_update' | 'time_edit_reminder';

// ── Per-user email preferences ─────────────────────────────────────────────
// Mirrors users.notification_prefs (jsonb, default all-on — see schema.ts).
export type NotificationPrefs = {
  email:        boolean;
  mentions:     boolean;
  dueToday:     boolean;
  approvals:    boolean;
  projectAdded: boolean;
  taskAdded:    boolean;
};

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  email: true, mentions: true, dueToday: true, approvals: true, projectAdded: true, taskAdded: true,
};

// Merge a stored jsonb value over the all-on defaults so a missing/partial blob
// (legacy rows, pre-migration) behaves as "everything on".
export function mergeNotificationPrefs(raw: unknown): NotificationPrefs {
  const out = { ...DEFAULT_NOTIFICATION_PREFS };
  if (raw && typeof raw === 'object') {
    const r = raw as Record<string, unknown>;
    for (const k of Object.keys(out) as (keyof NotificationPrefs)[]) {
      if (typeof r[k] === 'boolean') out[k] = r[k] as boolean;
    }
  }
  return out;
}

// type → the notification_prefs toggle that gates its email. Types absent here
// never email (e.g. `time_edit_requested` → approvers get the in-app bell only).
const EMAIL_PREF_KEY: Partial<Record<NotificationType, keyof NotificationPrefs>> = {
  mentioned:         'mentions',
  task_due:          'dueToday',
  time_edit_decided: 'approvals',
  project_added:     'projectAdded',
  task_assigned:     'taskAdded',
};

// Types whose email enriches with task fields (Title/Description/Priority/Due).
const TASK_TYPES = new Set<NotificationType>(['mentioned', 'task_due', 'task_assigned']);

// Pure gating decision: should this notification type email, given the
// recipient's prefs? Requires a mapped toggle AND the master switch AND the
// per-event switch. Unmapped types (e.g. time_edit_requested) never email.
export function shouldEmailNotification(type: NotificationType, prefs: NotificationPrefs): boolean {
  const key = EMAIL_PREF_KEY[type];
  return key != null && prefs.email && prefs[key];
}

// Pull the work-item id out of a notification link. Works for both the numeric
// and the readable project URL, e.g. `/projects/3?task=42&comment=7` and
// `/projects/romega-portal-general?task=42` → 42. Null when absent/non-numeric.
export function parseTaskIdFromLink(link: string | null | undefined): number | null {
  if (!link) return null;
  const m = /[?&]task=(\d+)/.exec(link);
  return m ? Number(m[1]) : null;
}

// Newly-added assignee user ids (in `after` but not `before`), numeric + unique,
// order-preserving. Used by the work-item PATCH route to fire `task_assigned`.
export function newlyAddedAssignees(
  before: Array<number | string>,
  after:  Array<number | string>,
): number[] {
  const beforeSet = new Set(before.map(Number));
  const seen = new Set<number>();
  const out: number[] = [];
  for (const v of after.map(Number)) {
    if (!Number.isFinite(v) || beforeSet.has(v) || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

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

  // ── Email delivery (additive; best-effort; never blocks/breaks the action) ──
  // The in-app bell above is unconditional. Email is opt-out via per-user
  // prefs and only for types mapped in EMAIL_PREF_KEY.
  const prefKey = EMAIL_PREF_KEY[input.type];
  if (prefKey) {
    try {
      const { email, prefs } = await getRecipientEmailPrefs(sb, input.userId);
      if (email && shouldEmailNotification(input.type, prefs)) {
        let task: NotificationTaskMeta | null = null;
        if (TASK_TYPES.has(input.type)) {
          const taskId = parseTaskIdFromLink(input.link);
          if (taskId != null) task = await fetchTaskMeta(sb, taskId);
        }
        const rendered = renderNotificationEmail({
          title: input.title,
          body:  input.body ?? null,
          link:  input.link ?? null,
          task,
        });
        // Fire-and-forget — does NOT block this function's return.
        sendEmail({ to: email, subject: rendered.subject, html: rendered.html, text: rendered.text });
      }
    } catch (err) {
      // Email is strictly secondary to the bell row — swallow everything.
      console.error('[notifications] email step failed:', err instanceof Error ? err.message : err);
    }
  }
}

type Admin = ReturnType<typeof createAdminClient>;

// Recipient email + prefs in one query. Falls back gracefully if the
// notification_prefs column doesn't exist yet (pre-migration → all-on).
async function getRecipientEmailPrefs(
  sb: Admin, userId: number,
): Promise<{ email: string | null; prefs: NotificationPrefs }> {
  const { data, error } = await sb.from('users')
    .select('email, notification_prefs')
    .eq('id', userId)
    .maybeSingle();
  if (error) {
    const { data: d2 } = await sb.from('users').select('email').eq('id', userId).maybeSingle();
    return {
      email: ((d2 as { email?: string | null } | null)?.email) ?? null,
      prefs: { ...DEFAULT_NOTIFICATION_PREFS },
    };
  }
  const row = data as { email?: string | null; notification_prefs?: unknown } | null;
  return {
    email: row?.email ?? null,
    prefs: mergeNotificationPrefs(row?.notification_prefs),
  };
}

// Minimal task fields for the email enricher (title/description/priority/due).
async function fetchTaskMeta(sb: Admin, taskId: number): Promise<NotificationTaskMeta | null> {
  const { data } = await sb.from('work_items')
    .select('name, description, priority, target_date')
    .eq('id', taskId)
    .maybeSingle();
  if (!data) return null;
  const r = data as Record<string, unknown>;
  return {
    title:       (r.name as string | null) ?? null,
    description: (r.description as string | null) ?? null,
    priority:    (r.priority as string | null) ?? null,
    dueDate:     (r.target_date as string | null) ?? null,
  };
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

// Reply in a comment thread → notify the thread's participants (in-app only;
// `thread_reply` has no email toggle, so it never emails).
export async function notifyThreadReply(opts: {
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
    type:    'thread_reply',
    title:   `${opts.actorName} replied to a thread in ${opts.projectName}`,
    body:    opts.snippet ?? null,
    link:    opts.link,
  })));
}

// Attendance time-edit request → notify whoever decides the current step: the
// requester's supervisor (main lead), or the admins at the admin step.
export async function notifyTimeEditRequested(opts: {
  recipientIds: number[];
  actorId:      number;
  actorName:    string;
  dateLabel:    string;
  /** 'admin' after the supervisor approved (or when the supervisor step was skipped). */
  step?:           'supervisor' | 'admin';
  supervisorName?: string | null;
}): Promise<void> {
  const unique = [...new Set(opts.recipientIds)];
  const body = opts.step === 'admin' && opts.supervisorName
    ? `For ${opts.dateLabel}. Approved by ${opts.supervisorName}; needs an admin decision in Time Approvals.`
    : opts.step === 'admin'
      ? `For ${opts.dateLabel}. Needs an admin decision in Time Approvals.`
      : `For ${opts.dateLabel}. Review it in Time Approvals.`;
  await Promise.all(unique.map(userId => createNotification({
    userId,
    actorId: opts.actorId,
    type:    'time_edit_requested',
    title:   `${opts.actorName} requested a time correction`,
    body,
    link:    '/attendance/requests',
  })));
}

// Receipt for the requester once their correction is filed (in-app only).
// No actorId: the requester is both actor and recipient here, and
// createNotification skips self-notifications when an actor is given.
export async function notifyTimeEditReceived(opts: {
  recipientId: number;
  dateLabel:   string;
  step:        'supervisor' | 'admin';
}): Promise<void> {
  await createNotification({
    userId: opts.recipientId,
    type:   'time_edit_received',
    title:  'Your time correction was received',
    body:   opts.step === 'supervisor'
      ? `Your ${opts.dateLabel} request is waiting for your supervisor, then an admin.`
      : `Your ${opts.dateLabel} request is waiting for an admin.`,
    link:   '/my-time',
  });
}

// The supervisor approved; the request now waits on an admin (in-app only).
export async function notifyTimeEditForwarded(opts: {
  recipientId:    number;
  actorId:        number;
  supervisorName: string;
  dateLabel:      string;
}): Promise<void> {
  await createNotification({
    userId:  opts.recipientId,
    actorId: opts.actorId,
    type:    'time_edit_update',
    title:   'Your supervisor approved your time correction',
    body:    `${opts.supervisorName} approved your ${opts.dateLabel} request. It now needs an admin's approval before your timesheet changes.`,
    link:    '/my-time',
  });
}

// One reminder to a supervisor who hasn't acted for 2 working days (in-app only).
export async function notifyTimeEditReminder(opts: {
  recipientId:   number;
  requesterName: string;
  dateLabel:     string;
}): Promise<void> {
  await createNotification({
    userId: opts.recipientId,
    type:   'time_edit_reminder',
    title:  `Reminder: ${opts.requesterName}'s time correction is waiting for you`,
    body:   `For ${opts.dateLabel}. Approve or reject it in Time Approvals.`,
    link:   '/attendance/requests',
  });
}

// Decision on a time-edit request → notify the IC who filed it.
export async function notifyTimeEditDecided(opts: {
  recipientId: number;
  actorId:     number;
  approved:    boolean;
  dateLabel:   string;
  comment?:    string | null;
}): Promise<void> {
  await createNotification({
    userId:  opts.recipientId,
    actorId: opts.actorId,
    type:    'time_edit_decided',
    title:   opts.approved ? 'Your time correction was approved' : 'Your time correction was declined',
    body:    opts.approved
      ? `Your ${opts.dateLabel} correction was applied to your timesheet.`
      : `Your ${opts.dateLabel} request was declined${opts.comment ? `: ${opts.comment}` : '.'}`,
    link:    '/my-time',
  });
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
    link:    await projectPathById(opts.projectId),
  });
}

// New assignee on a work item → notify them (in-app + email). The link encodes
// `?task=` so the email enricher can fetch task fields. Self-assignment is a
// no-op via createNotification's actor===recipient guard.
export async function notifyTaskAssigned(opts: {
  userId:   number;
  actorId:  number;
  workItem: { id: number | string; projectId: number | string; name: string };
}): Promise<void> {
  await createNotification({
    userId:  opts.userId,
    actorId: opts.actorId,
    type:    'task_assigned',
    title:   `You were assigned to "${opts.workItem.name}"`,
    body:    'You have been added as an assignee on this task.',
    link:    await projectPathById(opts.workItem.projectId, '', { task: opts.workItem.id }),
  });
}

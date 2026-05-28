// Pure decision helper for the reminder cron. Given an assignment row's
// due_at / last_reminded_at and the current time, return whether we should
// send a reminder now and which window we're in. Kept pure so the cron
// behavior can be unit-tested without Supabase or HTTP.

export type ReminderWindow = 'overdue' | 'due_1d' | 'due_3d' | 'due_7d' | null;

export type ReminderDecision =
  | { send: false; reason: string }
  | { send: true;  window: Exclude<ReminderWindow, null>; daysRemaining: number };

const DAY_MS = 24 * 60 * 60 * 1000;

// Map "days until due" to a window. Negative = overdue.
function classifyWindow(diffMs: number): ReminderWindow {
  if (diffMs < 0)                return 'overdue';
  if (diffMs <= 1 * DAY_MS)      return 'due_1d';
  if (diffMs <= 3 * DAY_MS)      return 'due_3d';
  if (diffMs <= 7 * DAY_MS)      return 'due_7d';
  return null;
}

export function decideReminder(args: {
  dueAt:           string | null;
  lastRemindedAt:  string | null;
  courseComplete:  boolean;
  now:             Date;
}): ReminderDecision {
  if (args.courseComplete) {
    return { send: false, reason: 'course already complete' };
  }
  if (!args.dueAt) {
    return { send: false, reason: 'no due date set' };
  }
  const due = new Date(args.dueAt).getTime();
  if (!Number.isFinite(due)) {
    return { send: false, reason: 'invalid due_at' };
  }

  const diffMs = due - args.now.getTime();
  const window = classifyWindow(diffMs);
  if (!window) {
    return { send: false, reason: 'more than 7 days out' };
  }

  // Cooldown: don't re-send within the same window. Use the window length
  // itself as the cooldown — so once per overdue/1d/3d/7d band.
  if (args.lastRemindedAt) {
    const last = new Date(args.lastRemindedAt).getTime();
    if (Number.isFinite(last)) {
      // For all bands, refuse to send again within 24h of the last reminder.
      // Pragmatic: avoids back-to-back overdue spam, and matches the
      // pattern other Romega reminder flows use.
      if (args.now.getTime() - last < DAY_MS) {
        return { send: false, reason: 'last reminder < 24h ago' };
      }
    }
  }

  const daysRemaining = Math.ceil(diffMs / DAY_MS);
  return { send: true, window, daysRemaining };
}

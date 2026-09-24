import { NextResponse } from 'next/server';
import { z } from 'zod';
import { revalidateTag } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { hash } from 'bcryptjs';
import { normalizeRole } from '@/lib/rbac';
import { mergeNotificationPrefs } from '@/lib/notifications';
import { route, requireSession, parseBody, badRequest, notFound } from '@/lib/api';
import { USERS_LIST_TAG } from '@/lib/cache-tags';

export const runtime = 'nodejs';

// Per-user email notification toggles. All optional + boolean; merged over the
// all-on defaults before persisting so a partial payload never wipes a key.
const notificationPrefsSchema = z.object({
  email:        z.boolean().optional(),
  mentions:     z.boolean().optional(),
  dueToday:     z.boolean().optional(),
  approvals:    z.boolean().optional(),
  projectAdded: z.boolean().optional(),
  taskAdded:    z.boolean().optional(),
});

// Identity (name, email, team, job title) is admin-owned and intentionally
// absent here — legal names and contract job titles are set by HR via
// PATCH /api/admin/users. Unknown keys are stripped by zod, so older clients
// that still send them are silently ignored rather than applied.
const profileUpdateSchema = z.object({
  password: z.string().optional(),
  reminderEnabled: z.boolean().optional(),
  reminderIntervalMinutes: z.union([z.number(), z.string()]).optional(),
  notificationPrefs: notificationPrefsSchema.optional(),
});

export const GET = route(async () => {
  const session = await requireSession();

  const admin = createAdminClient();
  const [{ data: user }, { data: teamRows }, { data: jobTitleRows }] = await Promise.all([
    admin.from('users').select('*').eq('id', session.id).maybeSingle(),
    admin.from('users').select('team').not('team', 'is', null).eq('is_active', 1),
    admin.from('users').select('job_title').not('job_title', 'is', null).eq('is_active', 1),
  ]);

  if (!user) throw notFound('User not found');

  const availableTeams = [...new Set(
    (teamRows ?? [])
      .map((r: { team: string | null }) => r.team)
      .filter((t): t is string => Boolean(t))
  )].sort();

  const availableJobTitles = [...new Set(
    (jobTitleRows ?? [])
      .map((r: { job_title: string | null }) => r.job_title)
      .filter((t): t is string => Boolean(t))
  )].sort();

  return NextResponse.json({
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      email: user.email,
      role: normalizeRole(user.role),
      team: user.team,
      jobTitle: user.job_title,
      hourlyRateUsd: user.hourly_rate_usd == null ? null : Number(user.hourly_rate_usd),
      isActive: Boolean(user.is_active),
      reminderEnabled: Boolean(user.reminder_enabled ?? 1),
      reminderIntervalMinutes: user.reminder_interval_minutes ?? 120,
      notificationPrefs: mergeNotificationPrefs(user.notification_prefs),
    },
    availableTeams,
    availableJobTitles,
  });
});

export const PUT = route(async (req: Request) => {
  const session = await requireSession();
  const body = await parseBody(req, profileUpdateSchema);

  const password = String(body.password || '');

  const VALID_INTERVALS = [30, 60, 120, 180];
  const payload: Record<string, string | number | null> = {
    updated_at: new Date().toISOString(),
  };

  if (body.reminderEnabled !== undefined) {
    payload.reminder_enabled = body.reminderEnabled ? 1 : 0;
  }
  if (body.reminderIntervalMinutes !== undefined && VALID_INTERVALS.includes(Number(body.reminderIntervalMinutes))) {
    payload.reminder_interval_minutes = Number(body.reminderIntervalMinutes);
  }

  // Merge the (partial) toggle payload over current prefs so we never clobber a
  // key the client didn't send. jsonb column → store the resolved object.
  if (body.notificationPrefs !== undefined) {
    const db = createAdminClient();
    const { data: current } = await db
      .from('users').select('notification_prefs').eq('id', session.id).maybeSingle();
    const merged = { ...mergeNotificationPrefs(current?.notification_prefs), ...body.notificationPrefs };
    (payload as Record<string, unknown>).notification_prefs = merged;
  }

  if (password) {
    if (password.length < 8) {
      throw badRequest('Password must be at least 8 characters');
    }
    payload.password_hash = await hash(password, 10);
  }

  const admin = createAdminClient();
  await admin.from('users').update(payload).eq('id', session.id);
  revalidateTag(USERS_LIST_TAG, { expire: 0 });

  const { data: updated } = await admin.from('users').select('*').eq('id', session.id).maybeSingle();
  if (!updated) throw notFound('User not found');

  return NextResponse.json({
    success: true,
    user: {
      id: updated.id,
      username: updated.username,
      name: updated.name,
      email: updated.email,
      role: normalizeRole(updated.role),
      team: updated.team,
      jobTitle: updated.job_title,
      hourlyRateUsd: updated.hourly_rate_usd == null ? null : Number(updated.hourly_rate_usd),
      isActive: Boolean(updated.is_active),
      reminderEnabled: Boolean(updated.reminder_enabled ?? 1),
      reminderIntervalMinutes: updated.reminder_interval_minutes ?? 120,
      notificationPrefs: mergeNotificationPrefs(updated.notification_prefs),
    },
  });
});

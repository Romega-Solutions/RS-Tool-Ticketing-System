import { NextResponse } from 'next/server';
import { z } from 'zod';
import { revalidateTag } from 'next/cache';
import { createAdminClient, findAuthUserByEmail } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { hash } from 'bcryptjs';
import { normalizeRole } from '@/lib/rbac';
import { mergeNotificationPrefs } from '@/lib/notifications';
import { route, requireSession, parseBody, badRequest, forbidden, notFound } from '@/lib/api';
import { recordAudit } from '@/lib/audit';
import { USERS_LIST_TAG } from '@/lib/cache-tags';

export const runtime = 'nodejs';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

const profileUpdateSchema = z.object({
  name: z.string().optional(),
  email: z.string().optional(),
  team: z.string().nullable().optional(),
  jobTitle: z.string().nullable().optional(),
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

  const name = String(body.name || '').trim();
  const password = String(body.password || '');

  if (!name) throw badRequest('Name is required');

  const admin = createAdminClient();
  const { data: current } = await admin.from('users').select('*').eq('id', session.id).maybeSingle();
  if (!current) throw notFound('User not found');

  const VALID_INTERVALS = [30, 60, 120, 180];
  const payload: Record<string, string | number | null> = {
    name,
    updated_at: new Date().toISOString(),
  };

  const changedFields: string[] = [];
  if (name !== current.name) changedFields.push('name');

  // Department stays whatever the caller sends (unrestricted, unchanged from
  // prior behavior) — but only touched when actually provided, so the profile
  // page no longer has to round-trip a value it isn't asking the user to edit.
  if (body.team !== undefined) {
    payload.team = String(body.team || '').trim() || null;
  }

  // Job title — self-editable only for leads/admins. ICs/interns can view it
  // but any attempt to actually change it is rejected server-side too.
  if (body.jobTitle !== undefined) {
    const jobTitle = String(body.jobTitle || '').trim() || null;
    if (jobTitle !== (current.job_title ?? null)) {
      if (session.role !== 'lead' && session.role !== 'admin') {
        throw forbidden('Only leads and admins can change their job title');
      }
      payload.job_title = jobTitle;
      changedFields.push('job_title');
    }
  }

  // Email — owner-editable. getSession() resolves the public.users row by the
  // email claim on the signed-in Supabase Auth user, so the Auth account's
  // email must be updated in lockstep or the next session lookup breaks.
  const currentEmail = String(current.email || '').trim().toLowerCase();
  let authUserId: string | null = null;
  if (body.email !== undefined) {
    const email = String(body.email || '').trim().toLowerCase();
    if (!email) throw badRequest('Email is required');
    if (!EMAIL_RE.test(email)) throw badRequest('Invalid email address');
    if (email !== currentEmail) {
      const { data: clash } = await admin
        .from('users').select('id').eq('email', email).neq('id', session.id).maybeSingle();
      if (clash) throw badRequest('That email is already in use');

      const authUser = await findAuthUserByEmail(admin, currentEmail);
      if (!authUser) throw badRequest('Could not locate your authentication account. Please contact an admin.');

      const { error: authErr } = await admin.auth.admin.updateUserById(authUser.id, { email, email_confirm: true });
      if (authErr) throw badRequest(`Could not update your sign-in email: ${authErr.message}`);

      payload.email = email;
      authUserId = authUser.id;
      changedFields.push('email');
    }
  }

  if (body.reminderEnabled !== undefined) {
    payload.reminder_enabled = body.reminderEnabled ? 1 : 0;
  }
  if (body.reminderIntervalMinutes !== undefined && VALID_INTERVALS.includes(Number(body.reminderIntervalMinutes))) {
    payload.reminder_interval_minutes = Number(body.reminderIntervalMinutes);
  }

  // Merge the (partial) toggle payload over current prefs so we never clobber a
  // key the client didn't send. jsonb column → store the resolved object.
  if (body.notificationPrefs !== undefined) {
    const merged = { ...mergeNotificationPrefs(current.notification_prefs), ...body.notificationPrefs };
    (payload as Record<string, unknown>).notification_prefs = merged;
  }

  if (password) {
    if (password.length < 8) {
      throw badRequest('Password must be at least 8 characters');
    }
    payload.password_hash = await hash(password, 10);
  }

  const { error: updateError } = await admin.from('users').update(payload).eq('id', session.id);
  if (updateError) {
    // Roll back the Auth email change so the two stores don't drift apart.
    if (authUserId) {
      await admin.auth.admin.updateUserById(authUserId, { email: currentEmail, email_confirm: true }).catch(() => {});
    }
    throw badRequest('Failed to update profile');
  }
  revalidateTag(USERS_LIST_TAG, { expire: 0 });

  if (changedFields.length) {
    await recordAudit({ actorId: session.id, action: 'user.self_profile_updated', targetUserId: session.id, details: { fields: changedFields } });
  }

  // The email change just landed on the Auth user, but the JWT already in
  // this browser's cookies still carries the old email claim. Refresh it now
  // so getSession() keeps resolving this request's session on the very next
  // call instead of waiting for the token's natural expiry.
  if (authUserId) {
    try {
      const supabase = await createClient();
      await supabase.auth.refreshSession();
    } catch (err) {
      console.error('[profile] session refresh after email change failed:', err);
    }
  }

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

import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { hash } from 'bcryptjs';
import { normalizeRole } from '@/lib/rbac';

export const runtime = 'nodejs';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: user } = await admin
    .from('users')
    .select('*')
    .eq('id', session.id)
    .maybeSingle();

  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const [{ data: teamRows }, { data: jobTitleRows }] = await Promise.all([
    admin.from('users').select('team').not('team', 'is', null).eq('is_active', 1),
    admin.from('users').select('job_title').not('job_title', 'is', null).eq('is_active', 1),
  ]);

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
      planeMemberId: user.plane_member_id ?? null,
      hourlyRateUsd: user.hourly_rate_usd == null ? null : Number(user.hourly_rate_usd),
      isActive: Boolean(user.is_active),
      reminderEnabled: Boolean(user.reminder_enabled ?? 1),
      reminderIntervalMinutes: user.reminder_interval_minutes ?? 120,
    },
    availableTeams,
    availableJobTitles,
  });
}

export async function PUT(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as {
    name?: string;
    team?: string;
    jobTitle?: string;
    password?: string;
    reminderEnabled?: boolean;
    reminderIntervalMinutes?: number;
  };

  const name = String(body.name || '').trim();
  const team = String(body.team || '').trim();
  const jobTitle = String(body.jobTitle || '').trim();
  const password = String(body.password || '');

  if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });

  const VALID_INTERVALS = [30, 60, 120, 180];
  const payload: Record<string, string | number | null> = {
    name,
    team: team || null,
    job_title: jobTitle || null,
    updated_at: new Date().toISOString(),
  };

  if (body.reminderEnabled !== undefined) {
    payload.reminder_enabled = body.reminderEnabled ? 1 : 0;
  }
  if (body.reminderIntervalMinutes !== undefined && VALID_INTERVALS.includes(Number(body.reminderIntervalMinutes))) {
    payload.reminder_interval_minutes = Number(body.reminderIntervalMinutes);
  }

  if (password) {
    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }
    payload.password_hash = await hash(password, 10);
  }

  const admin = createAdminClient();
  await admin.from('users').update(payload).eq('id', session.id);

  const { data: updated } = await admin.from('users').select('*').eq('id', session.id).maybeSingle();
  if (!updated) return NextResponse.json({ error: 'User not found' }, { status: 404 });

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
    },
  });
}

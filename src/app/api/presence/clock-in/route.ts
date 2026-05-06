import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { clockIn } from '@/lib/presence';

export const runtime = 'nodejs';

const DAY_COLS = [
  'monday_status',
  'tuesday_status',
  'wednesday_status',
  'thursday_status',
  'friday_status',
] as const;

function getWeekMonday(d: Date): string {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  const dow = copy.getDay();
  copy.setDate(copy.getDate() + (dow === 0 ? -6 : 1 - dow));
  const y = copy.getFullYear();
  const m = String(copy.getMonth() + 1).padStart(2, '0');
  const dd = String(copy.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

async function autoMarkPresent(userId: number) {
  const now = new Date();
  const dow = now.getDay();
  if (dow === 0 || dow === 6) return;
  const col = DAY_COLS[dow - 1];
  const weekStart = getWeekMonday(now);

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from('attendance')
    .select('*')
    .eq('user_id', userId)
    .eq('week_start', weekStart)
    .maybeSingle();

  if (existing) {
    if (!existing[col]) {
      const { error } = await admin
        .from('attendance')
        .update({ [col]: 'present', submitted_at: now.toISOString() })
        .eq('id', existing.id);
      if (error) console.error('[autoMarkPresent] update error:', error.message);
    }
  } else {
    const { error } = await admin.from('attendance').insert({
      user_id: userId,
      week_start: weekStart,
      [col]: 'present',
      submitted_at: now.toISOString(),
    });
    if (error) console.error('[autoMarkPresent] insert error:', error.message);
  }
}

function localDateStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from('timesheets')
    .select('id, clocked_in_at')
    .eq('user_id', session.id)
    .is('clocked_out_at', null)
    .maybeSingle();

  if (existing) {
    clockIn({ userId: session.id, name: session.name, role: session.role, team: session.team, clockedInAt: existing.clocked_in_at });
    return NextResponse.json({ timesheetId: existing.id, clockedInAt: existing.clocked_in_at, resumed: true });
  }

  const now = new Date().toISOString();
  const { data: inserted, error: insertErr } = await admin
    .from('timesheets')
    .insert({ user_id: session.id, clocked_in_at: now, date: localDateStr() })
    .select('id')
    .single();

  if (insertErr || !inserted) {
    console.error('[clock-in] insert error:', insertErr?.message);
    return NextResponse.json({ error: 'Failed to start clock-in session' }, { status: 500 });
  }

  clockIn({ userId: session.id, name: session.name, role: session.role, team: session.team, clockedInAt: now });
  await autoMarkPresent(session.id);

  return NextResponse.json({ timesheetId: inserted.id, clockedInAt: now });
}

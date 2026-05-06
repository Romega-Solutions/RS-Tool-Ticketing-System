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

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { confirmed?: boolean; notes?: string } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  if (!body.confirmed) {
    return NextResponse.json({ error: 'Clock-in confirmation is required.' }, { status: 400 });
  }

  const notes = body.notes?.trim() || null;

  const admin = createAdminClient();
  const { data: existingWithNotes, error: existingError } = await admin
    .from('timesheets')
    .select('id, clocked_in_at, notes')
    .eq('user_id', session.id)
    .is('clocked_out_at', null)
    .maybeSingle();

  const existing = existingError
    ? await admin
        .from('timesheets')
        .select('id, clocked_in_at')
        .eq('user_id', session.id)
        .is('clocked_out_at', null)
        .maybeSingle()
        .then(result => result.data)
    : existingWithNotes;

  if (existing) {
    clockIn({ userId: session.id, name: session.name, role: session.role, team: session.team, clockedInAt: existing.clocked_in_at });
    return NextResponse.json({
      timesheetId: existing.id,
      clockedInAt: existing.clocked_in_at,
      resumed: true,
      notes: 'notes' in existing ? (existing.notes ?? null) : null,
      noteSaved: 'notes' in existing,
    });
  }

  const now = new Date().toISOString();
  let noteSaved = false;
  let inserted: { id: number } | null = null;
  let insertErr: { message?: string } | null = null;

  const insertWithNotes = await admin
    .from('timesheets')
    .insert({ user_id: session.id, clocked_in_at: now, date: localDateStr(), notes })
    .select('id')
    .single();

  inserted = insertWithNotes.data;
  insertErr = insertWithNotes.error;
  noteSaved = !insertErr;

  if (insertErr && notes) {
    const fallbackInsert = await admin
      .from('timesheets')
      .insert({ user_id: session.id, clocked_in_at: now, date: localDateStr() })
      .select('id')
      .single();
    inserted = fallbackInsert.data;
    insertErr = fallbackInsert.error;
    noteSaved = false;
  }

  if (insertErr || !inserted) {
    console.error('[clock-in] insert error:', insertErr?.message);
    return NextResponse.json({ error: 'Failed to start clock-in session' }, { status: 500 });
  }

  clockIn({ userId: session.id, name: session.name, role: session.role, team: session.team, clockedInAt: now });
  await autoMarkPresent(session.id);

  return NextResponse.json({ timesheetId: inserted.id, clockedInAt: now, notes, noteSaved });
}

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { clockIn } from '@/lib/presence';
import { getPhotoResolver } from '@/lib/orgchart';
import { decideClockInAllowed } from '@/lib/overtime-policy';
import { weeklySecondsForUser, activeApprovalUntil, enforceUserOpenSession } from '@/lib/overtime-server';
import { route, requireSession, parseBody, badRequest } from '@/lib/api';

export const runtime = 'nodejs';

const DAY_COLS = [
  'monday_status',
  'tuesday_status',
  'wednesday_status',
  'thursday_status',
  'friday_status',
] as const;

const clockInSchema = z.object({
  confirmed: z.boolean().optional(),
  notes: z.string().optional(),
});

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

export const POST = route(async (req: Request) => {
  const session = await requireSession();
  const body = await parseBody(req, clockInSchema);

  if (!body.confirmed) {
    throw badRequest('Clock-in confirmation is required.');
  }

  const notes = body.notes?.trim() || null;
  const photoUrl = (await getPhotoResolver())({ name: session.name, email: session.email });

  const admin = createAdminClient();
  const nowDate = new Date();
  // Close-on-read first: never silently resume a session that is already over
  // the cap. If the open session must end, this closes it now; the weekly total
  // below then reflects it and the gate blocks a fresh start.
  await enforceUserOpenSession(admin, session.id, nowDate);
  // Completed seconds earlier this week — fixed for the whole open session and
  // used by the weekly OT badge / browser guardrail. The open row (null
  // duration) is naturally excluded.
  const weekSecondsBefore = await weeklySecondsForUser(admin, session.id, nowDate);
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
    clockIn({ userId: session.id, name: session.name, role: session.role, team: session.team, clockedInAt: existing.clocked_in_at, weekSecondsBefore, photoUrl });
    return NextResponse.json({
      timesheetId: existing.id,
      clockedInAt: existing.clocked_in_at,
      resumed: true,
      weekSecondsBefore,
      notes: 'notes' in existing ? (existing.notes ?? null) : null,
      noteSaved: 'notes' in existing,
    });
  }

  // Weekly-cap gate: block a NEW session when the contractor has already hit
  // 15h this week with no active admin approval. Resuming an open session
  // (handled above) is always allowed; the cron enforces caps on running ones.
  const approvedUntil = await activeApprovalUntil(admin, session.id);
  const gate = decideClockInAllowed({
    role:              session.role,
    weekSecondsBefore,
    approvedUntil,
    now:               nowDate,
  });
  if (!gate.allowed) {
    return NextResponse.json(
      { error: 'Weekly 15-hour limit reached. Request overtime approval to continue.', code: 'weekly_cap' },
      { status: 403 },
    );
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

  clockIn({ userId: session.id, name: session.name, role: session.role, team: session.team, clockedInAt: now, weekSecondsBefore, photoUrl });
  await autoMarkPresent(session.id);

  return NextResponse.json({ timesheetId: inserted.id, clockedInAt: now, weekSecondsBefore, notes, noteSaved });
});

/**
 * One-off seed: realistic Mon–Fri attendance (status + clock-in/out sessions,
 * including split/multi-session days and overnight day-crossing shifts) for
 * the week of 2026-08-24, across the staging roster.
 *
 * Writes directly to Postgres via the service-role Supabase client, computing
 * duration/overtime the same way `POST /api/admin/timesheets` does. The plan
 * data below is hand-authored to already satisfy that route's validation (no
 * overlapping sessions, no session landing on an Absent/Leave day) — this
 * script does not re-run those checks itself.
 *
 *   npx tsx --env-file=.env scripts/seed-attendance-week.ts
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { computeOvertime, WEEKLY_CAP_SECONDS } from '../src/lib/utils';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_KEY || SERVICE_KEY === 'your-service-role-key-here') {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env first.');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const WEEK_START = '2026-08-24';

type DayStatus = { mon?: string; tue?: string; wed?: string; thu?: string; fri?: string };
type Session = [inDate: string, inTime: string, outDate: string, outTime: string];
type Plan = { id: number; status: DayStatus; notes: string; sessions: Session[] };

function toLocalISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// The host (and this script's process) runs in Asia/Manila, matching the
// rest of this staging data — so a naive "YYYY-MM-DDTHH:MM:SS" parses as the
// correct local wall-clock time with no explicit offset needed.
function localTime(dateStr: string, timeStr: string): Date {
  return new Date(`${dateStr}T${timeStr}:00`);
}

// Users 20 (Rowan Okonkwo), 28 (Emile Vega), 29 (Cleo Salazar),
// 30 (Hugo Delacroix), 33 (Vera Holloway) were already seeded via the admin
// UI/API in this same session — intentionally not repeated here.
const plans: Plan[] = [
  { id: 39, status: { mon: 'present', tue: 'present', wed: 'present', thu: 'present', fri: 'present' },
    notes: 'Thu evening: production incident on-call.',
    sessions: [
      ['2026-08-24', '09:00', '2026-08-24', '12:00'],
      ['2026-08-25', '09:00', '2026-08-25', '12:00'],
      ['2026-08-26', '09:00', '2026-08-26', '12:00'],
      ['2026-08-27', '09:00', '2026-08-27', '12:00'],
      ['2026-08-27', '20:00', '2026-08-27', '21:30'],
      ['2026-08-28', '09:00', '2026-08-28', '12:00'],
    ] },
  { id: 34, status: { mon: 'present', tue: 'present', wed: 'absent', thu: 'present', fri: 'present' },
    notes: 'Wed: called in sick.',
    sessions: [
      ['2026-08-24', '09:00', '2026-08-24', '12:00'],
      ['2026-08-25', '09:00', '2026-08-25', '12:00'],
      ['2026-08-27', '09:00', '2026-08-27', '12:00'],
      ['2026-08-28', '09:00', '2026-08-28', '12:00'],
    ] },
  { id: 25, status: { mon: 'present', tue: 'present', wed: 'present', thu: 'present', fri: 'present' },
    notes: '',
    sessions: [
      ['2026-08-24', '09:00', '2026-08-24', '12:00'],
      ['2026-08-25', '09:00', '2026-08-25', '12:00'],
      ['2026-08-26', '09:00', '2026-08-26', '12:00'],
      ['2026-08-27', '09:00', '2026-08-27', '12:00'],
      ['2026-08-28', '09:00', '2026-08-28', '11:30'],
    ] },
  { id: 35, status: { mon: 'present', tue: 'present', wed: 'present', thu: 'present', fri: 'wfh' },
    notes: '',
    sessions: [
      ['2026-08-24', '09:00', '2026-08-24', '12:00'],
      ['2026-08-25', '09:00', '2026-08-25', '12:00'],
      ['2026-08-26', '09:00', '2026-08-26', '12:00'],
      ['2026-08-27', '09:00', '2026-08-27', '12:00'],
      ['2026-08-28', '09:00', '2026-08-28', '11:00'],
    ] },
  { id: 36, status: { mon: 'present', tue: 'present', wed: 'present', thu: 'present', fri: 'present' },
    notes: '',
    sessions: [
      ['2026-08-24', '09:00', '2026-08-24', '11:00'],
      ['2026-08-25', '09:00', '2026-08-25', '11:00'],
      ['2026-08-26', '09:00', '2026-08-26', '10:00'],
      ['2026-08-26', '13:00', '2026-08-26', '14:30'],
      ['2026-08-27', '09:00', '2026-08-27', '11:00'],
      ['2026-08-28', '09:00', '2026-08-28', '11:00'],
    ] },
  { id: 42, status: { mon: 'present', tue: '', wed: 'present', thu: '', fri: 'present' },
    notes: 'Wed night: on-call coverage.',
    sessions: [
      ['2026-08-24', '10:00', '2026-08-24', '13:00'],
      ['2026-08-26', '22:00', '2026-08-27', '01:00'],
      ['2026-08-28', '13:00', '2026-08-28', '16:00'],
    ] },
  { id: 43, status: { mon: 'present', tue: 'present', wed: 'present', thu: 'leave', fri: 'present' },
    notes: 'Thu: approved leave.',
    sessions: [
      ['2026-08-24', '09:00', '2026-08-24', '12:00'],
      ['2026-08-25', '09:00', '2026-08-25', '12:00'],
      ['2026-08-26', '09:00', '2026-08-26', '12:00'],
      ['2026-08-28', '09:00', '2026-08-28', '12:00'],
    ] },
  { id: 44, status: { mon: 'wfh', tue: 'wfh', wed: 'present', thu: 'wfh', fri: 'wfh' },
    notes: '',
    sessions: [
      ['2026-08-24', '09:00', '2026-08-24', '11:00'],
      ['2026-08-25', '09:00', '2026-08-25', '11:00'],
      ['2026-08-26', '09:00', '2026-08-26', '11:00'],
      ['2026-08-27', '09:00', '2026-08-27', '11:00'],
      ['2026-08-28', '09:00', '2026-08-28', '10:30'],
    ] },
  { id: 45, status: { mon: 'present', tue: 'present', wed: 'present', thu: 'present', fri: 'present' },
    notes: '',
    sessions: [
      ['2026-08-24', '09:00', '2026-08-24', '11:00'],
      ['2026-08-25', '09:00', '2026-08-25', '10:00'],
      ['2026-08-25', '13:00', '2026-08-25', '15:00'],
      ['2026-08-26', '09:00', '2026-08-26', '11:00'],
      ['2026-08-27', '09:00', '2026-08-27', '11:00'],
      ['2026-08-28', '09:00', '2026-08-28', '11:00'],
    ] },
  { id: 46, status: { mon: 'present', tue: 'present', wed: 'present', thu: 'present', fri: 'absent' },
    notes: 'Fri: unplanned absence.',
    sessions: [
      ['2026-08-24', '09:00', '2026-08-24', '12:00'],
      ['2026-08-25', '09:00', '2026-08-25', '12:00'],
      ['2026-08-26', '09:00', '2026-08-26', '12:00'],
      ['2026-08-27', '09:00', '2026-08-27', '12:00'],
    ] },
  { id: 47, status: { mon: 'present', tue: 'present', wed: 'present', thu: 'present', fri: 'present' },
    notes: 'Tue: on-site client visit.',
    sessions: [
      ['2026-08-24', '09:00', '2026-08-24', '12:00'],
      ['2026-08-25', '09:00', '2026-08-25', '10:30'],
      ['2026-08-25', '14:00', '2026-08-25', '16:00'],
      ['2026-08-26', '09:00', '2026-08-26', '12:00'],
      ['2026-08-27', '09:00', '2026-08-27', '12:00'],
      ['2026-08-28', '09:00', '2026-08-28', '12:00'],
    ] },
  { id: 48, status: { mon: 'present', tue: 'present', wed: 'present', thu: 'present', fri: 'present' },
    notes: '',
    sessions: [
      ['2026-08-24', '09:00', '2026-08-24', '12:00'],
      ['2026-08-25', '09:00', '2026-08-25', '12:00'],
      ['2026-08-26', '09:00', '2026-08-26', '12:00'],
      ['2026-08-27', '09:00', '2026-08-27', '12:00'],
      ['2026-08-28', '09:00', '2026-08-28', '12:00'],
    ] },
  { id: 37, status: { mon: 'present', tue: 'present', wed: 'present', thu: 'present', fri: 'present' },
    notes: '',
    sessions: [
      ['2026-08-24', '09:00', '2026-08-24', '11:00'],
      ['2026-08-25', '09:00', '2026-08-25', '11:00'],
      ['2026-08-26', '09:00', '2026-08-26', '11:00'],
      ['2026-08-27', '09:00', '2026-08-27', '11:00'],
      ['2026-08-28', '09:00', '2026-08-28', '11:00'],
    ] },
  { id: 21, status: { mon: 'present', tue: 'present', wed: 'present', thu: 'present', fri: 'wfh' },
    notes: '',
    sessions: [
      ['2026-08-24', '09:00', '2026-08-24', '12:00'],
      ['2026-08-25', '09:00', '2026-08-25', '12:00'],
      ['2026-08-26', '09:00', '2026-08-26', '12:00'],
      ['2026-08-27', '09:00', '2026-08-27', '12:00'],
      ['2026-08-28', '09:00', '2026-08-28', '11:00'],
    ] },
  { id: 49, status: { mon: 'present', tue: 'present', wed: '', thu: 'present', fri: '' },
    notes: 'Tue & Thu nights: on-call coverage.',
    sessions: [
      ['2026-08-24', '10:00', '2026-08-24', '13:00'],
      ['2026-08-25', '23:00', '2026-08-26', '02:00'],
      ['2026-08-27', '23:00', '2026-08-28', '02:00'],
    ] },
  { id: 51, status: { mon: 'present', tue: 'present', wed: 'present', thu: 'present', fri: 'present' },
    notes: '',
    sessions: [
      ['2026-08-24', '09:00', '2026-08-24', '11:30'],
      ['2026-08-25', '09:00', '2026-08-25', '11:30'],
      ['2026-08-26', '09:00', '2026-08-26', '11:30'],
      ['2026-08-27', '09:00', '2026-08-27', '11:30'],
      ['2026-08-28', '09:00', '2026-08-28', '11:30'],
    ] },
];

async function upsertAttendance(userId: number, status: DayStatus, notes: string) {
  const payload = {
    monday_status:    status.mon || null,
    tuesday_status:   status.tue || null,
    wednesday_status: status.wed || null,
    thursday_status:  status.thu || null,
    friday_status:    status.fri || null,
    saturday_status:  null,
    sunday_status:    null,
    notes:             notes || null,
    submitted_at:      new Date().toISOString(),
  };
  const { data: existing } = await sb
    .from('attendance')
    .select('id')
    .eq('user_id', userId)
    .eq('week_start', WEEK_START)
    .maybeSingle();
  if (existing) {
    const { error } = await sb.from('attendance').update(payload).eq('id', existing.id);
    if (error) throw new Error(`attendance update failed for user ${userId}: ${error.message}`);
  } else {
    const { error } = await sb.from('attendance').insert({ user_id: userId, week_start: WEEK_START, ...payload });
    if (error) throw new Error(`attendance insert failed for user ${userId}: ${error.message}`);
  }
}

async function baseSecondsFor(userId: number): Promise<number> {
  const { data } = await sb.from('users').select('approved_hours_per_week').eq('id', userId).maybeSingle();
  const hrs = (data as { approved_hours_per_week?: number | null } | null)?.approved_hours_per_week;
  return hrs != null && Number.isFinite(Number(hrs)) ? Number(hrs) * 3600 : WEEKLY_CAP_SECONDS;
}

async function insertSessions(userId: number, sessions: Session[]) {
  const baseSeconds = await baseSecondsFor(userId);
  let weekSecondsSoFar = 0;
  // Chronological order so overtime accrues the same way the admin API
  // would compute it if these were added one at a time.
  const sorted = [...sessions].sort(
    (a, b) => localTime(a[0], a[1]).getTime() - localTime(b[0], b[1]).getTime(),
  );
  for (const [inD, inT, outD, outT] of sorted) {
    const inDate  = localTime(inD, inT);
    const outDate = localTime(outD, outT);
    const durationSeconds = Math.round((outDate.getTime() - inDate.getTime()) / 1000);
    const { isOvertime, overtimeSeconds } = computeOvertime(weekSecondsSoFar, durationSeconds, baseSeconds);
    const { error } = await sb.from('timesheets').insert({
      user_id:          userId,
      clocked_in_at:    inDate.toISOString(),
      clocked_out_at:   outDate.toISOString(),
      duration_seconds: durationSeconds,
      is_overtime:      isOvertime ? 1 : 0,
      overtime_seconds: isOvertime ? overtimeSeconds : null,
      date:              toLocalISO(inDate),
    });
    if (error) throw new Error(`session insert failed for user ${userId} on ${inD}: ${error.message}`);
    weekSecondsSoFar += durationSeconds;
  }
}

async function main() {
  for (const p of plans) {
    await upsertAttendance(p.id, p.status, p.notes);
    await insertSessions(p.id, p.sessions);
    console.log(`✓ user ${p.id}: status set, ${p.sessions.length} session(s) inserted`);
  }
  console.log('\nDone.');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

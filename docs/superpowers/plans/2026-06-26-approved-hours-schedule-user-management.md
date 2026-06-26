# Approved Hours + Work Schedule + User-Management — Implementation Plan

> **For agentic workers:** Execute task-by-task. Steps use checkbox (`- [ ]`) syntax.
> **No commits** per agreed scope — work stays in the working tree. Each task ends with a **verify** step instead of a commit. Run `npm test` / `npm run verify` at the checkpoints.

**Goal:** Make each user's weekly cap/overtime per-user via an editable "Approved Hours", add an editable PHT work schedule with an auto-DST-derived PST display, and finish the User-Management table (new columns, column show/hide filter, clickable-name profile popup).

**Architecture:** The overtime engine already runs on a per-week *allowance* (`base + grants`); only the `base` is hardcoded 15h. We swap the base for `users.approved_hours_per_week` (default 15 ⇒ identical behavior) behind resilient helpers, then surface it + a PHT/PST schedule in User Management. PST is derived (never stored) via `Intl` + IANA `America/Los_Angeles`.

**Tech Stack:** Next.js 16, Supabase Postgres + Drizzle, React client components, Base UI (`Dialog`), vitest, native `Intl`.

---

## Task 1: Schema + migration (per-user columns)

**Files:**
- Modify: `src/db/schema.ts` (users table, ~line 4-32)
- Create: `drizzle/0007_user_approved_hours_schedule.sql`

- [ ] **Step 1:** In `src/db/schema.ts`, add to the `users` table (after `hourlyRateUsd`):
```ts
  // Weekly allotted hours — the per-user base for the overtime allowance/cap.
  approvedHoursPerWeek: integer('approved_hours_per_week').notNull().default(15),
  // Daily work schedule in PHT ('HH:MM' 24h). PST is derived on render, never stored.
  schedulePhtStart: text('schedule_pht_start'),
  schedulePhtEnd:   text('schedule_pht_end'),
```
- [ ] **Step 2:** Create `drizzle/0007_user_approved_hours_schedule.sql`:
```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS approved_hours_per_week integer NOT NULL DEFAULT 15;
ALTER TABLE users ADD COLUMN IF NOT EXISTS schedule_pht_start text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS schedule_pht_end  text;
```
- [ ] **Step 3 (verify):** `npx tsc --noEmit` parses (or defer to the Task 11 build). Do **not** run `drizzle-kit generate` (schema is drifted). Applying 0007 to a live DB is gated (Task 11 note).

---

## Task 2: Per-user base in the pure overtime functions (TDD)

**Files:**
- Modify: `src/lib/utils.ts` (`isOvertime` ~32, `computeOvertime` ~41)
- Modify: `src/lib/overtime-policy.ts` (`AutoClockOutInput` ~17, `planEnforcement` ~62)
- Test: `src/__tests__/overtime.test.ts`, `src/__tests__/overtime-policy.test.ts`

- [ ] **Step 1: Failing tests** — append to `src/__tests__/overtime.test.ts`:
```ts
describe('per-user base (approved hours ≠ 15h)', () => {
  it('isOvertime respects a supplied cap', () => {
    expect(isOvertime(18 * H, 20 * H)).toBe(false);
    expect(isOvertime(20 * H + 1, 20 * H)).toBe(true);
    expect(isOvertime(16 * H)).toBe(true); // default still 15h
  });
  it('computeOvertime measures the slice beyond a supplied base', () => {
    expect(computeOvertime(19 * H, 2 * H, 20 * H)).toEqual({ isOvertime: true, overtimeSeconds: 1 * H });
    expect(computeOvertime(14 * H, 2 * H)).toEqual({ isOvertime: true, overtimeSeconds: 1 * H }); // default 15h
  });
});
```
And append to `src/__tests__/overtime-policy.test.ts`:
```ts
describe('planEnforcement — per-user base', () => {
  it('computes the OT slice against baseSeconds, not the flat 15h', () => {
    // 20h approved base, +0 grant ⇒ allowance 20h. 19h done + 2h run = 21h ≥ 20h → close; OT = beyond 20h = 1h.
    const r = planEnforcement({ clockedInAt: ago(2 * H), weekSecondsBefore: 19 * H, allowanceSeconds: 20 * H, baseSeconds: 20 * H, now: NOW });
    expect(r).toMatchObject({ close: true, isOvertime: true, overtimeSeconds: 1 * H });
  });
});
```
- [ ] **Step 2: Run, expect FAIL.** `npm test -- overtime` → fails (extra arg ignored / wrong result).
- [ ] **Step 3: Implement** in `src/lib/utils.ts`:
```ts
export function isOvertime(weekSecondsTotal: number, capSeconds = WEEKLY_CAP_SECONDS): boolean {
  return weekSecondsTotal > capSeconds;
}
export function computeOvertime(weekSecondsBefore: number, durationSeconds: number, baseSeconds = WEEKLY_CAP_SECONDS): {
  isOvertime: boolean; overtimeSeconds: number;
} {
  const overtimeSeconds = Math.max(0, Math.min(durationSeconds, weekSecondsBefore + durationSeconds - baseSeconds));
  return { isOvertime: overtimeSeconds > 0, overtimeSeconds };
}
```
In `src/lib/overtime-policy.ts`: add `baseSeconds?: number;` to `AutoClockOutInput`; in `planEnforcement`, change the compute call to `computeOvertime(input.weekSecondsBefore, decision.elapsedSec, input.baseSeconds)`.
- [ ] **Step 4: Run, expect PASS.** `npm test -- overtime`.

---

## Task 3: Schedule PHT→PST derivation lib (TDD)

**Files:**
- Create: `src/lib/schedule.ts`
- Test: `src/__tests__/schedule.test.ts`

- [ ] **Step 1: Failing test** — `src/__tests__/schedule.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { phtToPacific, pacificRange, formatPhtRange } from '@/lib/schedule';

describe('phtToPacific (DST-aware, IANA America/Los_Angeles)', () => {
  it('winter date → PST (PHT − 16h)', () => {
    expect(phtToPacific('21:00', new Date('2027-01-15T00:00:00+08:00'))).toEqual({ time: '05:00', zone: 'PST' });
  });
  it('summer date → PDT (PHT − 15h)', () => {
    expect(phtToPacific('21:00', new Date('2027-07-15T00:00:00+08:00'))).toEqual({ time: '06:00', zone: 'PDT' });
  });
  it('holds across future years (next 15y)', () => {
    expect(phtToPacific('21:00', new Date('2035-01-15T00:00:00+08:00')).zone).toBe('PST');
    expect(phtToPacific('21:00', new Date('2040-07-15T00:00:00+08:00')).zone).toBe('PDT');
  });
  it('midnight end converts', () => {
    expect(phtToPacific('00:00', new Date('2027-01-15T00:00:00+08:00')).time).toBe('08:00');
  });
});

describe('pacificRange / formatPhtRange', () => {
  it('formats a PHT range', () => {
    expect(formatPhtRange('21:00', '00:00')).toBe('21:00 - 00:00');
  });
  it('derives a Pacific range with zone', () => {
    expect(pacificRange('21:00', '00:00', new Date('2027-01-15T00:00:00+08:00'))).toEqual({ range: '05:00 - 08:00', zone: 'PST' });
  });
  it('returns null when either side is missing', () => {
    expect(pacificRange(null, '00:00')).toBeNull();
  });
});
```
- [ ] **Step 2: Run, expect FAIL** (module not found). `npm test -- schedule`.
- [ ] **Step 3: Implement** — `src/lib/schedule.ts`:
```ts
// PHT (Asia/Manila, UTC+8, no DST) work schedule ↔ US Pacific (America/Los_Angeles),
// derived live so the displayed PST/PDT always follows daylight saving. No stored PST.

const PACIFIC_TZ = 'America/Los_Angeles';

function isHhmm(s: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

/**
 * Convert a PHT "HH:MM" wall-clock time to the equivalent US Pacific wall-clock
 * time on `refDate` (default now). DST-aware via the IANA tz database.
 */
export function phtToPacific(hhmm: string, refDate: Date = new Date()): { time: string; zone: 'PST' | 'PDT' } {
  const [h, m] = hhmm.split(':');
  // Anchor the PHT time to refDate's calendar day, expressed as a UTC instant.
  const y = refDate.getUTCFullYear();
  const mo = String(refDate.getUTCMonth() + 1).padStart(2, '0');
  const d = String(refDate.getUTCDate()).padStart(2, '0');
  const instant = new Date(`${y}-${mo}-${d}T${h}:${m}:00+08:00`);

  const time = new Intl.DateTimeFormat('en-US', {
    timeZone: PACIFIC_TZ, hour12: false, hour: '2-digit', minute: '2-digit',
  }).format(instant).replace('24:', '00:');

  const zonePart = new Intl.DateTimeFormat('en-US', { timeZone: PACIFIC_TZ, timeZoneName: 'short' })
    .formatToParts(instant).find(p => p.type === 'timeZoneName')?.value ?? 'PST';
  const zone: 'PST' | 'PDT' = zonePart === 'PDT' ? 'PDT' : 'PST';
  return { time, zone };
}

/** "21:00 - 00:00" from two PHT endpoints, or '' when incomplete. */
export function formatPhtRange(start: string | null, end: string | null): string {
  if (!start || !end) return '';
  return `${start} - ${end}`;
}

/** Pacific range + zone for display, or null when either PHT endpoint is missing/invalid. */
export function pacificRange(
  start: string | null, end: string | null, refDate: Date = new Date(),
): { range: string; zone: 'PST' | 'PDT' } | null {
  if (!start || !end || !isHhmm(start) || !isHhmm(end)) return null;
  const a = phtToPacific(start, refDate);
  const b = phtToPacific(end, refDate);
  return { range: `${a.time} - ${b.time}`, zone: a.zone };
}
```
- [ ] **Step 4: Run, expect PASS.** `npm test -- schedule`.

---

## Task 4: Per-user base helpers + allowance wiring

**Files:**
- Modify: `src/lib/overtime-server.ts`

- [ ] **Step 1:** Add base helpers (after `grantedOvertimeForUser`, ~line 70):
```ts
/** This user's weekly base seconds = approved_hours_per_week × 3600 (default 15h, resilient to a missing column). */
export async function baseWeeklySecondsForUser(admin: Admin, userId: number): Promise<number> {
  try {
    const { data } = await admin.from('users').select('approved_hours_per_week').eq('id', userId).maybeSingle();
    const hrs = (data as { approved_hours_per_week?: number | null } | null)?.approved_hours_per_week;
    return hrs != null && Number.isFinite(Number(hrs)) ? Number(hrs) * 3600 : WEEKLY_CAP_SECONDS;
  } catch { return WEEKLY_CAP_SECONDS; }
}

/** Batched base seconds; every requested id present, defaulting to the 15h base. */
export async function baseWeeklySecondsForUsers(admin: Admin, userIds: number[]): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  for (const id of userIds) out.set(id, WEEKLY_CAP_SECONDS);
  if (userIds.length === 0) return out;
  try {
    const { data } = await admin.from('users').select('id, approved_hours_per_week').in('id', userIds);
    for (const u of (data ?? []) as { id: number; approved_hours_per_week: number | null }[]) {
      if (u.approved_hours_per_week != null && Number.isFinite(Number(u.approved_hours_per_week))) {
        out.set(u.id, Number(u.approved_hours_per_week) * 3600);
      }
    }
  } catch { /* leave defaults */ }
  return out;
}
```
- [ ] **Step 2:** Rewrite `weeklyAllowanceForUser` (~line 73):
```ts
export async function weeklyAllowanceForUser(admin: Admin, userId: number, now: Date): Promise<number> {
  const [base, grants] = await Promise.all([baseWeeklySecondsForUser(admin, userId), grantedOvertimeForUser(admin, userId, now)]);
  return base + grants;
}
```
- [ ] **Step 3:** In `weeklyAllowanceForUsers` (~line 83): replace the seed loop `for (const id of userIds) out.set(id, WEEKLY_CAP_SECONDS);` with `const out = await baseWeeklySecondsForUsers(admin, userIds);` (and drop the now-redundant `new Map`/seed). Keep the grant-add loop, but it must **add** onto the base: `out.set(r.user_id, (out.get(r.user_id) ?? WEEKLY_CAP_SECONDS) + (r.granted_seconds ?? 0));` (unchanged).
- [ ] **Step 4:** In `enforceUserOpenSession` (~line 122): add base to the `Promise.all` and pass `baseSeconds` to `planEnforcement`:
```ts
  const [weekSecondsBefore, allowanceSeconds, baseSeconds] = await Promise.all([
    weeklySecondsForUser(admin, userId, now),
    weeklyAllowanceForUser(admin, userId, now),
    baseWeeklySecondsForUser(admin, userId),
  ]);
  const plan = planEnforcement({ clockedInAt: open.clocked_in_at as string, weekSecondsBefore, allowanceSeconds, baseSeconds, now });
```
- [ ] **Step 5:** In `sweepOpenSessions` (~line 176-205): after building `allowanceByUserId`, also fetch `const baseByUserId = await baseWeeklySecondsForUsers(admin, userIds);` and pass `baseSeconds: baseByUserId.get(row.user_id) ?? WEEKLY_CAP_SECONDS` into `planEnforcement`.
- [ ] **Step 6 (verify):** `npm test` — existing overtime-server-dependent tests still green (defaults preserve behavior).

---

## Task 5: Attendance API allotted base + overtime-slice callers

**Files:**
- Modify: `src/app/api/attendance/route.ts` (~line 264-296)
- Modify: `src/app/api/presence/clock-out/route.ts:31`, `src/app/api/admin/timesheets/route.ts:175`, `src/app/api/admin/timesheets/force-clock-out/route.ts:57`, `src/app/api/attendance/edit-requests/route.ts:110`
- Modify: `src/app/(app)/live/page.tsx:67`, `src/components/presence-panel.tsx:44`, `src/components/who-is-in-panel.tsx:107`

- [ ] **Step 1:** In `src/app/api/attendance/route.ts`, add `approved_hours_per_week` to the `teamUsers` select, then seed the allowance from it. Replace `for (const id of userIds) allowanceByUser[id] = WEEKLY_CAP_SECONDS;` with a per-user base from the fetched users:
```ts
  const baseByUser: Record<number, number> = {};
  for (const u of teamUsers as { id: number; approved_hours_per_week?: number | null }[]) {
    baseByUser[u.id] = (u.approved_hours_per_week != null ? Number(u.approved_hours_per_week) : 15) * 3600;
  }
  for (const id of userIds) allowanceByUser[id] = baseByUser[id] ?? WEEKLY_CAP_SECONDS;
```
(The grant-add loop below stays as-is; `allowanceByUser[g.user_id] = (allowanceByUser[g.user_id] ?? WEEKLY_CAP_SECONDS) + grant`.)
- [ ] **Step 2:** For each `computeOvertime(weekSecondsBefore, durationSeconds)` caller, fetch the user's base and pass it. Pattern (clock-out has `session.id`; the admin/edit routes have the row's `user_id`):
```ts
import { baseWeeklySecondsForUser } from '@/lib/overtime-server';
const baseSeconds = await baseWeeklySecondsForUser(admin, userId); // session.id for clock-out
const { isOvertime, overtimeSeconds } = computeOvertime(weekSecondsBefore, durationSeconds, baseSeconds);
```
Apply to all four routes listed above.
- [ ] **Step 3:** For the three "over" indicator panels, pass the per-user base into `isOvertime`. Each renders per user and already has that user's row; thread `approved_hours_per_week` into the data the panel receives and call `isOvertime(weekSecondsBefore + secs, (approvedHours ?? 15) * 3600)`. If a panel's data source makes this disproportionately costly, leave that panel on the 15h default and add a `// soft indicator: 15h default` comment. (These are cosmetic.)
- [ ] **Step 4 (verify):** `npm run verify` (type-check catches any missed signature).

---

## Task 6: Users API — approvedHours + schedule fields

**Files:**
- Modify: `src/app/api/admin/users/route.ts`

- [ ] **Step 1:** Add validators near `parseHourlyRate` (~line 66):
```ts
function parseApprovedHours(raw: unknown): { ok: true; value: number } | { ok: false; error: string } {
  if (raw === undefined || raw === null || raw === '') return { ok: true, value: 15 };
  const n = typeof raw === 'number' ? raw : Number(String(raw).trim());
  if (!Number.isInteger(n)) return { ok: false, error: 'Approved hours must be a whole number' };
  if (n < 1 || n > 60) return { ok: false, error: 'Approved hours must be between 1 and 60' };
  return { ok: true, value: n };
}
const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
function parseHhmm(raw: unknown): { ok: true; value: string | null } | { ok: false; error: string } {
  if (raw === undefined || raw === null || raw === '') return { ok: true, value: null };
  const s = String(raw).trim();
  if (!HHMM_RE.test(s)) return { ok: false, error: 'Time must be HH:MM (24-hour)' };
  return { ok: true, value: s };
}
```
- [ ] **Step 2:** Extend every users column select+map (the **four** sites: GET ~92/96, POST insert ~252 + return ~264, PATCH return ~387/417) to include `approved_hours_per_week, schedule_pht_start, schedule_pht_end` and map to `approvedHoursPerWeek: u.approved_hours_per_week == null ? 15 : Number(u.approved_hours_per_week)`, `schedulePhtStart: u.schedule_pht_start ?? null`, `schedulePhtEnd: u.schedule_pht_end ?? null`.
- [ ] **Step 3:** POST body type + validation + insert: add `approvedHoursPerWeek?`, `schedulePhtStart?`, `schedulePhtEnd?`; validate with the new parsers; add `approved_hours_per_week: approvedHours.value, schedule_pht_start: phtStart.value, schedule_pht_end: phtEnd.value` to the insert object.
- [ ] **Step 4:** PATCH body type + updates: add the three fields; on each `!== undefined`, validate and set `updates.approved_hours_per_week` / `updates.schedule_pht_start` / `updates.schedule_pht_end`. Add `body.approvedHoursPerWeek !== undefined || body.schedulePhtStart !== undefined || body.schedulePhtEnd !== undefined` to the `otherFieldChanged` audit condition.
- [ ] **Step 5 (verify):** `npm run verify`.

---

## Task 7: Admin users page — select + map

**Files:**
- Modify: `src/app/(app)/admin/users/page.tsx:12-34`

- [ ] **Step 1:** Add `approved_hours_per_week, schedule_pht_start, schedule_pht_end` to the `.select(...)` and to the `.map(...)`: `approvedHoursPerWeek: u.approved_hours_per_week == null ? 15 : Number(u.approved_hours_per_week)`, `schedulePhtStart: (u.schedule_pht_start as string | null) ?? null`, `schedulePhtEnd: (u.schedule_pht_end as string | null) ?? null`.
- [ ] **Step 2 (verify):** type-check (Task 11 build).

---

## Task 8: User-Management table — types, columns, edit/create

**Files:**
- Modify: `src/components/user-management-table.tsx`

- [ ] **Step 1:** Extend `UserRow` (+`approvedHoursPerWeek: number; schedulePhtStart: string | null; schedulePhtEnd: string | null`), `EditState` (+`approvedHoursPerWeek: string; schedulePhtStart: string; schedulePhtEnd: string`), `NewUserForm` + `EMPTY_FORM` (+ same three, `approvedHoursPerWeek: '15'`, schedule `''`), and `SortKey` (add `'approvedHoursPerWeek'`). In `compareUsers` add `if (key === 'approvedHoursPerWeek') return a.approvedHoursPerWeek - b.approvedHoursPerWeek;`.
- [ ] **Step 2:** `startEdit` — seed the three new fields from the user (`String(user.approvedHoursPerWeek)`, `user.schedulePhtStart ?? ''`, `user.schedulePhtEnd ?? ''`).
- [ ] **Step 3:** `saveEdit` PATCH body — add `approvedHoursPerWeek: Number(editForm.approvedHoursPerWeek) || 15, schedulePhtStart: editForm.schedulePhtStart || null, schedulePhtEnd: editForm.schedulePhtEnd || null`.
- [ ] **Step 4:** Add header `<SortableTh label="Approved Hours" k="approvedHoursPerWeek" .../>` and two plain `<th>`s ("Schedule PHT", "Schedule PST"), and the matching `<td>`s:
  - **Approved Hours**: view → `<span>{user.approvedHoursPerWeek} hrs</span>`; edit → `<input type="number" min={1} max={60} value={editForm.approvedHoursPerWeek} ...>`.
  - **Schedule PHT**: view → `{user.schedulePhtStart && user.schedulePhtEnd ? formatPhtRange(...) : '—'}`; edit → two `<input type="time">` (start/end).
  - **Schedule PST**: view → derived `const pst = pacificRange(user.schedulePhtStart, user.schedulePhtEnd); pst ? `${pst.range}` + small `{pst.zone}` tag : '—'`; no edit input (read-only).
  - `import { formatPhtRange, pacificRange } from '@/lib/schedule';`
- [ ] **Step 5:** Add the three fields to the **Add User** modal form (Approved Hours number default 15; two `type="time"` schedule inputs), and include them in `newForm` submit (already sent via `JSON.stringify(newForm)` — ensure the form keys match the API: rename to `approvedHoursPerWeek/schedulePhtStart/schedulePhtEnd`).
- [ ] **Step 6:** Update the empty-state `colSpan={11}` to the new column count.
- [ ] **Step 7 (verify):** `npm run verify`.

---

## Task 9: User-Management table — column show/hide filter

**Files:**
- Modify: `src/components/user-management-table.tsx`

- [ ] **Step 1:** Define the optional columns + default-visible set + a localStorage hook:
```ts
type ColKey = 'role'|'team'|'dateOfBirth'|'startDate'|'endDate'|'driveUrl'|'memberCode'|'hourlyRateUsd'|'approvedHoursPerWeek'|'schedulePht'|'schedulePst'|'isActive';
const COLUMNS: { key: ColKey; label: string }[] = [
  { key:'role',label:'Role' },{ key:'team',label:'Team' },{ key:'approvedHoursPerWeek',label:'Approved Hours' },
  { key:'schedulePht',label:'Schedule PHT' },{ key:'schedulePst',label:'Schedule PST' },{ key:'isActive',label:'Active' },
  { key:'dateOfBirth',label:'Birth Date' },{ key:'startDate',label:'Start Date' },{ key:'endDate',label:'End Date' },
  { key:'driveUrl',label:'File' },{ key:'memberCode',label:'Member Code' },{ key:'hourlyRateUsd',label:'Rate (USD/hr)' },
];
const DEFAULT_VISIBLE: ColKey[] = ['role','team','approvedHoursPerWeek','isActive'];
const COLS_KEY = 'usersTableColumns:v1';
```
- [ ] **Step 2:** State `const [visibleCols, setVisibleCols] = useState<Set<ColKey>>(new Set(DEFAULT_VISIBLE));` hydrated from localStorage in a `useEffect` (read `COLS_KEY`, parse the array, fall back to default), and persisted whenever it changes. Helper `const show = (k: ColKey) => visibleCols.has(k);`.
- [ ] **Step 3:** Add a "Columns" button next to "Add User" that opens a small popover (a plain absolutely-positioned `div` toggled by state, dismiss on outside click) listing a checkbox per `COLUMNS` entry, toggling membership in `visibleCols`. Name + Actions are always shown (not in the list).
- [ ] **Step 4:** Wrap each optional `<th>` and its `<td>` in `{show('key') && (...)}`. Name and Actions stay unconditional. Compute the live colSpan for the empty row as `1 + visibleCols.size + 1`.
- [ ] **Step 5 (verify):** `npm run verify`; manually confirm default shows only Name, Role, Team, Approved Hours, Active, Actions.

---

## Task 10: User-Management table — clickable-name profile popup

**Files:**
- Modify: `src/components/user-management-table.tsx`
- Reference: `src/components/ui/dialog.tsx` (Base UI Dialog)

- [ ] **Step 1:** State `const [profileUser, setProfileUser] = useState<UserRow | null>(null);`. Make the name a button (text style, not blue): `<button onClick={() => setProfileUser(user)} className="text-left font-medium text-(--rs-neutral-grey-900) hover:underline cursor-pointer">{user.name}</button>` (keep the username·email sub-line).
- [ ] **Step 2:** Render a `Dialog` (open when `profileUser`) showing the **full** record — name/username/email, role, team, approved hours, Schedule PHT (`formatPhtRange`) + Schedule PST (`pacificRange` with zone), birth/start/end dates, member code, rate, drive link, active. Read-only rows (label/value grid).
- [ ] **Step 3:** Footer "Edit" button → `setProfileUser(null); startEdit(profileUser!);` (drops into the existing inline-edit row); plus a Close button.
- [ ] **Step 4 (verify):** `npm run verify`; click a name → popup shows all fields incl. hidden ones; Edit enters inline edit.

---

## Task 11: Guard test + full verify

**Files:**
- Modify: `src/__tests__/supabase-write-columns.test.ts` (if it enumerates user columns)

- [ ] **Step 1:** Open the guard test; if it lists the `users` write columns, add `approved_hours_per_week`, `schedule_pht_start`, `schedule_pht_end`.
- [ ] **Step 2 (verify):** `npm test` (all green) then `npm run verify` (lint + build).
- [ ] **Step 3 (gated, do NOT run without go-ahead):** apply `drizzle/0007_user_approved_hours_schedule.sql` to dev then prod via `scripts/apply-migration.ts`. Until applied, the helpers fall back to 15h.

---

## Self-review

- **Spec coverage:** §2 data → T1; §3 wiring (helpers/allowance/OT-slice/panels) → T2,T4,T5; §4 schedule → T3; §5.1 columns → T6,T7,T8; §5.2 filter → T9; §5.3 popup → T10; §6 tests → T2,T3,T11. ✔ All sections mapped.
- **No placeholders:** new files/pure fns fully coded; existing-file edits give exact snippets + line refs. ✔
- **Type consistency:** `approvedHoursPerWeek`/`schedulePhtStart`/`schedulePhtEnd` used identically across schema, API, page, table; `baseSeconds`/`capSeconds` params default to `WEEKLY_CAP_SECONDS` everywhere. ✔

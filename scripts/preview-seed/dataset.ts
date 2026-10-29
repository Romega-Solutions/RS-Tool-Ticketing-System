// Turns the anonymized structure of the source database into fake rows.
//
// Pure and deterministic (seeded PRNG, injected clock) so it can be unit
// tested and so re-running the seed produces the same people and tasks.
// Nothing personal is carried over: names, emails, birthdays, rates, bank
// details, photos, notes and task text are all made up here. What is kept is
// shape: roles, departments, who reports to whom, active/inactive, tool
// access, projects and their board columns, task counts per column, and who
// is assigned to what.

import { computeOvertime, WEEKLY_CAP_SECONDS } from '../../src/lib/utils';
import { defaultToolAccess, normalizeRole } from '../../src/lib/rbac';
import { allocateProjectSlug, slugifyProjectName } from '../../src/lib/project-slug';
import { allocatePositionSlug, slugifyPositionTitle } from '../../src/lib/recruiting/position-slug';
import { SEED_EMAIL_DOMAIN, SEED_MARKER } from './guards';

// ── Source structure (read-only, no personal fields) ────────────────────────

export type SourceUser = {
  id: number;
  role: string;              // raw role, e.g. 'founder', 'admin', 'lead'
  team: string | null;
  isActive: boolean;
  isOnboarding: boolean;
  toolAccess: string[];
  approvedHours: number | null;
};
export type SourceReporting = { userId: number; reportsTo: number | null; displayOrder: number; isHidden: boolean };
export type SourceSecondary = { userId: number; alsoReportsTo: number };
export type SourceDepartment = { name: string; color: string | null; displayOrder: number };
export type SourceProject = { id: number; team: string | null; archived: boolean; network: number };
export type SourceState = {
  id: number; projectId: number; name: string; color: string; group: string; sequence: number; isDefault: boolean;
};
export type SourceMember = { projectId: number; userId: number; role: string };
export type SourceWorkItem = {
  id: number; projectId: number; stateId: number | null; parentId: number | null;
  archived: boolean; priority: string; createdBy: number | null;
};
export type SourceAssignee = { workItemId: number; userId: number };
export type SourcePosition = { isOpen: boolean; employmentType: string; placementType: string; openings: number };

export type Structure = {
  users: SourceUser[];
  reporting: SourceReporting[];
  secondary: SourceSecondary[];
  departments: SourceDepartment[];
  projects: SourceProject[];
  states: SourceState[];
  members: SourceMember[];
  workItems: SourceWorkItem[];
  assignees: SourceAssignee[];
  positions: SourcePosition[];
};

// ── Fake dataset ────────────────────────────────────────────────────────────

export type TestRole = 'founder' | 'admin' | 'lead' | 'ic' | 'intern';

export const TEST_ACCOUNTS: Readonly<Record<TestRole, { email: string; name: string }>> = Object.freeze({
  founder: { email: `founder${SEED_EMAIL_DOMAIN}`, name: 'Fiona Founder (Test)' },
  admin:   { email: `admin${SEED_EMAIL_DOMAIN}`,   name: 'Adam Admin (Test)' },
  lead:    { email: `lead${SEED_EMAIL_DOMAIN}`,    name: 'Leah Lead (Test)' },
  ic:      { email: `ic${SEED_EMAIL_DOMAIN}`,      name: 'Ian IC (Test)' },
  intern:  { email: `intern${SEED_EMAIL_DOMAIN}`,  name: 'Iris Intern (Test)' },
});

export type FakeUser = {
  key: string;
  email: string;
  name: string;
  username: string;
  role: string;
  team: string | null;
  jobTitle: string;
  isActive: boolean;
  isOnboarding: boolean;
  toolAccess: string[];
  approvedHours: number;
  hourlyRateUsd: number | null;
  reportsToKey: string | null;
  hasReportingRow: boolean;
  displayOrder: number;
  isHidden: boolean;
  secondaryKeys: string[];
  testRole: TestRole | null;
};
export type FakeState = { key: string; name: string; color: string; group: string; sequence: number; isDefault: boolean };
export type FakeItem = {
  key: string; name: string; stateKey: string | null; parentKey: string | null; archived: boolean;
  priority: string; createdByKey: string | null; sequenceId: number; assigneeKeys: string[];
  createdAt: string; completedAt: string | null;
};
export type FakeProject = {
  key: string; name: string; identifier: string; slug: string; team: string | null; archived: boolean;
  network: number; description: string; states: FakeState[]; items: FakeItem[];
  members: { userKey: string; role: string }[];
};
export type FakePosition = {
  jobTitle: string; slug: string; client: string; isOpen: boolean; employmentType: string;
  placementType: string; openings: number; jobDescription: string;
};
export type FakeAttendance = { userKey: string; weekStart: string; statuses: Record<WeekdayColumn, string | null> };
export type FakeTimesheet = {
  userKey: string; date: string; clockedInAt: string; clockedOutAt: string;
  durationSeconds: number; isOvertime: boolean; overtimeSeconds: number | null;
};

export type FakeDataset = {
  departments: SourceDepartment[];
  users: FakeUser[];
  projects: FakeProject[];
  positions: FakePosition[];
  attendance: FakeAttendance[];
  timesheets: FakeTimesheet[];
};

export const FAKE_HOURLY_RATE_USD = 9.99; // obviously fake, same for everyone

const WEEKDAY_COLUMNS = ['monday_status', 'tuesday_status', 'wednesday_status', 'thursday_status', 'friday_status', 'saturday_status', 'sunday_status'] as const;
export type WeekdayColumn = (typeof WEEKDAY_COLUMNS)[number];

const FIRST_NAMES = [
  'Avery', 'Blake', 'Casey', 'Devon', 'Emery', 'Finley', 'Gray', 'Harper', 'Indigo', 'Jules',
  'Kai', 'Logan', 'Morgan', 'Noel', 'Oakley', 'Parker', 'Quinn', 'Reese', 'Sage', 'Tatum',
  'Umber', 'Vale', 'Wren', 'Xen', 'Yael', 'Zion',
];
const LAST_NAMES = [
  'Ashgrove', 'Birchwell', 'Cedarby', 'Dunmore', 'Elmstead', 'Fernhill', 'Glenrock', 'Hollins',
  'Ivybrook', 'Junipero', 'Kestrelton', 'Larkspur', 'Maplewood', 'Northam', 'Oakridge', 'Pinecrest',
  'Quarrydale', 'Redfern', 'Stonebridge', 'Thornbury', 'Underhill', 'Valemont', 'Willowby',
];

const ROLE_TITLES: Record<string, string> = {
  intern: 'Intern', ic: 'Specialist', lead: 'Team Lead', admin: 'Administrator',
};

// mulberry32 — tiny deterministic PRNG.
export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fakePersonName(index: number): string {
  const first = FIRST_NAMES[index % FIRST_NAMES.length];
  const last = LAST_NAMES[Math.floor(index / FIRST_NAMES.length + index * 7) % LAST_NAMES.length];
  return `${first} ${last}`;
}

function emailLocal(name: string, index: number): string {
  return `${name.toLowerCase().replace(/[^a-z]+/g, '.')}.${index}`;
}

function jobTitleFor(role: string, team: string | null): string {
  const raw = role.trim().toLowerCase();
  if (raw === 'founder' || raw === 'ceo') return 'Founder';
  const base = ROLE_TITLES[normalizeRole(role)] ?? 'Specialist';
  return team ? `${team} ${base}` : base;
}

// Monday (YYYY-MM-DD) of the Manila week containing `now`, shifted by `weeks`.
function manilaMonday(now: Date, weeks: number): Date {
  const manila = new Date(now.getTime() + 8 * 3600_000);
  const day = manila.getUTCDay(); // 0 = Sunday
  const diffToMonday = (day + 6) % 7;
  const monday = new Date(Date.UTC(manila.getUTCFullYear(), manila.getUTCMonth(), manila.getUTCDate() - diffToMonday));
  monday.setUTCDate(monday.getUTCDate() + weeks * 7);
  return monday;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export type BuildOptions = { now: Date; seed?: number; weeksOfAttendance?: number };

export function buildFakeDataset(structure: Structure, options: BuildOptions): FakeDataset {
  const rand = prng(options.seed ?? 20261018);

  // ── People ────────────────────────────────────────────────────────────────
  const reportingByUser = new Map(structure.reporting.map((r) => [r.userId, r]));
  const sourceById = new Map(structure.users.map((u) => [u.id, u]));
  const activeReports = (id: number) => structure.reporting.filter(
    (r) => r.reportsTo === id && sourceById.get(r.userId)?.isActive,
  ).length;

  const rawRole = (u: SourceUser) => u.role.trim().toLowerCase();
  const sorted = [...structure.users].sort((a, b) => a.id - b.id);
  const founderSrc = sorted.find((u) => u.isActive && rawRole(u) === 'founder')
    ?? sorted.find((u) => u.isActive && rawRole(u) === 'ceo')
    ?? null;
  const adminSrc = sorted.find((u) => u.isActive && rawRole(u) === 'admin' && u.id !== founderSrc?.id) ?? null;
  const leadSrc = sorted
    .filter((u) => u.isActive && normalizeRole(u.role) === 'lead')
    .sort((a, b) => activeReports(b.id) - activeReports(a.id) || a.id - b.id)[0] ?? null;

  const keyFor = (id: number) => `u${id}`;
  const users: FakeUser[] = [];
  let nameIndex = 0;

  const testRoleFor = (id: number): TestRole | null => {
    if (founderSrc && id === founderSrc.id) return 'founder';
    if (adminSrc && id === adminSrc.id) return 'admin';
    if (leadSrc && id === leadSrc.id) return 'lead';
    return null;
  };

  for (const u of sorted) {
    const testRole = testRoleFor(u.id);
    const rep = reportingByUser.get(u.id);
    const name = testRole ? TEST_ACCOUNTS[testRole].name : fakePersonName(nameIndex);
    const email = testRole ? TEST_ACCOUNTS[testRole].email : `${emailLocal(name, nameIndex)}${SEED_EMAIL_DOMAIN}`;
    if (!testRole) nameIndex++;
    users.push({
      key: keyFor(u.id),
      email,
      name,
      username: email.split('@')[0],
      role: u.role,
      team: u.team,
      jobTitle: jobTitleFor(u.role, u.team),
      isActive: testRole ? true : u.isActive,
      isOnboarding: testRole ? false : u.isOnboarding,
      toolAccess: [...u.toolAccess],
      approvedHours: u.approvedHours ?? 15,
      hourlyRateUsd: FAKE_HOURLY_RATE_USD,
      reportsToKey: rep?.reportsTo != null && sourceById.has(rep.reportsTo) ? keyFor(rep.reportsTo) : null,
      hasReportingRow: Boolean(rep),
      displayOrder: rep?.displayOrder ?? 0,
      isHidden: rep?.isHidden ?? false,
      secondaryKeys: structure.secondary
        .filter((s) => s.userId === u.id && sourceById.has(s.alsoReportsTo))
        .map((s) => keyFor(s.alsoReportsTo)),
      testRole,
    });
  }

  const addSynthetic = (partial: Partial<FakeUser> & Pick<FakeUser, 'key' | 'role' | 'name' | 'email'>): FakeUser => {
    const team = partial.team ?? null;
    const role = partial.role;
    const user: FakeUser = {
      username: partial.email.split('@')[0],
      team,
      jobTitle: jobTitleFor(role, team),
      isActive: true,
      isOnboarding: false,
      toolAccess: defaultToolAccess(normalizeRole(role), team),
      approvedHours: 15,
      hourlyRateUsd: FAKE_HOURLY_RATE_USD,
      reportsToKey: null,
      hasReportingRow: false,
      displayOrder: 0,
      isHidden: false,
      secondaryKeys: [],
      testRole: null,
      ...partial,
    };
    users.push(user);
    return user;
  };

  // Every role account must exist even if the source has no matching person.
  if (!founderSrc) {
    addSynthetic({ key: 'test-founder', role: 'founder', team: 'Management', testRole: 'founder', ...TEST_ACCOUNTS.founder });
  }
  if (!adminSrc) {
    addSynthetic({ key: 'test-admin', role: 'admin', team: 'Technical', testRole: 'admin', ...TEST_ACCOUNTS.admin });
  }
  const lead = leadSrc
    ? users.find((u) => u.key === keyFor(leadSrc.id))!
    : addSynthetic({ key: 'test-lead', role: 'lead', team: 'Sales', testRole: 'lead', ...TEST_ACCOUNTS.lead });
  // The lead account always keeps the lead tools (Attendance, PM, Briefing).
  lead.toolAccess = [...new Set([...lead.toolAccess, ...defaultToolAccess('lead', lead.team)])];

  // A small, known team under the lead account so the reporting chain can be
  // checked two levels deep:  lead → IC (test), Senior → intern (test), intern
  const synthName = () => { const n = fakePersonName(nameIndex); nameIndex++; return n; };
  const senior = (() => {
    const name = synthName();
    return addSynthetic({
      key: 'test-senior', role: 'ic', team: lead.team, name,
      email: `${emailLocal(name, nameIndex)}${SEED_EMAIL_DOMAIN}`,
      reportsToKey: lead.key, hasReportingRow: true,
    });
  })();
  senior.jobTitle = `${lead.team ? `${lead.team} ` : ''}Senior Specialist`;
  addSynthetic({
    key: 'test-ic', role: 'ic', team: lead.team, testRole: 'ic',
    reportsToKey: lead.key, hasReportingRow: true, ...TEST_ACCOUNTS.ic,
  });
  addSynthetic({
    key: 'test-intern', role: 'intern', team: lead.team, testRole: 'intern',
    reportsToKey: senior.key, hasReportingRow: true, ...TEST_ACCOUNTS.intern,
  });
  {
    const name = synthName();
    addSynthetic({
      key: 'test-intern-2', role: 'intern', team: lead.team, name,
      email: `${emailLocal(name, nameIndex)}${SEED_EMAIL_DOMAIN}`,
      reportsToKey: senior.key, hasReportingRow: true,
    });
  }

  const userKeys = new Set(users.map((u) => u.key));
  const mapUser = (id: number | null) => (id != null && userKeys.has(keyFor(id)) ? keyFor(id) : null);

  // ── Projects, board columns, tasks ───────────────────────────────────────
  const takenSlugs = new Set<string>();
  const projects: FakeProject[] = [...structure.projects]
    .sort((a, b) => a.id - b.id)
    .map((p, index) => {
      const letter = String.fromCharCode(65 + (index % 26));
      const name = `${p.team ?? 'General'} Sample Project ${letter}${index >= 26 ? Math.floor(index / 26) : ''}`;
      const slug = allocateProjectSlug(slugifyProjectName(name), takenSlugs);
      takenSlugs.add(slug);
      const states = structure.states
        .filter((s) => s.projectId === p.id)
        .sort((a, b) => a.sequence - b.sequence)
        .map((s) => ({
          key: `s${s.id}`, name: s.name, color: s.color, group: s.group,
          sequence: s.sequence, isDefault: s.isDefault,
        }));
      const stateGroup = new Map(states.map((s) => [s.key, s.group]));
      const items = structure.workItems
        .filter((w) => w.projectId === p.id)
        .sort((a, b) => a.id - b.id)
        .map((w, i) => {
          const stateKey = w.stateId != null && stateGroup.has(`s${w.stateId}`) ? `s${w.stateId}` : null;
          const daysAgo = 1 + Math.floor(rand() * 60);
          const createdAt = new Date(options.now.getTime() - daysAgo * 86_400_000).toISOString();
          const done = stateKey != null && stateGroup.get(stateKey) === 'completed';
          return {
            key: `w${w.id}`,
            name: `Sample task ${i + 1}`,
            stateKey,
            parentKey: w.parentId != null ? `w${w.parentId}` : null,
            archived: w.archived,
            priority: w.priority,
            createdByKey: mapUser(w.createdBy),
            sequenceId: i + 1,
            assigneeKeys: structure.assignees
              .filter((a) => a.workItemId === w.id)
              .map((a) => mapUser(a.userId))
              .filter((k): k is string => k !== null),
            createdAt,
            completedAt: done ? new Date(Math.min(options.now.getTime(), new Date(createdAt).getTime() + 3 * 86_400_000)).toISOString() : null,
          };
        });
      const itemKeys = new Set(items.map((i) => i.key));
      for (const item of items) if (item.parentKey && !itemKeys.has(item.parentKey)) item.parentKey = null;
      return {
        key: `p${p.id}`,
        name,
        identifier: `PV${letter}${index >= 26 ? Math.floor(index / 26) : ''}`,
        slug,
        team: p.team,
        archived: p.archived,
        network: p.network,
        description: `${SEED_MARKER} Fake project for preview testing.`,
        states,
        items,
        members: structure.members
          .filter((m) => m.projectId === p.id)
          .map((m) => ({ userKey: mapUser(m.userId), role: m.role }))
          .filter((m): m is { userKey: string; role: string } => m.userKey !== null),
      };
    });

  // ── Positions ────────────────────────────────────────────────────────────
  const takenPositionSlugs = new Set<string>();
  const positions: FakePosition[] = structure.positions.map((p, i) => {
    const jobTitle = `Sample Position ${i + 1} (${p.employmentType === 'part_time' ? 'Part-time' : 'Full-time'})`;
    const slug = allocatePositionSlug(slugifyPositionTitle(jobTitle), takenPositionSlugs);
    takenPositionSlugs.add(slug);
    return {
      jobTitle, slug, client: 'Sample Client', isOpen: p.isOpen, employmentType: p.employmentType,
      placementType: p.placementType, openings: p.openings,
      jobDescription: `${SEED_MARKER} Made-up position for preview testing.`,
    };
  });

  // ── Attendance + timesheets (made up, recent weeks) ──────────────────────
  const attendance: FakeAttendance[] = [];
  const timesheets: FakeTimesheet[] = [];
  const weeks = options.weeksOfAttendance ?? 2;
  for (const user of users.filter((u) => u.isActive)) {
    for (let w = weeks; w >= 1; w--) {
      const monday = manilaMonday(options.now, -w);
      const statuses = Object.fromEntries(WEEKDAY_COLUMNS.map((c) => [c, null])) as Record<WeekdayColumn, string | null>;
      let weekSeconds = 0;
      const baseSeconds = user.approvedHours > 0 ? user.approvedHours * 3600 : WEEKLY_CAP_SECONDS;
      for (let d = 0; d < 5; d++) {
        const r = rand();
        const status = r < 0.7 ? 'present' : r < 0.85 ? 'wfh' : r < 0.9 ? 'leave' : r < 0.95 ? 'absent' : null;
        statuses[WEEKDAY_COLUMNS[d]] = status;
        if (status !== 'present' && status !== 'wfh') continue;
        const day = new Date(monday);
        day.setUTCDate(monday.getUTCDate() + d);
        const date = ymd(day);
        const startHour = 8 + Math.floor(rand() * 3);              // 08:00–10:00 Manila
        const durationSeconds = (2 + Math.floor(rand() * 5)) * 1800; // 1h–3.5h
        const clockedIn = new Date(`${date}T${String(startHour).padStart(2, '0')}:00:00+08:00`);
        const clockedOut = new Date(clockedIn.getTime() + durationSeconds * 1000);
        const { isOvertime, overtimeSeconds } = computeOvertime(weekSeconds, durationSeconds, baseSeconds);
        weekSeconds += durationSeconds;
        timesheets.push({
          userKey: user.key, date, clockedInAt: clockedIn.toISOString(), clockedOutAt: clockedOut.toISOString(),
          durationSeconds, isOvertime, overtimeSeconds: isOvertime ? overtimeSeconds : null,
        });
      }
      attendance.push({ userKey: user.key, weekStart: ymd(monday), statuses });
    }
  }

  return {
    departments: [...structure.departments].sort((a, b) => a.displayOrder - b.displayOrder),
    users,
    projects,
    positions,
    attendance,
    timesheets,
  };
}

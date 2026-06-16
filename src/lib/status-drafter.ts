import { createAdminClient } from '@/lib/supabase/admin';
import { groqChat } from '@/lib/groq';

const PHT_OFFSET = '+08:00';

type TeamSummary = {
  team: string;
  member_count: number;
  submitted_reports: number;
  attendance_submitted: number;
  hours: number;
  engagements: number;
  risks: number;
  ideas: number;
  highlights: string[];
};

export type StatusDraftStats = {
  week_start: string;
  week_end: string;
  coverage: {
    total_active: number;
    reports_submitted: number;
    attendance_submitted: number;
    total_hours: number;
    missing_reports: string[];
  };
  teams: TeamSummary[];
  risks: Array<{ name: string; team: string; text: string }>;
  ideas: Array<{ name: string; team: string; text: string }>;
  low_hours: Array<{ name: string; team: string; hours: number }>;
};

export type StatusDraftRecord = {
  id?: number;
  week_start: string;
  stats: StatusDraftStats;
  draft: string | null;
  model: string | null;
  tokens_in: number | null;
  tokens_out: number | null;
  generated_at: string;
};

function parseJsonArray<T>(value: unknown): T[] {
  if (!value) return [];
  if (Array.isArray(value)) return value as T[];
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}

function parseIdeaText(value: unknown): string[] {
  if (!value) return [];
  if (typeof value !== 'string') return [];
  const trimmed = value.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed
        .map(item => typeof item === 'string' ? item : item?.description)
        .filter((item): item is string => !!item?.trim())
        .map(item => item.trim());
    }
  } catch {
    // fall through to plain text mode
  }
  return [trimmed];
}

function toPhtDate(base = new Date()) {
  return new Date(base.getTime() + 8 * 60 * 60 * 1000);
}

function mondayFromDate(date: Date) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  const day = d.getUTCDay();
  const shift = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + shift);
  return d;
}

function formatYmd(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function currentWeekStartPht(): string {
  return formatYmd(mondayFromDate(toPhtDate()));
}

export function previousWeekStartPht(): string {
  const monday = mondayFromDate(toPhtDate());
  monday.setUTCDate(monday.getUTCDate() - 7);
  return formatYmd(monday);
}

function weekRange(weekStart: string) {
  const monday = new Date(`${weekStart}T00:00:00${PHT_OFFSET}`);
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  return {
    start: weekStart,
    end: formatYmd(new Date(sunday.getTime() + 8 * 60 * 60 * 1000)),
  };
}

const STATUS_SYSTEM_PROMPT = `You write the weekly stakeholder status draft for Romega Solutions.

Style rules:
- 3 short paragraphs max.
- Plain prose only. No markdown bullets. No headings.
- Sound like an operations lead summarizing the week for stakeholders.
- Mention overall delivery signal, the main risk cluster, and one practical next step.
- Never invent names or numbers. Use only the supplied data.`;

export async function buildStatusDraftStats(weekStart: string): Promise<StatusDraftStats> {
  const supabase = createAdminClient();
  const { start, end } = weekRange(weekStart);

  const [usersRes, reportsRes, timesheetsRes, attendanceRes] = await Promise.all([
    supabase.from('users').select('id, name, team, is_active').eq('is_active', 1),
    supabase.from('weekly_reports').select('user_id, client_engagements, risks, ideas').eq('week_start', weekStart),
    supabase.from('timesheets').select('user_id, duration_seconds, date').gte('date', start).lte('date', end),
    supabase.from('attendance').select('user_id').eq('week_start', weekStart),
  ]);

  const users = usersRes.data ?? [];
  const reports = reportsRes.data ?? [];
  const timesheets = timesheetsRes.data ?? [];
  const attendance = attendanceRes.data ?? [];

  const userMap = new Map(users.map(user => [user.id, {
    name: user.name,
    team: user.team ?? 'Unassigned',
  }]));

  const reportMap = new Map(reports.map(report => [report.user_id, report]));
  const attendanceIds = new Set(attendance.map(item => item.user_id));
  const hoursByUser = new Map<number, number>();

  for (const row of timesheets) {
    hoursByUser.set(
      row.user_id,
      (hoursByUser.get(row.user_id) ?? 0) + ((row.duration_seconds ?? 0) / 3600),
    );
  }

  const teams = new Map<string, TeamSummary>();
  const risks: StatusDraftStats['risks'] = [];
  const ideas: StatusDraftStats['ideas'] = [];
  const lowHours: StatusDraftStats['low_hours'] = [];

  for (const user of users) {
    const meta = userMap.get(user.id);
    if (!meta) continue;

    const team = meta.team;
    if (!teams.has(team)) {
      teams.set(team, {
        team,
        member_count: 0,
        submitted_reports: 0,
        attendance_submitted: 0,
        hours: 0,
        engagements: 0,
        risks: 0,
        ideas: 0,
        highlights: [],
      });
    }

    const summary = teams.get(team)!;
    summary.member_count += 1;

    const hours = Math.round((hoursByUser.get(user.id) ?? 0) * 10) / 10;
    summary.hours += hours;

    if (hours > 0 && hours < 20) {
      lowHours.push({ name: meta.name, team, hours });
    }

    if (attendanceIds.has(user.id)) {
      summary.attendance_submitted += 1;
    }

    const report = reportMap.get(user.id);
    if (!report) continue;

    summary.submitted_reports += 1;

    const engagements = parseJsonArray<{ activity?: string; details?: string }>(report.client_engagements);
    const reportRisks = parseJsonArray<{ description?: string; escalation?: string }>(report.risks);
    const reportIdeas = parseIdeaText(report.ideas);

    summary.engagements += engagements.length;
    summary.risks += reportRisks.length;
    summary.ideas += reportIdeas.length;

    if (engagements[0]?.activity) {
      summary.highlights.push(`${meta.name}: ${engagements[0].activity}`);
    }

    for (const risk of reportRisks) {
      const parts = [risk.description, risk.escalation].filter(Boolean);
      if (!parts.length) continue;
      risks.push({ name: meta.name, team, text: parts.join(' | ') });
    }

    for (const idea of reportIdeas) {
      if (!idea.trim()) continue;
      ideas.push({ name: meta.name, team, text: idea.trim() });
    }
  }

  // Dedupe by name — the same person can have more than one user row (e.g. a
  // company + Gmail account, both valid in the org chart), which would otherwise
  // list (and double-nag) the same name twice and collide on the React key.
  const missingReports = [...new Set(
    users
      .filter(user => !reportMap.has(user.id))
      .map(user => user.name),
  )];

  const totalHours = Array.from(hoursByUser.values()).reduce((sum, value) => sum + value, 0);

  return {
    week_start: start,
    week_end: end,
    coverage: {
      total_active: users.length,
      reports_submitted: reports.length,
      attendance_submitted: attendanceIds.size,
      total_hours: Math.round(totalHours * 10) / 10,
      missing_reports: missingReports,
    },
    teams: Array.from(teams.values())
      .map(team => ({
        ...team,
        hours: Math.round(team.hours * 10) / 10,
        highlights: team.highlights.slice(0, 3),
      }))
      .sort((a, b) => a.team.localeCompare(b.team)),
    risks: risks.slice(0, 12),
    ideas: ideas.slice(0, 12),
    low_hours: lowHours
      .sort((a, b) => a.hours - b.hours)
      .slice(0, 10),
  };
}

export async function generateStatusDraftNarrative(stats: StatusDraftStats) {
  return groqChat(
    [
      { role: 'system', content: STATUS_SYSTEM_PROMPT },
      { role: 'user', content: `Weekly operations data for ${stats.week_start} to ${stats.week_end}:\n${JSON.stringify(stats)}` },
    ],
    { maxTokens: 260, temperature: 0.35 },
  );
}

export async function upsertStatusDraft(
  weekStart: string,
  stats: StatusDraftStats,
  draft: { text: string; model: string; tokensIn: number; tokensOut: number } | null,
  generatedBy: number | null,
): Promise<StatusDraftRecord> {
  const supabase = createAdminClient();
  const row = {
    week_start: weekStart,
    stats,
    draft: draft?.text ?? null,
    model: draft?.model ?? null,
    tokens_in: draft?.tokensIn ?? null,
    tokens_out: draft?.tokensOut ?? null,
    generated_at: new Date().toISOString(),
    generated_by: generatedBy,
  };

  const { data, error } = await supabase
    .from('status_drafts')
    .upsert(row, { onConflict: 'week_start' })
    .select()
    .single();

  if (error || !data) throw new Error(`Failed to save status draft: ${error?.message ?? 'unknown'}`);
  return data as StatusDraftRecord;
}

export async function getLatestStatusDraft(): Promise<StatusDraftRecord | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('status_drafts')
    .select('*')
    .order('week_start', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error?.message?.toLowerCase().includes('does not exist')) return null;
  return (data as StatusDraftRecord | null) ?? null;
}

export async function getRecentStatusDrafts(limit = 10): Promise<StatusDraftRecord[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('status_drafts')
    .select('*')
    .order('week_start', { ascending: false })
    .limit(limit);
  if (error?.message?.toLowerCase().includes('does not exist')) return [];
  return (data as StatusDraftRecord[] | null) ?? [];
}

export async function getStatusDraftForWeek(weekStart: string): Promise<StatusDraftRecord | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('status_drafts')
    .select('*')
    .eq('week_start', weekStart)
    .maybeSingle();
  if (error?.message?.toLowerCase().includes('does not exist')) return null;
  return (data as StatusDraftRecord | null) ?? null;
}

export async function generateStatusDraft(opts: {
  weekStart: string;
  force?: boolean;
  generatedBy?: number | null;
}): Promise<{ draft: StatusDraftRecord; fromCache: boolean }> {
  const existing = await getStatusDraftForWeek(opts.weekStart);
  if (existing && !opts.force) return { draft: existing, fromCache: true };

  const stats = await buildStatusDraftStats(opts.weekStart);

  let generated: Awaited<ReturnType<typeof generateStatusDraftNarrative>> | null = null;
  try {
    generated = await generateStatusDraftNarrative(stats);
  } catch (err) {
    console.error('Status draft generation failed; saving stats without narrative:', err);
  }

  const saved = await upsertStatusDraft(opts.weekStart, stats, generated, opts.generatedBy ?? null);
  return { draft: saved, fromCache: false };
}

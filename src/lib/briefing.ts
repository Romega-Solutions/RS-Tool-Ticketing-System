// CEO Daily Briefing builder — deterministic aggregation + 1 Groq narrative call.
// Designed to be called from both a Next.js API route (cron) and a server action
// (CEO clicking "Generate now"). All Supabase work happens here.

import { createAdminClient } from '@/lib/supabase/admin';
import { groqChat } from '@/lib/groq';

const PHT_OFFSET = '+08:00';

export type BriefingStats = {
  date:      string;
  people:    { total_active: number; clocked_in: number; total_hours: number;
               late: string[]; no_clock_in: string[] };
  reports:   { submitted_count: number; missing: string[];
               risks: Array<{ name: string; text: string }>;
               ideas: Array<{ name: string; text: string }> };
  pipeline:  { new_leads: number; new_lead_value: number;
               leads_won_today: number; leads_lost_today: number;
               open_count: number; open_value: number };
  recruiting:{ new_candidates: number; moved_to_interview: number;
               hired_today: number; open_count: number };
};

export type BriefingRecord = {
  id?:          number;
  date:         string;
  stats:        BriefingStats;
  narrative:    string | null;
  model:        string | null;
  tokens_in:    number | null;
  tokens_out:   number | null;
  generated_at: string;
};

// ─── Aggregation ──────────────────────────────────────────────────────────────

function dayBoundsUtc(dateYmd: string): { start: string; end: string } {
  return {
    start: new Date(`${dateYmd}T00:00:00${PHT_OFFSET}`).toISOString(),
    end:   new Date(`${dateYmd}T23:59:59.999${PHT_OFFSET}`).toISOString(),
  };
}

export async function buildBriefingStats(dateYmd: string): Promise<BriefingStats> {
  const supabase = createAdminClient();
  const { start, end } = dayBoundsUtc(dateYmd);

  const [users, timesheets, reports, leads, candidates] = await Promise.all([
    supabase.from('users')
      .select('id, name, is_active')
      .eq('is_active', 1),
    supabase.from('timesheets')
      .select('user_id, clocked_in_at, duration_seconds')
      .eq('date', dateYmd),
    supabase.from('weekly_reports')
      .select('user_id, risks, ideas, submitted_at')
      .gte('submitted_at', start).lte('submitted_at', end),
    supabase.from('leads')
      .select('id, stage, value, created_at, updated_at'),
    supabase.from('candidates')
      .select('id, status, created_at, updated_at'),
  ]);

  const activeUsers   = users.data       ?? [];
  const timesheetRows = timesheets.data  ?? [];
  const reportRows    = reports.data     ?? [];
  const leadRows      = leads.data       ?? [];
  const candidateRows = candidates.data  ?? [];

  const userById = new Map<number, string>(activeUsers.map(u => [u.id, u.name]));

  // People
  const clockedInUserIds = new Set(timesheetRows.map(t => t.user_id));
  const totalHours = timesheetRows.reduce(
    (s, t) => s + (t.duration_seconds ?? 0), 0) / 3600;

  // Late = clocked in after 09:15 PHT
  const lateCutoff = new Date(`${dateYmd}T09:15:00${PHT_OFFSET}`).getTime();
  const late = timesheetRows
    .filter(t => t.clocked_in_at && new Date(t.clocked_in_at).getTime() > lateCutoff)
    .map(t => userById.get(t.user_id) ?? `user#${t.user_id}`);

  const noClockIn = activeUsers
    .filter(u => !clockedInUserIds.has(u.id))
    .map(u => u.name);

  // Reports
  const submittedUserIds = new Set(reportRows.map(r => r.user_id));
  const missingReports = activeUsers
    .filter(u => !submittedUserIds.has(u.id))
    .map(u => u.name);

  const risks = reportRows
    .filter(r => r.risks?.trim())
    .map(r => ({ name: userById.get(r.user_id) ?? 'unknown', text: r.risks.trim() }));
  const ideas = reportRows
    .filter(r => r.ideas?.trim())
    .map(r => ({ name: userById.get(r.user_id) ?? 'unknown', text: r.ideas.trim() }));

  // Pipeline — lex-comparing ISO strings works for chronological order
  const createdToday = (row: { created_at: string }) =>
    row.created_at >= start && row.created_at <= end;
  const updatedToday = (row: { updated_at?: string }) =>
    !!row.updated_at && row.updated_at >= start && row.updated_at <= end;

  const newLeads = leadRows.filter(createdToday);
  const leadsWonToday  = leadRows.filter(l => l.stage === 'won'  && updatedToday(l));
  const leadsLostToday = leadRows.filter(l => l.stage === 'lost' && updatedToday(l));
  const openLeads = leadRows.filter(l => !['won', 'lost'].includes(l.stage));

  // Recruiting
  const newCandidates       = candidateRows.filter(createdToday);
  const movedToInterview    = candidateRows.filter(c => c.status === 'interview' && updatedToday(c));
  const hiredToday          = candidateRows.filter(c => c.status === 'hired'     && updatedToday(c));
  const openCandidates      = candidateRows.filter(c => !['hired', 'rejected'].includes(c.status));

  return {
    date: dateYmd,
    people: {
      total_active: activeUsers.length,
      clocked_in:   clockedInUserIds.size,
      total_hours:  Math.round(totalHours * 10) / 10,
      late,
      no_clock_in:  noClockIn,
    },
    reports: {
      submitted_count: reportRows.length,
      missing:         missingReports,
      risks,
      ideas,
    },
    pipeline: {
      new_leads:        newLeads.length,
      new_lead_value:   newLeads.reduce((s, l) => s + (l.value || 0), 0),
      leads_won_today:  leadsWonToday.length,
      leads_lost_today: leadsLostToday.length,
      open_count:       openLeads.length,
      open_value:       openLeads.reduce((s, l) => s + (l.value || 0), 0),
    },
    recruiting: {
      new_candidates:     newCandidates.length,
      moved_to_interview: movedToInterview.length,
      hired_today:        hiredToday.length,
      open_count:         openCandidates.length,
    },
  };
}

// ─── Narrative ────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You write the daily executive briefing for Romega Solutions' CEO.

Style rules:
- 2 to 4 short sentences. No bullet points. No headers. No fluff.
- Be direct. Highlight the 2 or 3 things that actually matter.
- If everything looks normal, say so in one sentence and stop.
- Never invent numbers. Only use what's in the data.
- Always end with one concrete suggestion ("Worth checking…", "Consider…", "Push…").

Output plain prose only.`;

export async function generateNarrative(stats: BriefingStats) {
  // Compact JSON keeps input tokens low (~400-700)
  const userPrompt = `Yesterday's data (PHT, ${stats.date}):\n${JSON.stringify(stats, null, 0)}`;

  return groqChat(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user',   content: userPrompt    },
    ],
    { maxTokens: 200, temperature: 0.3 },
  );
}

// ─── Persistence ──────────────────────────────────────────────────────────────

export async function upsertBriefing(
  dateYmd:   string,
  stats:     BriefingStats,
  narrative: { text: string; model: string; tokensIn: number; tokensOut: number } | null,
  generatedBy: number | null,
): Promise<BriefingRecord> {
  const supabase = createAdminClient();
  const row = {
    date:         dateYmd,
    stats,
    narrative:    narrative?.text  ?? null,
    model:        narrative?.model ?? null,
    tokens_in:    narrative?.tokensIn  ?? null,
    tokens_out:   narrative?.tokensOut ?? null,
    generated_by: generatedBy,
    generated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('briefings')
    .upsert(row, { onConflict: 'date' })
    .select()
    .single();

  if (error || !data) throw new Error(`Failed to save briefing: ${error?.message ?? 'unknown'}`);
  return data as BriefingRecord;
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getLatestBriefing(): Promise<BriefingRecord | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('briefings')
    .select('*')
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error?.message?.toLowerCase().includes('does not exist')) return null;
  return (data as BriefingRecord | null) ?? null;
}

export async function getRecentBriefings(limit = 12): Promise<BriefingRecord[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('briefings')
    .select('*')
    .order('date', { ascending: false })
    .limit(limit);
  if (error?.message?.toLowerCase().includes('does not exist')) return [];
  return (data as BriefingRecord[] | null) ?? [];
}

export async function getBriefingForDate(dateYmd: string): Promise<BriefingRecord | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('briefings').select('*').eq('date', dateYmd).maybeSingle();
  return (data as BriefingRecord | null) ?? null;
}

// ─── Top-level orchestrator ───────────────────────────────────────────────────

/** Generates (and caches) the briefing for `dateYmd`. If a briefing already
 *  exists and `force` is false, returns it without calling Groq. */
export async function generateBriefing(opts: {
  dateYmd:     string;
  force?:      boolean;
  generatedBy?: number | null;
}): Promise<{ briefing: BriefingRecord; fromCache: boolean }> {
  const existing = await getBriefingForDate(opts.dateYmd);
  if (existing && !opts.force) return { briefing: existing, fromCache: true };

  const stats = await buildBriefingStats(opts.dateYmd);

  let narrative: Awaited<ReturnType<typeof generateNarrative>> | null = null;
  try {
    narrative = await generateNarrative(stats);
  } catch (err) {
    // AI is optional — still save the stats so the page renders
    console.error('Groq narrative failed; saving briefing without it:', err);
  }

  const saved = await upsertBriefing(
    opts.dateYmd,
    stats,
    narrative,
    opts.generatedBy ?? null,
  );
  return { briefing: saved, fromCache: false };
}

// ─── Util ─────────────────────────────────────────────────────────────────────

/** Returns yesterday's date in PHT as YYYY-MM-DD — used as the default for the
 *  daily cron (run at 7 AM PHT, summarize yesterday). */
export function yesterdayPht(): string {
  const now = new Date();
  // Shift to PHT, subtract 1 day, format YYYY-MM-DD
  const pht = new Date(now.getTime() + 8 * 3600 * 1000);
  pht.setUTCDate(pht.getUTCDate() - 1);
  return pht.toISOString().slice(0, 10);
}

/** Today's date in PHT. */
export function todayPht(): string {
  const pht = new Date(Date.now() + 8 * 3600 * 1000);
  return pht.toISOString().slice(0, 10);
}

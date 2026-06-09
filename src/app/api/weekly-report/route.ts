import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { route, requireSession, parseBody, badRequest } from '@/lib/api';

export const runtime = 'nodejs';

const weeklyReportSchema = z.object({
  weekStart: z.string().optional(),
  clientEngagements: z.array(z.object({
    activity: z.string(),
    date: z.string(),
    details: z.string(),
  })).optional(),
  risks: z.array(z.object({
    description: z.string(),
    resolution: z.string(),
    escalation: z.string(),
  })).optional(),
  meetings: z.array(z.object({
    title: z.string(),
    date: z.string(),
    participants: z.string(),
    notes: z.string(),
  })).optional(),
  ideas: z.string().optional(),
});

function getMondayOfWeek(dateStr: string): string | null {
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return null;
  if (d.getDay() !== 1) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

// GET /api/weekly-report?week=YYYY-MM-DD — own report for the week
export const GET = route(async (req: Request) => {
  const session = await requireSession();

  const { searchParams } = new URL(req.url);
  const weekParam = searchParams.get('week');
  if (!weekParam) throw badRequest('week required');

  const weekStart = getMondayOfWeek(weekParam);
  if (!weekStart) throw badRequest('week must be a Monday (YYYY-MM-DD)');

  const admin = createAdminClient();
  const { data: report } = await admin
    .from('weekly_reports')
    .select('*')
    .eq('user_id', session.id)
    .eq('week_start', weekStart)
    .maybeSingle();

  return NextResponse.json({
    weekStart,
    report: report ? {
      id:                report.id as number,
      weekStart:         report.week_start as string,
      clientEngagements: report.client_engagements ? JSON.parse(report.client_engagements as string) : [],
      risks:             report.risks              ? JSON.parse(report.risks as string)              : [],
      meetings:          report.meetings           ? JSON.parse(report.meetings as string)           : [],
      ideas:             (report.ideas as string) ?? '',
      submittedAt:       report.submitted_at as string | null,
    } : null,
    user: { id: session.id, name: session.name },
  });
});

// POST /api/weekly-report — upsert own report
export const POST = route(async (req: Request) => {
  const session = await requireSession();
  const body = await parseBody(req, weeklyReportSchema);

  const weekStart = getMondayOfWeek(body.weekStart ?? '');
  if (!weekStart) throw badRequest('weekStart must be a Monday (YYYY-MM-DD)');

  const now = new Date().toISOString();
  const payload = {
    client_engagements: JSON.stringify(body.clientEngagements ?? []),
    risks:              JSON.stringify(body.risks ?? []),
    meetings:           JSON.stringify(body.meetings ?? []),
    ideas:              body.ideas?.trim() ?? '',
    submitted_at:       now,
    updated_at:         now,
  };

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from('weekly_reports')
    .select('id')
    .eq('user_id', session.id)
    .eq('week_start', weekStart)
    .maybeSingle();

  if (existing) {
    await admin.from('weekly_reports').update(payload).eq('id', existing.id);
    return NextResponse.json({ success: true, action: 'updated' });
  }

  await admin.from('weekly_reports').insert({ user_id: session.id, week_start: weekStart, ...payload });
  return NextResponse.json({ success: true, action: 'created' });
});

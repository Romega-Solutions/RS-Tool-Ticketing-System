import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSession } from '@/lib/session';

export const runtime = 'nodejs';

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
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const weekParam = searchParams.get('week');
  if (!weekParam) return NextResponse.json({ error: 'week required' }, { status: 400 });

  const weekStart = getMondayOfWeek(weekParam);
  if (!weekStart) return NextResponse.json({ error: 'week must be a Monday (YYYY-MM-DD)' }, { status: 400 });

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
}

// POST /api/weekly-report — upsert own report
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as {
    weekStart: string;
    clientEngagements?: Array<{ activity: string; date: string; details: string }>;
    risks?: Array<{ description: string; resolution: string; escalation: string }>;
    meetings?: Array<{ title: string; date: string; participants: string; notes: string }>;
    ideas?: string;
  };

  const weekStart = getMondayOfWeek(body.weekStart ?? '');
  if (!weekStart) return NextResponse.json({ error: 'weekStart must be a Monday (YYYY-MM-DD)' }, { status: 400 });

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
}

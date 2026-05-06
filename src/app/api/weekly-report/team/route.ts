import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSession } from '@/lib/session';
import { canAccessReports } from '@/lib/rbac';

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

// GET /api/weekly-report/team?week=YYYY-MM-DD
// Lead → their team's ICs; Admin → everyone grouped by team
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canAccessReports(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const weekParam = searchParams.get('week');
  if (!weekParam) return NextResponse.json({ error: 'week required' }, { status: 400 });

  const weekStart = getMondayOfWeek(weekParam);
  if (!weekStart) return NextResponse.json({ error: 'week must be a Monday (YYYY-MM-DD)' }, { status: 400 });

  const admin = createAdminClient();

  let usersQuery = admin
    .from('users')
    .select('id, name, role, team, job_title')
    .eq('is_active', 1);

  if (session.role !== 'admin') {
    usersQuery = usersQuery.eq('team', session.team ?? '');
  }

  const { data: allUsers = [] } = await usersQuery;

  const userIds = allUsers.map((u: { id: number }) => u.id);
  let reports: Array<Record<string, unknown>> = [];
  if (userIds.length > 0) {
    const { data } = await admin
      .from('weekly_reports')
      .select('*')
      .in('user_id', userIds)
      .eq('week_start', weekStart);
    reports = data ?? [];
  }

  const reportMap = new Map(reports.map(r => [r.user_id, r]));

  const members = allUsers
    .filter((u: { id: number }) => u.id !== session.id)
    .map((u: { id: number; name: string; role: string; team: string | null; job_title: string | null }) => {
      const r = reportMap.get(u.id);
      return {
        user: { id: u.id, name: u.name, role: u.role, team: u.team, jobTitle: u.job_title },
        report: r
          ? {
              id:                r.id,
              weekStart:         r.week_start,
              clientEngagements: r.client_engagements ? JSON.parse(r.client_engagements as string) : [],
              risks:             r.risks     ? JSON.parse(r.risks as string)     : [],
              meetings:          r.meetings  ? JSON.parse(r.meetings as string)  : [],
              ideas:             r.ideas ?? '',
              submittedAt:       r.submitted_at,
            }
          : null,
      };
    });

  return NextResponse.json({ weekStart, members });
}

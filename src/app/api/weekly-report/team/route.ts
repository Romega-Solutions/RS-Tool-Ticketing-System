import { NextResponse } from 'next/server';
import { db } from '@/db';
import { users, weeklyReports } from '@/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
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

  const allUsers = session.role === 'admin'
    ? await db.select({ id: users.id, name: users.name, role: users.role, team: users.team, jobTitle: users.jobTitle })
        .from(users).where(eq(users.isActive, 1))
    : await db.select({ id: users.id, name: users.name, role: users.role, team: users.team, jobTitle: users.jobTitle })
        .from(users).where(and(eq(users.isActive, 1), eq(users.team, session.team ?? '')));

  const userIds = allUsers.map(u => u.id);
  const reports = userIds.length > 0
    ? await db.select().from(weeklyReports)
        .where(and(inArray(weeklyReports.userId, userIds), eq(weeklyReports.weekStart, weekStart)))
    : [];

  const reportMap = new Map(reports.map(r => [r.userId, r]));

  const members = allUsers
    .filter(u => u.id !== session.id)
    .map(u => {
      const r = reportMap.get(u.id);
      return {
        user: u,
        report: r
          ? {
              id:                r.id,
              weekStart:         r.weekStart,
              clientEngagements: r.clientEngagements ? JSON.parse(r.clientEngagements) : [],
              risks:             r.risks ? JSON.parse(r.risks) : [],
              ideas:             r.ideas ?? '',
              submittedAt:       r.submittedAt,
            }
          : null,
      };
    });

  return NextResponse.json({ weekStart, members });
}

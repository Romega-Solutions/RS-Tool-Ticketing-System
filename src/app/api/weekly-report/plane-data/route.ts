import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { verifyToken } from '@/lib/auth';
import { normalizeRole } from '@/lib/rbac';
import { getProjects, getProjectStates, getWorkItems, buildStateLookup, enrichWorkItems, isCompletedGroup } from '@/lib/plane';

export const runtime = 'nodejs';

async function requireSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get('session_token')?.value;
  if (!token) return null;
  const payload = await verifyToken(token);
  if (!payload?.id) return null;
  const [user] = await db.select({
    id: users.id, role: users.role, planeMemberId: users.planeMemberId,
  }).from(users).where(eq(users.id, Number(payload.id)));
  if (!user) return null;
  return { ...user, role: normalizeRole(user.role) };
}

function parseWeekRange(weekStart: string): { start: Date; end: Date } | null {
  const d = new Date(weekStart + 'T00:00:00');
  if (isNaN(d.getTime())) return null;
  const end = new Date(d.getTime() + 4 * 86400000); // Friday
  end.setHours(23, 59, 59, 999);
  return { start: d, end };
}

// GET /api/weekly-report/plane-data?week=YYYY-MM-DD
export async function GET(req: Request) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!session.planeMemberId) {
    return NextResponse.json({ planeConfigured: false, pending: [], accomplishments: [] });
  }

  const planeConfigured = !!(process.env.PLANE_BASE_URL && process.env.PLANE_API_KEY);
  if (!planeConfigured) {
    return NextResponse.json({ planeConfigured: false, pending: [], accomplishments: [] });
  }

  const { searchParams } = new URL(req.url);
  const weekParam = searchParams.get('week') ?? '';
  const range = parseWeekRange(weekParam);
  if (!range) return NextResponse.json({ error: 'week required (YYYY-MM-DD)' }, { status: 400 });

  try {
    const projects = await getProjects();
    const pending: Array<{ project: string; title: string; status: string; statusGroup: string; targetDate: string | null }> = [];
    const accomplishments: Array<{ project: string; title: string; completedAt: string }> = [];

    await Promise.all(projects.map(async (proj) => {
      const [states, items] = await Promise.all([
        getProjectStates(proj.id),
        getWorkItems(proj.id, { assignee: session.planeMemberId! }),
      ]);
      const lookup = buildStateLookup(states);
      const enriched = enrichWorkItems(items, lookup);

      for (const item of enriched) {
        const group = (item.state_detail?.group ?? '').toLowerCase();
        const isCompleted = isCompletedGroup(group);

        if (isCompleted && item.completed_at) {
          const completedDate = new Date(item.completed_at);
          if (completedDate >= range.start && completedDate <= range.end) {
            accomplishments.push({
              project:     proj.name,
              title:       item.name,
              completedAt: item.completed_at,
            });
          }
        } else if (!isCompleted) {
          pending.push({
            project:     proj.name,
            title:       item.name,
            status:      item.state_detail?.name ?? 'Unknown',
            statusGroup: group,
            targetDate:  item.target_date ?? null,
          });
        }
      }
    }));

    return NextResponse.json({ planeConfigured: true, pending, accomplishments });
  } catch {
    return NextResponse.json({ planeConfigured: true, pending: [], accomplishments: [], error: 'Failed to fetch Plane data' });
  }
}

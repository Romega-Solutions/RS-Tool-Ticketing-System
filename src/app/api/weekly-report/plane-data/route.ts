import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getProjects, getProjectStates, getWorkItems, buildStateLookup, enrichWorkItems, isCompletedGroup } from '@/lib/tickets';

export const runtime = 'nodejs';

function parseWeekRange(weekStart: string): { start: Date; end: Date } | null {
  const d = new Date(weekStart + 'T00:00:00');
  if (isNaN(d.getTime())) return null;
  const end = new Date(d.getTime() + 4 * 86400000); // Friday
  end.setHours(23, 59, 59, 999);
  return { start: d, end };
}

// GET /api/weekly-report/plane-data?week=YYYY-MM-DD
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!session.planeMemberId) {
    return NextResponse.json({ planeConfigured: false, pending: [], accomplishments: [] });
  }

  const planeConfigured = true;
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
  } catch (err) {
    return NextResponse.json(
      { planeConfigured: true, pending: [], accomplishments: [], error: 'Failed to fetch Plane data' },
      { status: 502 },
    );
  }
}

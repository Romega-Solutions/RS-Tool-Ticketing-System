import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { db } from '@/db';
import { users, weeklyReports } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { verifyToken } from '@/lib/auth';
import { normalizeRole } from '@/lib/rbac';

export const runtime = 'nodejs';

async function requireSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get('session_token')?.value;
  if (!token) return null;
  const payload = await verifyToken(token);
  if (!payload?.id) return null;
  const [user] = await db.select({
    id: users.id, role: users.role, name: users.name,
    team: users.team, planeMemberId: users.planeMemberId,
  }).from(users).where(eq(users.id, Number(payload.id)));
  if (!user) return null;
  return { ...user, role: normalizeRole(user.role) };
}

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
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const weekParam = searchParams.get('week');
  if (!weekParam) return NextResponse.json({ error: 'week required' }, { status: 400 });

  const weekStart = getMondayOfWeek(weekParam);
  if (!weekStart) return NextResponse.json({ error: 'week must be a Monday (YYYY-MM-DD)' }, { status: 400 });

  const [report] = await db.select().from(weeklyReports)
    .where(and(eq(weeklyReports.userId, session.id), eq(weeklyReports.weekStart, weekStart)));

  return NextResponse.json({
    weekStart,
    report: report ?? null,
    user: { id: session.id, name: session.name, planeMemberId: session.planeMemberId },
  });
}

// POST /api/weekly-report — upsert own report
export async function POST(req: Request) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as {
    weekStart: string;
    clientEngagements?: Array<{ activity: string; date: string; details: string }>;
    risks?: Array<{ description: string; resolution: string; escalation: string }>;
    ideas?: string;
  };

  const weekStart = getMondayOfWeek(body.weekStart ?? '');
  if (!weekStart) return NextResponse.json({ error: 'weekStart must be a Monday (YYYY-MM-DD)' }, { status: 400 });

  const now = new Date().toISOString();
  const payload = {
    clientEngagements: JSON.stringify(body.clientEngagements ?? []),
    risks:             JSON.stringify(body.risks ?? []),
    ideas:             body.ideas?.trim() ?? '',
    submittedAt:       now,
    updatedAt:         now,
  };

  const [existing] = await db.select({ id: weeklyReports.id })
    .from(weeklyReports)
    .where(and(eq(weeklyReports.userId, session.id), eq(weeklyReports.weekStart, weekStart)));

  if (existing) {
    await db.update(weeklyReports).set(payload).where(eq(weeklyReports.id, existing.id));
    return NextResponse.json({ success: true, action: 'updated' });
  }

  await db.insert(weeklyReports).values({ userId: session.id, weekStart, ...payload });
  return NextResponse.json({ success: true, action: 'created' });
}

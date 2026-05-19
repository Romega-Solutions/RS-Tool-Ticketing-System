import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { canAccessReports } from '@/lib/rbac';
import { getWorkspaceMembers } from '@/lib/tickets';

export const runtime = 'nodejs';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canAccessReports(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const members = await getWorkspaceMembers();
    return NextResponse.json({ members });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch members' },
      { status: 500 },
    );
  }
}

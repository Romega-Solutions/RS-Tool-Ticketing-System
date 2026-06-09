import { NextResponse } from 'next/server';
import { getWorkspaceMembers } from '@/lib/tickets';
import { route, requireReports } from '@/lib/api';

export const runtime = 'nodejs';

export const GET = route(async () => {
  await requireReports();

  try {
    const members = await getWorkspaceMembers();
    return NextResponse.json({ members });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch members' },
      { status: 500 },
    );
  }
});

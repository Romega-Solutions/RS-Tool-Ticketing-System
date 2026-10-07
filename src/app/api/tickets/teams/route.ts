import { NextResponse } from 'next/server';
import { DEPARTMENTS } from '@/lib/departments';
import { route, requireSession } from '@/lib/api';

export const runtime = 'nodejs';

// GET /api/tickets/teams — the portal's department list for project dropdowns.
export const GET = route(async () => {
  await requireSession();
  return NextResponse.json([...DEPARTMENTS]);
});

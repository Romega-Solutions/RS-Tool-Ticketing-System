import { NextResponse } from 'next/server';
import { route, requireSession } from '@/lib/api';
import { listNotifications } from '@/lib/notifications';

export const runtime = 'nodejs';

// GET /api/notifications — current user's recent notifications + unread count.
// The proxy excludes /api, so this guards itself via requireSession().
export const GET = route(async () => {
  const session = await requireSession();
  return NextResponse.json(await listNotifications(session.id));
});

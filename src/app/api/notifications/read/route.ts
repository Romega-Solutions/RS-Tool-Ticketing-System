import { NextResponse } from 'next/server';
import { z } from 'zod';
import { route, requireSession, parseBody, badRequest } from '@/lib/api';
import { markNotificationsRead } from '@/lib/notifications';

export const runtime = 'nodejs';

const schema = z.object({
  id:  z.number().int().positive().optional(),
  all: z.boolean().optional(),
});

// POST /api/notifications/read — mark one ({id}) or every ({all:true})
// notification of the current user as read.
export const POST = route(async (req: Request) => {
  const session = await requireSession();
  const body = await parseBody(req, schema);
  if (!body.all && !body.id) throw badRequest('id or all is required');
  await markNotificationsRead(session.id, { id: body.id, all: body.all });
  return NextResponse.json({ ok: true });
});

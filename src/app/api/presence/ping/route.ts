import { NextResponse } from 'next/server';
import { z } from 'zod';
import { route, requireSession, parseBody } from '@/lib/api';
import { getPresencePingSnapshotForUser, sendPresencePing } from '@/lib/presence';
import { hydrateOpenPresenceFromDB } from '@/lib/presence-hydration';

export const runtime = 'nodejs';

const pingSchema = z.object({
  toUserId: z.coerce.number().int().positive(),
  message: z.string().max(500).optional(),
});

const errorByReason: Record<'self' | 'not_online' | 'not_connected', { status: number; message: string }> = {
  self:          { status: 400, message: 'You cannot ping yourself' },
  not_online:    { status: 409, message: 'User is not clocked in right now' },
  not_connected: { status: 409, message: 'User is not connected right now' },
};

export const GET = route(async () => {
  const session = await requireSession();
  return NextResponse.json(getPresencePingSnapshotForUser(session.id));
});

export const POST = route(async (req: Request) => {
  const session = await requireSession();
  const body = await parseBody(req, pingSchema);
  await hydrateOpenPresenceFromDB();

  const result = sendPresencePing({
    from: {
      userId: session.id,
      name: session.name,
      role: session.role,
      team: session.team,
      photoUrl: null,
    },
    toUserId: body.toUserId,
    message: body.message,
  });

  if (!result.ok) {
    const mapped = errorByReason[result.reason];
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }

  return NextResponse.json({
    ok: true,
    ping: result.event,
    record: result.record,
    snapshot: getPresencePingSnapshotForUser(session.id),
  });
});

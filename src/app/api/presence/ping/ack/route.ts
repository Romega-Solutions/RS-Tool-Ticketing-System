import { NextResponse } from 'next/server';
import { z } from 'zod';
import { route, requireSession, parseBody } from '@/lib/api';
import { acknowledgePresencePing, getPresencePingSnapshotForUser } from '@/lib/presence';

export const runtime = 'nodejs';

const ackSchema = z.object({
  eventId: z.string().min(1),
});

const errorByReason: Record<'not_found' | 'forbidden' | 'expired', { status: number; message: string }> = {
  not_found: { status: 404, message: 'Ping was not found' },
  forbidden: { status: 403, message: 'You can only reply to pings sent to you' },
  expired:   { status: 409, message: 'This ping was missed because the 1-hour reply window expired' },
};

export const POST = route(async (req: Request) => {
  const session = await requireSession();
  const body = await parseBody(req, ackSchema);

  const result = acknowledgePresencePing({
    eventId: body.eventId,
    userId: session.id,
  });

  if (!result.ok) {
    const mapped = errorByReason[result.reason];
    return NextResponse.json({
      error: mapped.message,
      record: result.record,
      snapshot: getPresencePingSnapshotForUser(session.id),
    }, { status: mapped.status });
  }

  return NextResponse.json({
    ok: true,
    record: result.record,
    snapshot: getPresencePingSnapshotForUser(session.id),
  });
});

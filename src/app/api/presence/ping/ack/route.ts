import { NextResponse } from 'next/server';
import { z } from 'zod';
import { route, requireSession, parseBody } from '@/lib/api';
import {
  acknowledgePresencePing,
  getPresencePingSnapshotForUser,
  sendPresencePingReply,
} from '@/lib/presence';
import {
  acknowledgeStoredPresencePing,
  getStoredPresencePingSnapshotForUser,
  persistPresencePingRecord,
} from '@/lib/presence-ping-store';

export const runtime = 'nodejs';

const ackSchema = z.object({
  eventId: z.string().min(1),
  replyMessage: z.string().max(160).optional(),
});

const errorByReason: Record<'not_found' | 'forbidden' | 'expired', { status: number; message: string }> = {
  not_found: { status: 404, message: 'Ping was not found' },
  forbidden: { status: 403, message: 'You can only reply to pings sent to you' },
  expired:   { status: 409, message: 'This ping was missed because the 1-hour reply window expired' },
};

export const POST = route(async (req: Request) => {
  const session = await requireSession();
  const body = await parseBody(req, ackSchema);

  let result = acknowledgePresencePing({
    eventId: body.eventId,
    userId: session.id,
    replyMessage: body.replyMessage,
  });

  if (!result.ok && result.reason === 'not_found') {
    result = await acknowledgeStoredPresencePing({
      eventId: body.eventId,
      userId: session.id,
      replyMessage: body.replyMessage,
    }) ?? result;
  }

  if (!result.ok) {
    const mapped = errorByReason[result.reason];
    const snapshot = await getStoredPresencePingSnapshotForUser(session.id)
      ?? getPresencePingSnapshotForUser(session.id);
    return NextResponse.json({
      error: mapped.message,
      record: result.record,
      snapshot,
    }, { status: mapped.status });
  }

  await persistPresencePingRecord(result.record);
  sendPresencePingReply({
    record: result.record,
    responderName: session.name,
  });
  const snapshot = await getStoredPresencePingSnapshotForUser(session.id)
    ?? getPresencePingSnapshotForUser(session.id);

  return NextResponse.json({
    ok: true,
    record: result.record,
    snapshot,
  });
});

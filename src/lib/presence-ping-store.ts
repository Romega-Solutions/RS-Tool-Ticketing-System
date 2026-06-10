import {
  createPresencePingSnapshotFromRecords,
  type PresencePingRecord,
  type PresencePingSnapshot,
  type PresencePingStatus,
} from '@/lib/presence';
import { normalizePingReply } from '@/lib/presence-ping';
import { normalizeRole } from '@/lib/rbac';
import { createAdminClient } from '@/lib/supabase/admin';

export type PresencePingDbRow = {
  id: string;
  from_user_id: number;
  from_name: string;
  from_role: string;
  from_team: string | null;
  from_photo_url: string | null;
  to_user_id: number;
  message: string;
  response_message: string | null;
  status: PresencePingStatus;
  created_at: string;
  deadline_at: string;
  acknowledged_at: string | null;
  missed_at: string | null;
  updated_at?: string | null;
};

type AckStoredResult =
  | { ok: true; record: PresencePingRecord }
  | { ok: false; reason: 'not_found' | 'forbidden' | 'expired'; record?: PresencePingRecord };

function isMissingPresencePingsTable(error: unknown): boolean {
  const err = error as { code?: string; message?: string } | null;
  const message = err?.message?.toLowerCase() ?? '';
  return err?.code === '42P01' || message.includes('presence_pings') && message.includes('does not exist');
}

export function presencePingRecordToRow(record: PresencePingRecord): PresencePingDbRow {
  return {
    id: record.id,
    from_user_id: record.senderId,
    from_name: record.from.name,
    from_role: record.from.role,
    from_team: record.from.team,
    from_photo_url: record.from.photoUrl ?? null,
    to_user_id: record.targetUserId,
    message: record.message,
    response_message: record.replyMessage,
    status: record.status,
    created_at: record.createdAt,
    deadline_at: record.deadlineAt,
    acknowledged_at: record.acknowledgedAt,
    missed_at: record.missedAt,
  };
}

export function presencePingRecordFromRow(row: PresencePingDbRow): PresencePingRecord {
  return {
    type: 'user_ping',
    id: row.id,
    from: {
      userId: row.from_user_id,
      name: row.from_name,
      role: normalizeRole(row.from_role),
      team: row.from_team,
      photoUrl: row.from_photo_url,
    },
    senderId: row.from_user_id,
    targetUserId: row.to_user_id,
    toUserId: row.to_user_id,
    message: row.message,
    replyMessage: row.response_message,
    status: row.status,
    createdAt: row.created_at,
    deadlineAt: row.deadline_at,
    acknowledgedAt: row.acknowledged_at,
    missedAt: row.missed_at,
  };
}

export function buildPresencePingSnapshotFromRecords(
  records: PresencePingRecord[],
  userId: number,
  now = new Date(),
): PresencePingSnapshot {
  return createPresencePingSnapshotFromRecords(records, userId, now);
}

export async function persistPresencePingRecord(record: PresencePingRecord): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { error } = await admin
      .from('presence_pings')
      .upsert({
        ...presencePingRecordToRow(record),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });

    if (!error) return true;
    if (!isMissingPresencePingsTable(error)) {
      console.error('[presence-ping-store] persist failed:', error.message);
    }
  } catch (error) {
    if (!isMissingPresencePingsTable(error)) {
      console.error('[presence-ping-store] persist failed:', error instanceof Error ? error.message : error);
    }
  }
  return false;
}

async function markExpiredStoredPresencePings(now = new Date()): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const nowIso = now.toISOString();
    const { error } = await admin
      .from('presence_pings')
      .update({
        status: 'missed',
        missed_at: nowIso,
        updated_at: nowIso,
      })
      .eq('status', 'pending')
      .lte('deadline_at', nowIso);

    if (!error) return true;
    if (!isMissingPresencePingsTable(error)) {
      console.error('[presence-ping-store] expiration update failed:', error.message);
    }
  } catch (error) {
    if (!isMissingPresencePingsTable(error)) {
      console.error('[presence-ping-store] expiration update failed:', error instanceof Error ? error.message : error);
    }
  }
  return false;
}

export async function getStoredPresencePingSnapshotForUser(
  userId: number,
  now = new Date(),
): Promise<PresencePingSnapshot | null> {
  const available = await markExpiredStoredPresencePings(now);
  if (!available) return null;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('presence_pings')
      .select('*')
      .or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      if (!isMissingPresencePingsTable(error)) {
        console.error('[presence-ping-store] snapshot read failed:', error.message);
      }
      return null;
    }

    const records = ((data ?? []) as PresencePingDbRow[]).map(presencePingRecordFromRow);
    return buildPresencePingSnapshotFromRecords(records, userId, now);
  } catch (error) {
    if (!isMissingPresencePingsTable(error)) {
      console.error('[presence-ping-store] snapshot read failed:', error instanceof Error ? error.message : error);
    }
    return null;
  }
}

export async function acknowledgeStoredPresencePing({
  eventId,
  userId,
  replyMessage,
  now = new Date(),
}: {
  eventId: string;
  userId: number;
  replyMessage?: string | null;
  now?: Date;
}): Promise<AckStoredResult | null> {
  const available = await markExpiredStoredPresencePings(now);
  if (!available) return null;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('presence_pings')
      .select('*')
      .eq('id', eventId)
      .maybeSingle();

    if (error) {
      if (!isMissingPresencePingsTable(error)) {
        console.error('[presence-ping-store] acknowledge read failed:', error.message);
      }
      return null;
    }
    if (!data) return { ok: false, reason: 'not_found' };

    const row = data as PresencePingDbRow;
    if (row.to_user_id !== userId) return { ok: false, reason: 'forbidden' };

    const current = presencePingRecordFromRow(row);
    if (current.status === 'missed') return { ok: false, reason: 'expired', record: current };
    if (current.status === 'acknowledged') return { ok: true, record: current };

    const nowIso = now.toISOString();
    const patch = {
      status: 'acknowledged' as PresencePingStatus,
      response_message: normalizePingReply(replyMessage),
      acknowledged_at: nowIso,
      updated_at: nowIso,
    };
    const { data: updated, error: updateError } = await admin
      .from('presence_pings')
      .update(patch)
      .eq('id', eventId)
      .select('*')
      .maybeSingle();

    if (updateError) {
      console.error('[presence-ping-store] acknowledge update failed:', updateError.message);
      return null;
    }

    return {
      ok: true,
      record: presencePingRecordFromRow((updated ?? { ...row, ...patch }) as PresencePingDbRow),
    };
  } catch (error) {
    if (!isMissingPresencePingsTable(error)) {
      console.error('[presence-ping-store] acknowledge failed:', error instanceof Error ? error.message : error);
    }
    return null;
  }
}

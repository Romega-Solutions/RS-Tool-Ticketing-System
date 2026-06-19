import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { route, requireAdmin } from '@/lib/api';
import { enforceRateLimit, keyByUser } from '@/lib/rate-limit';

export const runtime = 'nodejs';

type Row = {
  id: number;
  user_id: number;
  week_start: string;
  status: string;
  reason: string | null;
  requested_at: string;
  decided_by: number | null;
  decided_at: string | null;
  approved_until: string | null;
};

// Overtime is now granted in bounded slices: an admin extends by 30 minutes,
// 1 hour, or 2 hours from the moment of approval (default 1 hour). The approval
// stays active until `approved_until`, then the weekly cap re-applies.
const ALLOWED_OT_MINUTES = new Set([30, 60, 120]);
const DEFAULT_OT_MINUTES = 60;

function normalizeOtMinutes(raw: unknown): number {
  const n = Number(raw);
  return ALLOWED_OT_MINUTES.has(n) ? n : DEFAULT_OT_MINUTES;
}

// GET — pending requests first, plus recently decided ones, with user names.
export const GET = route(async () => {
  await requireAdmin();

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('overtime_requests')
    .select('id, user_id, week_start, status, reason, requested_at, decided_by, decided_at, approved_until')
    .order('status', { ascending: true })        // 'approved' < 'denied' < 'pending' alphabetically — re-sorted below
    .order('requested_at', { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as Row[];
  const userIds = [...new Set(rows.map(r => r.user_id))];
  const nameById = new Map<number, string>();
  if (userIds.length > 0) {
    const { data: users } = await admin.from('users').select('id, name, team').in('id', userIds);
    for (const u of (users ?? []) as { id: number; name: string; team: string | null }[]) {
      nameById.set(u.id, u.name);
    }
  }

  // Pending on top, then most recently requested.
  const requests = rows
    .map(r => ({ ...r, name: nameById.get(r.user_id) ?? `User #${r.user_id}` }))
    .sort((a, b) => {
      if (a.status === 'pending' && b.status !== 'pending') return -1;
      if (b.status === 'pending' && a.status !== 'pending') return 1;
      return new Date(b.requested_at).getTime() - new Date(a.requested_at).getTime();
    });

  return NextResponse.json({ requests });
});

// POST — approve or deny a request. { id, action: 'approve' | 'deny' }.
export const POST = route(async (req: Request) => {
  const session = await requireAdmin();
  await enforceRateLimit({ key: keyByUser('admin-overtime-write', session.id), limit: 60, windowSeconds: 60 });

  let body: { id?: number; action?: string; minutes?: number } = {};
  try { body = await req.json(); } catch { body = {}; }
  const id = Number(body.id);
  if (!Number.isFinite(id) || (body.action !== 'approve' && body.action !== 'deny')) {
    return NextResponse.json({ error: 'id and action ("approve" | "deny") are required' }, { status: 400 });
  }

  const admin = createAdminClient();
  const now = new Date();
  const minutes = normalizeOtMinutes(body.minutes);
  const approvedUntil = new Date(now.getTime() + minutes * 60_000).toISOString();
  const patch = body.action === 'approve'
    ? { status: 'approved', decided_by: session.id, decided_at: now.toISOString(), approved_until: approvedUntil }
    : { status: 'denied',   decided_by: session.id, decided_at: now.toISOString(), approved_until: null };

  const { data, error } = await admin
    .from('overtime_requests')
    .update(patch)
    .eq('id', id)
    .select('id, status, approved_until')
    .single();

  if (error) return NextResponse.json({ error: `Update failed: ${error.message}` }, { status: 500 });
  return NextResponse.json({ request: data });
});

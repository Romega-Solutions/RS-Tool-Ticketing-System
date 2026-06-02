import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { canAccessAdmin } from '@/lib/rbac';

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

/** End of today in Asia/Manila (UTC+8, no DST), as an ISO timestamp. */
function endOfManilaDay(now: Date): string {
  const manilaWall = new Date(now.getTime() + 8 * 3600 * 1000);
  const y = manilaWall.getUTCFullYear();
  const m = String(manilaWall.getUTCMonth() + 1).padStart(2, '0');
  const d = String(manilaWall.getUTCDate()).padStart(2, '0');
  return new Date(`${y}-${m}-${d}T23:59:59+08:00`).toISOString();
}

// GET — pending requests first, plus recently decided ones, with user names.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canAccessAdmin(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

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
}

// POST — approve or deny a request. { id, action: 'approve' | 'deny' }.
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canAccessAdmin(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: { id?: number; action?: string } = {};
  try { body = await req.json(); } catch { body = {}; }
  const id = Number(body.id);
  if (!Number.isFinite(id) || (body.action !== 'approve' && body.action !== 'deny')) {
    return NextResponse.json({ error: 'id and action ("approve" | "deny") are required' }, { status: 400 });
  }

  const admin = createAdminClient();
  const now = new Date();
  const patch = body.action === 'approve'
    ? { status: 'approved', decided_by: session.id, decided_at: now.toISOString(), approved_until: endOfManilaDay(now) }
    : { status: 'denied',   decided_by: session.id, decided_at: now.toISOString(), approved_until: null };

  const { data, error } = await admin
    .from('overtime_requests')
    .update(patch)
    .eq('id', id)
    .select('id, status, approved_until')
    .single();

  if (error) return NextResponse.json({ error: `Update failed: ${error.message}` }, { status: 500 });
  return NextResponse.json({ request: data });
}

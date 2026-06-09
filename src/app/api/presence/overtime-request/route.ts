import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { weekStartMonday } from '@/lib/overtime-policy';
import { route, requireSession, parseBody } from '@/lib/api';

export const runtime = 'nodejs';

type RequestRow = {
  id: number;
  status: string;
  reason: string | null;
  requested_at: string;
  approved_until: string | null;
};

const overtimeRequestSchema = z.object({
  reason: z.string().optional(),
});

// GET — the caller's overtime request for the current week (or null).
export const GET = route(async () => {
  const session = await requireSession();

  const admin = createAdminClient();
  const weekStart = weekStartMonday(new Date());
  const { data } = await admin
    .from('overtime_requests')
    .select('id, status, reason, requested_at, approved_until')
    .eq('user_id', session.id)
    .eq('week_start', weekStart)
    .order('requested_at', { ascending: false })
    .limit(1);

  return NextResponse.json({ request: (data?.[0] as RequestRow | undefined) ?? null });
});

// POST — file an overtime request for the current week. Idempotent: if a
// pending or still-active approved request already exists, it's returned as-is.
export const POST = route(async (req: Request) => {
  const session = await requireSession();

  const body = await parseBody(req, overtimeRequestSchema);
  const reason = body.reason?.trim() || null;

  const admin = createAdminClient();
  const weekStart = weekStartMonday(new Date());

  const { data: existing } = await admin
    .from('overtime_requests')
    .select('id, status, reason, requested_at, approved_until')
    .eq('user_id', session.id)
    .eq('week_start', weekStart)
    .order('requested_at', { ascending: false })
    .limit(1);

  const latest = existing?.[0] as RequestRow | undefined;
  const approvalActive = latest?.status === 'approved'
    && latest.approved_until != null
    && new Date(latest.approved_until).getTime() > Date.now();

  if (latest && (latest.status === 'pending' || approvalActive)) {
    return NextResponse.json({ request: latest, alreadyOpen: true });
  }

  const { data: inserted, error } = await admin
    .from('overtime_requests')
    .insert({ user_id: session.id, week_start: weekStart, status: 'pending', reason })
    .select('id, status, reason, requested_at, approved_until')
    .single();

  if (error) {
    return NextResponse.json({ error: `Could not file request: ${error.message}` }, { status: 500 });
  }
  return NextResponse.json({ request: inserted });
});

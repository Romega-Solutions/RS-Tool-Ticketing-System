import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { route, requireSession } from '@/lib/api';

export const runtime = 'nodejs';

// GET /api/tickets/users — list active workspace users for the member picker.
// Returned shape is intentionally minimal (id, name, email).
export const GET = route(async () => {
  await requireSession();

  const sb = createAdminClient();
  const { data, error } = await sb.from('users')
    .select('id, name, email')
    .eq('is_active', 1)
    .order('name');
  if (error) return NextResponse.json({ error: 'Failed' }, { status: 500 });
  return NextResponse.json(data ?? []);
});

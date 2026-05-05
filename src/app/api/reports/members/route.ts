import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';
import { canAccessReports, normalizeRole } from '@/lib/rbac';
import { getWorkspaceMembers } from '@/lib/plane';

export const runtime = 'nodejs';

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get('session_token')?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const payload = await verifyToken(token);
  const role = normalizeRole(payload?.role);
  if (!payload?.id) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
  if (!canAccessReports(role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const members = await getWorkspaceMembers();
    return NextResponse.json({ members });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch members' },
      { status: 500 },
    );
  }
}

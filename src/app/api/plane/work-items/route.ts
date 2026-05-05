import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';
import { normalizeRole } from '@/lib/rbac';
import { updateWorkItem, createWorkItem } from '@/lib/plane';

export const runtime = 'nodejs';

async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get('session_token')?.value;
  if (!token) return null;
  const payload = await verifyToken(token);
  if (!payload?.id) return null;
  return { id: payload.id, role: normalizeRole(payload.role) };
}

// PATCH — update a work item (state, priority, name, target_date)
export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { projectId?: string; itemId?: string; state?: string; priority?: string; name?: string; target_date?: string | null } = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }

  const { projectId, itemId, ...updates } = body;
  if (!projectId || !itemId) {
    return NextResponse.json({ error: 'projectId and itemId are required' }, { status: 400 });
  }

  try {
    const updated = await updateWorkItem(projectId, itemId, updates);
    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update work item' },
      { status: 502 },
    );
  }
}

// POST — create a new work item
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { projectId?: string; name?: string; state?: string; priority?: string } = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }

  const { projectId, name, ...rest } = body;
  if (!projectId || !name?.trim()) {
    return NextResponse.json({ error: 'projectId and name are required' }, { status: 400 });
  }

  try {
    const created = await createWorkItem(projectId, { name: name.trim(), ...rest });
    return NextResponse.json(created);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create work item' },
      { status: 502 },
    );
  }
}

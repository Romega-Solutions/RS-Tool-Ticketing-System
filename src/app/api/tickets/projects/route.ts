import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { createProject } from '@/lib/tickets';
import { canCreateProject } from '@/lib/permissions';

export const runtime = 'nodejs';

// POST /api/tickets/projects
// Body: { name, identifier?, description?, team? }
// - name is required.
// - team defaults to the caller's team if not provided. Pass team: null to
//   create a cross-team project (only allowed for lead/admin).
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canCreateProject(session)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: { name?: string; identifier?: string; description?: string; team?: string | null } = {};
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }

  const name = (body.name ?? '').trim();
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });

  // Resolve team. ICs/interns CANNOT override their own team — it's auto-set.
  // Leads/admins may pass any team (including null for cross-team projects).
  const canSetCustomTeam = session.role === 'lead' || session.role === 'admin';
  const team =
    canSetCustomTeam && body.team !== undefined
      ? body.team
      : (session.team ?? null);

  try {
    const created = await createProject({
      name,
      identifier:  body.identifier,
      description: body.description,
      team,
      createdBy:   session.id,
    });
    return NextResponse.json(created);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create project' },
      { status: 502 },
    );
  }
}

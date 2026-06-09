import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createProject } from '@/lib/tickets';
import { canCreateProject } from '@/lib/permissions';
import { route, requireSession, parseBody, badRequest, forbidden } from '@/lib/api';

export const runtime = 'nodejs';

const createProjectSchema = z.object({
  name: z.string().nullable().optional(),
  identifier: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  team: z.string().nullable().optional(),
});

// POST /api/tickets/projects
// Body: { name, identifier?, description?, team? }
// - name is required.
// - team defaults to the caller's team if not provided. Pass team: null to
//   create a cross-team project (only allowed for lead/admin).
export const POST = route(async (req: Request) => {
  const session = await requireSession();
  if (!canCreateProject(session)) throw forbidden();

  const body = await parseBody(req, createProjectSchema);
  const name = (body.name ?? '').trim();
  if (!name) throw badRequest('name is required');

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
      identifier:  body.identifier ?? undefined,
      description: body.description ?? undefined,
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
});

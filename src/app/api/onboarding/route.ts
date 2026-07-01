import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { lookupOrgAuthProfileByEmail } from '@/lib/orgchart';
import { route, parseBody, badRequest, unauthorized, forbidden } from '@/lib/api';

export const runtime = 'nodejs';

const onboardingSchema = z.object({
  name: z.string().nullable().optional(),
  team: z.string().nullable().optional(),
  jobTitle: z.string().nullable().optional(),
  role: z.string().nullable().optional(),
});

export const POST = route(async (req: Request) => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) throw unauthorized();

  const body = await parseBody(req, onboardingSchema);

  const name     = body.name?.trim() ?? '';
  const team     = body.team?.trim() || null;
  const jobTitle = body.jobTitle?.trim() || null;

  if (!name) throw badRequest('Name is required');

  const email = user.email;

  const now = new Date().toISOString();

  const admin = createAdminClient();
  const [orgProfile, existingResult] = await Promise.all([
    lookupOrgAuthProfileByEmail(email),
    admin.from('users').select('id, role').eq('email', email).maybeSingle(),
  ]);
  const existing = existingResult.data;

  if (!existing && !orgProfile) {
    throw forbidden('Your email is not listed in the Romega org chart.');
  }

  if (existing) {
    // Preserve elevated roles already assigned by an admin. New account role
    // comes from org chart only, so a submitted payload cannot self-promote.
    const protectedRoles = ['admin', 'ceo', 'owner', 'superadmin', 'lead'];
    const finalRole = protectedRoles.includes((existing.role as string).toLowerCase())
      ? existing.role
      : orgProfile?.role ?? existing.role ?? 'ic';

    await admin.from('users').update({
      name: orgProfile?.name ?? name,
      team: orgProfile?.team ?? team,
      job_title: orgProfile?.jobTitle ?? jobTitle,
      role: finalRole,
      updated_at: now,
    }).eq('id', existing.id);
  } else {
    // First time — create the row (fallback if callback did not create it).
    // The org chart is the source of truth for role/team/title.
    const profile = orgProfile;
    if (!profile) throw forbidden('Your email is not listed in the Romega org chart.');

    await admin.from('users').upsert({
      username:      profile.username,
      password_hash: '',
      name:          profile.name,
      email:         profile.email,
      role:          profile.role,
      team:          profile.team,
      job_title:     profile.jobTitle,
      is_active:     1,
      created_at:    now,
      updated_at:    now,
    }, { onConflict: 'email', ignoreDuplicates: true });
  }

  return NextResponse.json({ success: true });
});

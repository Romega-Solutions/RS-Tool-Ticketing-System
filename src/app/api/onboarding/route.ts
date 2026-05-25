import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as {
    name?: string;
    team?: string;
    jobTitle?: string;
    role?: string;
  };

  const name     = body.name?.trim() ?? '';
  const team     = body.team?.trim() || null;
  const jobTitle = body.jobTitle?.trim() || null;
  const role     = body.role?.trim() || 'ic';

  if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });

  const email = user.email;

  // Only the Romega org domain can self-assign roles. Public domains like
  // gmail.com are forced to IC — an admin can promote them afterwards.
  // Without this, any random gmail signup could pick "ceo" and gain admin.
  const domain = email.split('@')[1] ?? '';
  const isTrusted = domain === 'romega-solutions.com';
  const selfAssignableRole = isTrusted && ['intern', 'ic', 'lead', 'ceo'].includes(role) ? role : 'ic';

  const now = new Date().toISOString();
  const emailPrefix = email.split('@')[0].replace(/[^a-z0-9_]/gi, '_').toLowerCase();

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from('users')
    .select('id, role')
    .eq('email', email)
    .maybeSingle();

  if (existing) {
    // Preserve role if they're already admin/ceo — never self-downgrade
    const protectedRoles = ['admin', 'ceo', 'owner', 'superadmin'];
    const finalRole = protectedRoles.includes((existing.role as string).toLowerCase())
      ? existing.role
      : selfAssignableRole;

    await admin.from('users').update({
      name,
      team,
      job_title: jobTitle,
      role: finalRole,
      updated_at: now,
    }).eq('id', existing.id);
  } else {
    // First time — create the row (fallback if callback didn't create it)
    await admin.from('users').upsert({
      username:      emailPrefix,
      password_hash: '',
      name,
      email,
      role:          selfAssignableRole,
      team,
      job_title:     jobTitle,
      is_active:     1,
      created_at:    now,
      updated_at:    now,
    }, { onConflict: 'email', ignoreDuplicates: true });
  }

  return NextResponse.json({ success: true });
}

'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSession } from '@/lib/session';
import { canAccessLeadTool } from '@/lib/rbac';

async function requireSession() {
  const session = await getSession();
  if (!session) throw new Error('Not authenticated');
  if (!canAccessLeadTool('recruiting', session.role, session.team)) {
    throw new Error('Not authorized');
  }
  return session;
}

export async function createPosition(formData: FormData) {
  const session = await requireSession();

  const jobTitle       = String(formData.get('jobTitle')       ?? '').trim();
  const client         = String(formData.get('client')         ?? '').trim() || null;
  const location       = String(formData.get('location')       ?? '').trim() || null;
  const jobDescription = String(formData.get('jobDescription') ?? '').trim() || null;

  if (!jobTitle) throw new Error('Job title is required');

  const supabase = createAdminClient();
  const { error } = await supabase.from('positions').insert({
    job_title:       jobTitle,
    client,
    location,
    job_description: jobDescription,
    is_open:         true,
    created_by:      session.id,
  });
  if (error) throw new Error(`Failed to create position: ${error.message}`);

  revalidatePath('/recruiting/positions');
}

export async function updatePositionStatus(id: number, isOpen: boolean) {
  await requireSession();
  if (!Number.isInteger(id) || id <= 0) throw new Error('Invalid id');

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('positions')
    .update({ is_open: isOpen, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(`Failed to update position: ${error.message}`);

  revalidatePath('/recruiting/positions');
}

export async function deletePosition(id: number) {
  await requireSession();
  if (!Number.isInteger(id) || id <= 0) throw new Error('Invalid id');

  const supabase = createAdminClient();
  const { error } = await supabase.from('positions').delete().eq('id', id);
  if (error) throw new Error(`Failed to delete position: ${error.message}`);

  revalidatePath('/recruiting/positions');
}

'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSession } from '@/lib/session';
import { hasToolAccess } from '@/lib/rbac';
import { sanitizeRichText, isRichTextEmpty } from '@/lib/sanitize';

const PLACEMENTS  = new Set(['internal', 'external']);
const EMPLOYMENTS = new Set(['full_time', 'part_time']);

// Pulls the new structured fields out of FormData with safe fallbacks.
function readPositionFields(formData: FormData) {
  const jobTitle    = String(formData.get('jobTitle') ?? '').trim();
  const location    = String(formData.get('location') ?? '').trim() || null;
  const compensation = String(formData.get('compensation') ?? '').trim() || null;

  const placementRaw  = String(formData.get('placementType') ?? '').trim();
  const placementType = PLACEMENTS.has(placementRaw) ? placementRaw : 'internal';

  const employmentRaw  = String(formData.get('employmentType') ?? '').trim();
  const employmentType = EMPLOYMENTS.has(employmentRaw) ? employmentRaw : 'full_time';

  const openingsNum = Math.trunc(Number(formData.get('openings')));
  const openings    = Number.isFinite(openingsNum) && openingsNum > 0 ? openingsNum : 1;

  const rawDescription = String(formData.get('jobDescription') ?? '');
  const jobDescription = isRichTextEmpty(rawDescription) ? null : sanitizeRichText(rawDescription);

  return { jobTitle, location, compensation, placementType, employmentType, openings, jobDescription };
}

async function requireSession() {
  const session = await getSession();
  if (!session) throw new Error('Not authenticated');
  if (!hasToolAccess('recruiting', session.role, session.toolAccess)) {
    throw new Error('Not authorized');
  }
  return session;
}

export async function createPosition(formData: FormData) {
  const session = await requireSession();

  const f = readPositionFields(formData);
  if (!f.jobTitle) throw new Error('Job title is required');

  const supabase = createAdminClient();
  const { error } = await supabase.from('positions').insert({
    job_title:       f.jobTitle,
    placement_type:  f.placementType,
    location:        f.location,
    compensation:    f.compensation,
    employment_type: f.employmentType,
    openings:        f.openings,
    job_description: f.jobDescription,
    is_open:         true,
    created_by:      session.id,
  });
  if (error) throw new Error(`Failed to create position: ${error.message}`);

  revalidatePath('/recruiting/positions');
}

export async function updatePosition(id: number, formData: FormData) {
  await requireSession();
  if (!Number.isInteger(id) || id <= 0) throw new Error('Invalid id');

  const f = readPositionFields(formData);
  if (!f.jobTitle) throw new Error('Job title is required');

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('positions')
    .update({
      job_title:       f.jobTitle,
      placement_type:  f.placementType,
      location:        f.location,
      compensation:    f.compensation,
      employment_type: f.employmentType,
      openings:        f.openings,
      job_description: f.jobDescription,
      updated_at:      new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw new Error(`Failed to update position: ${error.message}`);

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

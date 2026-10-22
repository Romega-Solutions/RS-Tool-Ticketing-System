'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSession } from '@/lib/session';
import { hasToolAccess } from '@/lib/rbac';
import { sanitizeRichText, isRichTextEmpty } from '@/lib/sanitize';
import { ATS_POSITIONS_TAG, atsPositionTag } from '@/lib/cache-tags';
import { allocatePositionSlug, isMissingSlugColumn, slugifyPositionTitle } from '@/lib/recruiting/position-slug';
import type { SupabaseClient } from '@supabase/supabase-js';
import { parseEmploymentType } from '@/lib/employment-types';

const PLACEMENTS  = new Set(['internal', 'external']);

// Pulls the new structured fields out of FormData with safe fallbacks.
// Throws on an invalid employment type.
function readPositionFields(formData: FormData) {
  const jobTitle    = String(formData.get('jobTitle') ?? '').trim();
  const location    = String(formData.get('location') ?? '').trim() || null;
  const compensation = String(formData.get('compensation') ?? '').trim() || null;

  const placementRaw  = String(formData.get('placementType') ?? '').trim();
  const placementType = PLACEMENTS.has(placementRaw) ? placementRaw : 'internal';

  // Only the 4 known types are accepted; anything else is a form error
  // (never silently saved as full_time).
  const employmentType = parseEmploymentType(formData.get('employmentType'));

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

type PositionInsert = {
  job_title: string;
  placement_type: string;
  location: string | null;
  compensation: string | null;
  employment_type: string;
  openings: number;
  job_description: string | null;
  is_open: boolean;
  created_by: number;
  slug?: string;
};

function isUniqueSlugViolation(error: { code?: string; message?: string }): boolean {
  if (error.code === '23505') return true;
  const message = error.message?.toLowerCase() ?? '';
  return message.includes('duplicate') && message.includes('slug');
}

/**
 * Next free slug for a new position. Returns null when the slug column is not
 * in the database yet so create can still succeed before the migration runs.
 */
async function allocateUniquePositionSlug(
  supabase: SupabaseClient,
  jobTitle: string,
): Promise<string | null> {
  const base = slugifyPositionTitle(jobTitle);
  const [exact, prefixed] = await Promise.all([
    supabase.from('positions').select('slug').eq('slug', base).limit(1),
    supabase.from('positions').select('slug').like('slug', `${base}-%`),
  ]);
  const error = exact.error ?? prefixed.error;
  if (error) {
    if (isMissingSlugColumn(error.message)) return null;
    throw new Error(`Failed to allocate position slug: ${error.message}`);
  }
  const taken = new Set<string>();
  for (const row of [...(exact.data ?? []), ...(prefixed.data ?? [])]) {
    if (typeof row.slug === 'string' && row.slug) taken.add(row.slug);
  }
  return allocatePositionSlug(base, taken);
}

async function readPositionSlug(supabase: SupabaseClient, id: number): Promise<string | null> {
  const { data, error } = await supabase.from('positions').select('slug').eq('id', id).maybeSingle();
  if (error || !data) return null;
  const slug = typeof data.slug === 'string' ? data.slug.trim() : '';
  return slug || null;
}

function revalidatePositionViews(id: number, slug: string | null) {
  revalidatePath('/recruiting/positions');
  revalidatePath(`/apply/${id}`);
  if (slug) revalidatePath(`/apply/${slug}`);
  revalidateTag(ATS_POSITIONS_TAG, { expire: 0 });
  revalidateTag(atsPositionTag(id), { expire: 0 });
}

export async function createPosition(formData: FormData) {
  const session = await requireSession();

  const f = readPositionFields(formData);
  if (!f.jobTitle) throw new Error('Job title is required');

  const supabase = createAdminClient();
  const slug = await allocateUniquePositionSlug(supabase, f.jobTitle);
  const row: PositionInsert = {
    job_title:       f.jobTitle,
    placement_type:  f.placementType,
    location:        f.location,
    compensation:    f.compensation,
    employment_type: f.employmentType,
    openings:        f.openings,
    job_description: f.jobDescription,
    is_open:         true,
    created_by:      session.id,
    ...(slug ? { slug } : {}),
  };

  let { error } = await supabase.from('positions').insert(row);
  if (error && slug && isMissingSlugColumn(error.message)) {
    ({ error } = await supabase.from('positions').insert({
      job_title:       row.job_title,
      placement_type:  row.placement_type,
      location:        row.location,
      compensation:    row.compensation,
      employment_type: row.employment_type,
      openings:        row.openings,
      job_description: row.job_description,
      is_open:         row.is_open,
      created_by:      row.created_by,
    }));
  } else if (error && slug && isUniqueSlugViolation(error)) {
    const retrySlug = await allocateUniquePositionSlug(supabase, f.jobTitle);
    ({ error } = await supabase.from('positions').insert({ ...row, ...(retrySlug ? { slug: retrySlug } : {}) }));
  }
  if (error) throw new Error(`Failed to create position: ${error.message}`);

  revalidatePath('/recruiting/positions');
  revalidateTag(ATS_POSITIONS_TAG, { expire: 0 });
}

export async function updatePosition(id: number, formData: FormData) {
  await requireSession();
  if (!Number.isInteger(id) || id <= 0) throw new Error('Invalid id');

  const f = readPositionFields(formData);
  if (!f.jobTitle) throw new Error('Job title is required');

  const supabase = createAdminClient();
  const existingSlug = await readPositionSlug(supabase, id);
  // Title edits keep the existing slug so /apply/{slug} links stay stable.
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

  revalidatePositionViews(id, existingSlug);
}

export async function updatePositionStatus(id: number, isOpen: boolean) {
  await requireSession();
  if (!Number.isInteger(id) || id <= 0) throw new Error('Invalid id');

  const supabase = createAdminClient();
  const existingSlug = await readPositionSlug(supabase, id);
  const { error } = await supabase
    .from('positions')
    .update({ is_open: isOpen, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(`Failed to update position: ${error.message}`);

  revalidatePositionViews(id, existingSlug);
}

export async function deletePosition(id: number) {
  await requireSession();
  if (!Number.isInteger(id) || id <= 0) throw new Error('Invalid id');

  const supabase = createAdminClient();
  const existingSlug = await readPositionSlug(supabase, id);
  const { error } = await supabase.from('positions').delete().eq('id', id);
  if (error) throw new Error(`Failed to delete position: ${error.message}`);

  revalidatePositionViews(id, existingSlug);
}

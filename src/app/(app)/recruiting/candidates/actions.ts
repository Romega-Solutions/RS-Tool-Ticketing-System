'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSession } from '@/lib/session';
import { parseResumeWithN8n, type ParsedResume } from '@/lib/n8n';
import { canAccessLeadTool } from '@/lib/rbac';

const ALLOWED_STATUSES = ['applied', 'screening', 'interview', 'offer', 'hired', 'rejected'] as const;
type Status = typeof ALLOWED_STATUSES[number];

function isStatus(v: string): v is Status {
  return (ALLOWED_STATUSES as readonly string[]).includes(v);
}

async function requireSession() {
  const session = await getSession();
  if (!session) throw new Error('Not authenticated');
  if (!canAccessLeadTool('recruiting', session.role, session.team)) {
    throw new Error('Not authorized');
  }
  return session;
}

export async function createCandidate(formData: FormData) {
  const session = await requireSession();

  const fullName    = String(formData.get('fullName')    ?? '').trim();
  const email       = String(formData.get('email')       ?? '').trim() || null;
  const phone       = String(formData.get('phone')       ?? '').trim() || null;
  const position    = String(formData.get('position')    ?? '').trim() || null;
  const source      = String(formData.get('source')      ?? '').trim() || null;
  const linkedinUrl = String(formData.get('linkedinUrl') ?? '').trim() || null;
  const notes       = String(formData.get('notes')       ?? '').trim() || null;

  if (!fullName) throw new Error('Full name is required');

  const supabase = createAdminClient();
  const { error } = await supabase.from('candidates').insert({
    full_name: fullName,
    email,
    phone,
    position,
    source,
    linkedin_url: linkedinUrl,
    notes,
    status: 'applied',
    assigned_to: session.id,
  });
  if (error) throw new Error(`Failed to create candidate: ${error.message}`);

  revalidatePath('/recruiting/candidates');
}

export async function updateCandidateStatus(id: number, status: string) {
  await requireSession();
  if (!Number.isInteger(id) || id <= 0) throw new Error('Invalid id');
  if (!isStatus(status)) throw new Error('Invalid status');

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('candidates')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(`Failed to update candidate: ${error.message}`);

  revalidatePath('/recruiting/candidates');
  revalidatePath(`/recruiting/candidates/${id}`);
}

export async function updateCandidateRating(id: number, rating: number | null) {
  await requireSession();
  if (!Number.isInteger(id) || id <= 0) throw new Error('Invalid id');
  if (rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) {
    throw new Error('Rating must be 1–5 or null');
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('candidates')
    .update({ rating, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(`Failed to update rating: ${error.message}`);

  revalidatePath('/recruiting/candidates');
  revalidatePath(`/recruiting/candidates/${id}`);
}

export async function deleteCandidate(id: number) {
  await requireSession();
  if (!Number.isInteger(id) || id <= 0) throw new Error('Invalid id');

  const supabase = createAdminClient();
  const { error } = await supabase.from('candidates').delete().eq('id', id);
  if (error) throw new Error(`Failed to delete candidate: ${error.message}`);

  revalidatePath('/recruiting/candidates');
}

const DELETE_CANDIDATES_CONFIRMATION = 'DELETE CANDIDATES';

export async function deleteAllCandidates(confirmation: string) {
  await requireSession();
  if (confirmation !== DELETE_CANDIDATES_CONFIRMATION) {
    throw new Error(`Type ${DELETE_CANDIDATES_CONFIRMATION} to confirm`);
  }

  const supabase = createAdminClient();
  const { data, error: fetchError } = await supabase.from('candidates').select('id');
  if (fetchError) throw new Error(`Failed to inspect candidates: ${fetchError.message}`);

  const ids = (data ?? []).map(row => row.id).filter((id): id is number => Number.isInteger(id));
  if (ids.length > 0) {
    const { error } = await supabase.from('candidates').delete().in('id', ids);
    if (error) throw new Error(`Failed to delete candidates: ${error.message}`);
  }

  revalidatePath('/recruiting/candidates');
  return { ok: true as const, deleted: ids.length };
}

// ─────────────────────────────────────────────────────────────────────────────
// Resume parsing — talks to the self-hosted n8n "Romega ATS — Resume Extractor"
// ─────────────────────────────────────────────────────────────────────────────

type ParseSuccess = { ok: true;  parsed: ParsedResume; candidateId: number };
type ParseFailure = { ok: false; error: string; code: string };
export type ParseResumeResult = ParseSuccess | ParseFailure;

function applyParsedFieldsToRow(parsed: ParsedResume, existing: {
  full_name?: string | null;
  email?:     string | null;
  phone?:     string | null;
  linkedin_url?: string | null;
  position?:  string | null;
}) {
  // Merge strategy: overwrite empty existing fields with parsed values,
  // keep existing values when they're already set (user-edited wins).
  const pick = <T,>(curr: T | null | undefined, next: T | null) =>
    (curr && String(curr).trim() ? curr : next);

  return {
    full_name:      pick(existing.full_name,    parsed.full_name) ?? '',
    email:          pick(existing.email,        parsed.email),
    phone:          pick(existing.phone,        parsed.phone),
    linkedin_url:   pick(existing.linkedin_url, parsed.linkedin),
    location:       parsed.location,
    website:        parsed.website,
    summary:        parsed.summary,
    skills:         parsed.skills,
    experience:     parsed.experience,
    education:      parsed.education,
    certifications: parsed.certifications,
    languages:      parsed.languages,
    parsed_at:      new Date().toISOString(),
    updated_at:     new Date().toISOString(),
  };
}

export async function parseResumeForCandidate(
  candidateId: number,
  formData: FormData,
): Promise<ParseResumeResult> {
  await requireSession();
  if (!Number.isInteger(candidateId) || candidateId <= 0) {
    return { ok: false, code: 'INVALID_ID', error: 'Invalid candidate id' };
  }

  const file = formData.get('resume');
  if (!(file instanceof File)) {
    return { ok: false, code: 'NO_FILE', error: 'No resume file provided' };
  }

  const result = await parseResumeWithN8n(file, candidateId);
  if (!result.success) return { ok: false, code: result.code, error: result.error };

  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from('candidates')
    .select('full_name, email, phone, linkedin_url, position')
    .eq('id', candidateId)
    .maybeSingle();

  if (!existing) {
    return { ok: false, code: 'NOT_FOUND', error: 'Candidate not found' };
  }

  const updates = applyParsedFieldsToRow(result.data, existing);
  const { error } = await supabase
    .from('candidates')
    .update(updates)
    .eq('id', candidateId);

  if (error) {
    return { ok: false, code: 'DB_ERROR', error: `Failed to save parsed data: ${error.message}` };
  }

  revalidatePath('/recruiting/candidates');
  revalidatePath(`/recruiting/candidates/${candidateId}`);

  return { ok: true, parsed: result.data, candidateId };
}

export async function createCandidateFromResume(formData: FormData): Promise<ParseResumeResult> {
  const session = await requireSession();

  const file = formData.get('resume');
  if (!(file instanceof File)) {
    return { ok: false, code: 'NO_FILE', error: 'No resume file provided' };
  }

  const result = await parseResumeWithN8n(file);
  if (!result.success) return { ok: false, code: result.code, error: result.error };

  const parsed = result.data;
  if (!parsed.full_name && !parsed.email) {
    return {
      ok: false,
      code: 'AI_EXTRACTION_EMPTY',
      error: 'Resume parsed but no name or email was found. Add candidate manually.',
    };
  }

  const supabase = createAdminClient();
  const { data: inserted, error } = await supabase
    .from('candidates')
    .insert({
      full_name:      parsed.full_name ?? '(Unknown — parsed from resume)',
      email:          parsed.email,
      phone:          parsed.phone,
      linkedin_url:   parsed.linkedin,
      location:       parsed.location,
      website:        parsed.website,
      summary:        parsed.summary,
      skills:         parsed.skills,
      experience:     parsed.experience,
      education:      parsed.education,
      certifications: parsed.certifications,
      languages:      parsed.languages,
      parsed_at:      new Date().toISOString(),
      source:         'manual',
      status:         'applied',
      assigned_to:    session.id,
    })
    .select('id')
    .single();

  if (error || !inserted) {
    return { ok: false, code: 'DB_ERROR', error: `Failed to create candidate: ${error?.message ?? 'unknown'}` };
  }

  revalidatePath('/recruiting/candidates');

  return { ok: true, parsed, candidateId: inserted.id };
}

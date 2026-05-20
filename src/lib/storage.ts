// Thin wrapper around Supabase Storage for the candidate resume bucket.
// All callers use the admin client (server-side only) — public URLs are
// always signed, never exposed directly.

import { createAdminClient } from '@/lib/supabase/admin';

const BUCKET = process.env.SUPABASE_RESUMES_BUCKET ?? 'candidate-resumes';

// 1y — long enough that the signed URL doesn't expire mid-pipeline. Recruiters
// who want to share externally should re-sign just before sharing.
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 365;

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')   // strip diacritics
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'unnamed';
}

export type ResumeUpload = {
  path:      string;  // bucket-relative path (stored in DB if needed)
  signedUrl: string;  // public-ish URL persisted to candidates.resume_url
};

/**
 * Upload a candidate's resume PDF and return a long-lived signed URL.
 * Overwrites any prior file at the same path (re-parse replaces the original).
 */
export async function uploadResumeToStorage(args: {
  candidateId: number;
  position:    string | null;
  fullName:    string;
  file:        File;
}): Promise<ResumeUpload> {
  const filename = `${slugify(args.position ?? 'role')}-${slugify(args.fullName)}.pdf`;
  const path = `candidates/${args.candidateId}/${filename}`;

  const admin = createAdminClient();
  const bytes = new Uint8Array(await args.file.arrayBuffer());

  const { error: uploadError } = await admin.storage.from(BUCKET).upload(path, bytes, {
    contentType: 'application/pdf',
    upsert: true,
  });
  if (uploadError) {
    throw new Error(`Resume upload failed: ${uploadError.message}`);
  }

  const { data: signed, error: signError } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (signError || !signed) {
    throw new Error(`Resume signing failed: ${signError?.message ?? 'unknown'}`);
  }

  return { path, signedUrl: signed.signedUrl };
}

/** Re-sign a previously uploaded resume — used when an old signed URL has expired. */
export async function refreshResumeSignedUrl(path: string): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !data) {
    throw new Error(`Resume re-sign failed: ${error?.message ?? 'unknown'}`);
  }
  return data.signedUrl;
}

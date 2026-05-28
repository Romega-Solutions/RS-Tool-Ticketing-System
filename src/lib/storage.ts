// Thin wrapper around Supabase Storage for the candidate resume bucket and
// the onboarder documents bucket. All callers use the admin client
// (server-side only) — public URLs are always signed, never exposed directly.

import { createAdminClient } from '@/lib/supabase/admin';

const BUCKET           = process.env.SUPABASE_RESUMES_BUCKET   ?? 'candidate-resumes';
const ONBOARDER_BUCKET = process.env.SUPABASE_ONBOARDER_BUCKET ?? 'onboarder-docs';
const LEARNING_BUCKET  = process.env.SUPABASE_LEARNING_BUCKET  ?? 'learning-content';

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

// ─────────────────────────────────────────────────────────────────────────────
// Onboarder documents — gov IDs, NBI, W-8, contracts, reference responses,
// employment verifications. Bucket is PRIVATE; we always hand back a signed
// URL plus the bucket-relative path (persisted to onboarder_documents).
// ─────────────────────────────────────────────────────────────────────────────

export type OnboarderDocumentKind =
  | 'sow' | 'w8' | 'nda' | 'contract' | 'gov_id' | 'nbi'
  | 'reference_response' | 'employment_verification' | 'other';

export type OnboarderUpload = {
  path:      string;
  signedUrl: string;
  mimeType:  string;
  sizeBytes: number;
};

function extensionFor(name: string, mime: string): string {
  const dot = name.lastIndexOf('.');
  if (dot > -1 && dot < name.length - 1) {
    return name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
  }
  if (mime === 'application/pdf') return 'pdf';
  if (mime.startsWith('image/'))  return mime.slice(6).replace('jpeg', 'jpg');
  return 'bin';
}

/**
 * Upload an onboarder document and return a long-lived signed URL. Caller is
 * responsible for inserting the matching onboarder_documents row.
 */
export async function uploadOnboarderDocument(args: {
  onboarderId: number;
  kind:        OnboarderDocumentKind;
  file:        File;
  label?:      string | null;
}): Promise<OnboarderUpload> {
  const ext = extensionFor(args.file.name, args.file.type);
  const slug = slugify(args.label?.trim() || args.file.name.replace(/\.[^.]+$/, '') || args.kind);
  const stamp = new Date().toISOString().slice(0, 10);
  const path = `onboarders/${args.onboarderId}/${args.kind}/${slug}-${stamp}.${ext}`;

  const admin = createAdminClient();
  const bytes = new Uint8Array(await args.file.arrayBuffer());

  const { error: uploadError } = await admin.storage.from(ONBOARDER_BUCKET).upload(path, bytes, {
    contentType: args.file.type || 'application/octet-stream',
    upsert: true,
  });
  if (uploadError) {
    throw new Error(`Onboarder document upload failed: ${uploadError.message}`);
  }

  const { data: signed, error: signError } = await admin.storage
    .from(ONBOARDER_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (signError || !signed) {
    throw new Error(`Onboarder document signing failed: ${signError?.message ?? 'unknown'}`);
  }

  return {
    path,
    signedUrl: signed.signedUrl,
    mimeType:  args.file.type || 'application/octet-stream',
    sizeBytes: args.file.size,
  };
}

/** Re-sign an onboarder document — used when an old signed URL has expired. */
export async function refreshOnboarderSignedUrl(path: string): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from(ONBOARDER_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !data) {
    throw new Error(`Onboarder document re-sign failed: ${error?.message ?? 'unknown'}`);
  }
  return data.signedUrl;
}

// ─────────────────────────────────────────────────────────────────────────────
// LMS — lesson videos and (Phase 2) certificate PDFs. Private bucket. Paths:
//   videos:       lessons/{lessonId}/video.{ext}
//   certificates: certificates/{userId}/{courseId}.pdf
// ─────────────────────────────────────────────────────────────────────────────

export type LessonVideoUpload = { path: string; signedUrl: string; mimeType: string };

/** Upload a lesson .mp4 (or other video) and return a long-lived signed URL. */
export async function uploadLessonVideo(args: {
  lessonId: number;
  file:     File;
}): Promise<LessonVideoUpload> {
  const ext = extensionFor(args.file.name, args.file.type) || 'mp4';
  const path = `lessons/${args.lessonId}/video.${ext}`;

  const admin = createAdminClient();
  const bytes = new Uint8Array(await args.file.arrayBuffer());

  const { error: uploadError } = await admin.storage.from(LEARNING_BUCKET).upload(path, bytes, {
    contentType: args.file.type || 'video/mp4',
    upsert: true,
  });
  if (uploadError) {
    throw new Error(`Lesson video upload failed: ${uploadError.message}`);
  }

  const { data: signed, error: signError } = await admin.storage
    .from(LEARNING_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (signError || !signed) {
    throw new Error(`Lesson video signing failed: ${signError?.message ?? 'unknown'}`);
  }

  return { path, signedUrl: signed.signedUrl, mimeType: args.file.type || 'video/mp4' };
}

/** Re-sign a lesson video signed URL — used when the original has expired. */
export async function refreshLessonVideoSignedUrl(path: string): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from(LEARNING_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !data) {
    throw new Error(`Lesson video re-sign failed: ${error?.message ?? 'unknown'}`);
  }
  return data.signedUrl;
}

// Thin wrapper around Supabase Storage for the candidate resume bucket and
// the onboarder documents bucket. All callers use the admin client
// (server-side only) — public URLs are always signed, never exposed directly.

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAllowedTaskImageUpload, taskImageExtension } from '@/lib/task-image-uploads';
import { RESEARCH_COVERS_BUCKET, MAX_COVER_BYTES, coverImageExtension } from '@/lib/research-posts';
import {
  MAX_DIRECT_UPLOAD_BYTES,
  MAX_DIRECT_UPLOAD_LABEL,
  checkUploadFile,
  formatMegabytes,
  type DirectUploadReceipt,
  type DirectUploadTicket,
  type UploadPolicy,
} from '@/lib/direct-upload';

const BUCKET           = process.env.SUPABASE_RESUMES_BUCKET   ?? 'candidate-resumes';
const CANDIDATE_PREEMPLOYMENT_BUCKET = process.env.SUPABASE_CANDIDATE_PREEMPLOYMENT_BUCKET ?? 'candidate-pre-employment-docs';
const ONBOARDER_BUCKET = process.env.SUPABASE_ONBOARDER_BUCKET ?? 'onboarder-docs';
const LEARNING_BUCKET  = process.env.SUPABASE_LEARNING_BUCKET  ?? 'learning-content';
const TASK_IMAGE_BUCKET = process.env.SUPABASE_TASK_IMAGES_BUCKET ?? 'task-images';
const TIMESHEET_DOCS_BUCKET = process.env.SUPABASE_TIMESHEET_DOCS_BUCKET ?? 'timesheet-edit-docs';
const USER_PHOTOS_BUCKET = process.env.SUPABASE_USER_PHOTOS_BUCKET ?? 'user-photos';

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

function extensionFor(name: string, mime: string): string {
  const dot = name.lastIndexOf('.');
  if (dot > -1 && dot < name.length - 1) {
    return name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
  }
  if (mime === 'application/pdf') return 'pdf';
  if (mime.startsWith('image/'))  return mime.slice(6).replace('jpeg', 'jpg');
  return 'bin';
}

export type OnboarderUpload = {
  path:      string;
  signedUrl: string;
  mimeType:  string;
  sizeBytes: number;
};

/**
 * Server-side upload of an onboarder document, used only by the automation
 * submissions API route (files arriving from n8n). Browser uploads use the
 * direct signed-URL flow below instead. Caller inserts the onboarder_documents row.
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

// ── Direct (browser -> storage) uploads ────────────────────────────────────
// The server only issues a one-time signed upload URL and later checks the
// stored object; file bytes never go through a server action or function.

export type PreEmploymentDocumentKind = 'sow' | 'job_description' | 'ai_policy' | 'nda';

const DATE_STAMP = String.raw`\d{4}-\d{2}-\d{2}`;
const SLUG = '[a-z0-9]+(?:-[a-z0-9]+)*';
// Every upload gets its own name (time + random suffix), so an upload can
// never replace a file behind an earlier document row.
const UNIQUE = String.raw`\d{13}-[a-f0-9]{8}`;

function uniqueSuffix(now: number): string {
  return `${now}-${randomBytes(4).toString('hex')}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Same path scheme the old server-side upload used (same-day re-upload overwrites). */
export function onboarderDocumentPath(args: {
  onboarderId: number;
  kind:        OnboarderDocumentKind;
  fileName:    string;
  label?:      string | null;
  extension:   string;
  now?:        Date;
}): string {
  const now = args.now ?? new Date();
  const slug = slugify(args.label?.trim() || args.fileName.replace(/\.[^.]+$/, '') || args.kind);
  const stamp = now.toISOString().slice(0, 10);
  return `onboarders/${args.onboarderId}/${args.kind}/${slug}-${stamp}-${uniqueSuffix(now.getTime())}.${args.extension}`;
}

/** True only for a path shaped like one issued for this onboarder and kind. */
export function isIssuedOnboarderPath(path: string, onboarderId: number, kind: OnboarderDocumentKind): boolean {
  const re = new RegExp(`^onboarders/${onboarderId}/${escapeRegExp(kind)}/${SLUG}-${DATE_STAMP}-${UNIQUE}\\.[a-z0-9]+$`);
  return re.test(path);
}

export function preEmploymentDocumentPath(args: {
  candidateId: number;
  kind:        PreEmploymentDocumentKind;
  fileName:    string;
  extension:   string;
  now?:        number;
}): string {
  return `candidates/${args.candidateId}/pre-employment/${args.kind}/${uniqueSuffix(args.now ?? Date.now())}-${slugify(args.fileName.replace(/\.[^.]+$/, ''))}.${args.extension}`;
}

export function isIssuedPreEmploymentPath(path: string, candidateId: number, kind: PreEmploymentDocumentKind): boolean {
  const re = new RegExp(`^candidates/${candidateId}/pre-employment/${escapeRegExp(kind)}/${UNIQUE}-${SLUG}\\.[a-z0-9]+$`);
  return re.test(path);
}

// ── Upload check value ─────────────────────────────────────────────────────
// prepare signs (path, record id, doc type, user id, expiry) with HMAC-SHA256;
// record only accepts a path whose check value verifies. The key is derived
// from SUPABASE_SECRET_KEY, a server-only secret every environment already has
// (the admin client cannot run without it), so no new env var is needed. The
// derivation label keeps this key separate from the secret's other uses.

export const UPLOAD_CHECK_TTL_MS = 2 * 60 * 60 * 1000; // same as the signed upload URL

type UploadCheckFields = { path: string; recordId: number; kind: string; userId: number };

function uploadCheckKey(): Buffer {
  const secret = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!secret || secret === 'your-secret-key-here') throw new Error('Uploads are not configured on this server.');
  return createHmac('sha256', secret).update('rs-portal:direct-upload-check:v1').digest();
}

function uploadCheckMac(fields: UploadCheckFields, expiresAt: number): Buffer {
  const payload = [fields.path, fields.recordId, fields.kind, fields.userId, expiresAt].join('|');
  return createHmac('sha256', uploadCheckKey()).update(payload).digest();
}

export function signUploadCheck(fields: UploadCheckFields, now = Date.now()): string {
  const expiresAt = now + UPLOAD_CHECK_TTL_MS;
  return `${expiresAt}.${uploadCheckMac(fields, expiresAt).toString('base64url')}`;
}

/** Throws unless the check value was issued for exactly these fields and hasn't expired. */
export function verifyUploadCheck(check: unknown, fields: UploadCheckFields, now = Date.now()): void {
  const match = /^(\d{13})\.([A-Za-z0-9_-]{43})$/.exec(String(check ?? ''));
  const invalid = 'This upload could not be verified. Please upload the file again.';
  if (!match) throw new Error(invalid);
  const expiresAt = Number(match[1]);
  const given = Buffer.from(match[2], 'base64url');
  const expected = uploadCheckMac(fields, expiresAt);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new Error(invalid);
  if (now > expiresAt) throw new Error('This upload has expired. Please upload the file again.');
}

const DIRECT_UPLOAD_BUCKETS: Record<UploadPolicy, string> = {
  onboarder_document:      ONBOARDER_BUCKET,
  pre_employment_document: CANDIDATE_PREEMPLOYMENT_BUCKET,
};

/**
 * Issue a one-time signed upload URL for an onboarder document. Returns the
 * bucket, the storage path and the token the browser passes to
 * supabase-js `uploadToSignedUrl`.
 */
export async function createOnboarderUploadUrl(args: {
  onboarderId: number;
  kind:        OnboarderDocumentKind;
  fileName:    string;
  label?:      string | null;
  extension:   string;
  userId:      number;
}): Promise<DirectUploadTicket> {
  const path = onboarderDocumentPath(args);
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(ONBOARDER_BUCKET).createSignedUploadUrl(path, { upsert: false });
  if (error || !data) throw new Error(`Could not start the upload: ${error?.message ?? 'unknown'}`);
  const check = signUploadCheck({ path, recordId: args.onboarderId, kind: args.kind, userId: args.userId });
  return { bucket: ONBOARDER_BUCKET, path, token: data.token, check };
}

export async function createPreEmploymentUploadUrl(args: {
  candidateId: number;
  kind:        PreEmploymentDocumentKind;
  fileName:    string;
  extension:   string;
  userId:      number;
}): Promise<DirectUploadTicket> {
  const path = preEmploymentDocumentPath(args);
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(CANDIDATE_PREEMPLOYMENT_BUCKET).createSignedUploadUrl(path, { upsert: false });
  if (error || !data) throw new Error(`Could not start the upload: ${error?.message ?? 'unknown'}`);
  const check = signUploadCheck({ path, recordId: args.candidateId, kind: args.kind, userId: args.userId });
  return { bucket: CANDIDATE_PREEMPLOYMENT_BUCKET, path, token: data.token, check };
}

/** Refuse a path that is already recorded in the given documents table. */
export async function assertPathNotRecorded(
  table: 'onboarder_documents' | 'candidate_pre_employment_documents',
  path: string,
): Promise<void> {
  const { data, error } = await createAdminClient().from(table).select('id').eq('storage_path', path).maybeSingle();
  if (error) throw new Error(`Could not check the upload: ${error.message}`);
  if (data) throw new Error('This file has already been recorded.');
}

export type VerifiedUpload = { path: string; mimeType: string; sizeBytes: number };

/**
 * Check a browser-uploaded object before recording it: it must exist, be no
 * bigger than the cap (an oversize object is deleted), and match the size and
 * type the browser reported. The caller checks the path was issued first.
 */
export async function verifyDirectUpload(policy: UploadPolicy, receipt: DirectUploadReceipt): Promise<VerifiedUpload> {
  const bucket = DIRECT_UPLOAD_BUCKETS[policy];
  // The path's extension decides the type the object must have been stored as.
  const expected = checkUploadFile({ name: receipt.path, size: 1, type: receipt.type }, policy);
  if (!expected.ok) throw new Error(expected.error);

  const slash = receipt.path.lastIndexOf('/');
  const folder = receipt.path.slice(0, slash);
  const name = receipt.path.slice(slash + 1);
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(bucket).list(folder, { search: name, limit: 100 });
  if (error) throw new Error(`Could not check the uploaded file: ${error.message}`);
  const object = (data ?? []).find(item => item.name === name);
  if (!object) throw new Error('The uploaded file was not found in storage. Please upload it again.');

  const metadata = (object.metadata ?? {}) as { size?: number; mimetype?: string };
  const size = Number(metadata.size);
  const mimeType = String(metadata.mimetype ?? '');
  if (!Number.isFinite(size) || size > MAX_DIRECT_UPLOAD_BYTES) {
    const { error: removeError } = await admin.storage.from(bucket).remove([receipt.path]);
    if (removeError) console.error('[storage] oversize upload cleanup failed:', receipt.path, removeError.message);
    throw new Error(`File is ${Number.isFinite(size) ? formatMegabytes(size) : 'too large'}. The limit is ${MAX_DIRECT_UPLOAD_LABEL}.`);
  }
  if (size <= 0) throw new Error('The uploaded file is empty. Please upload it again.');
  if (size !== Number(receipt.size)) throw new Error('The uploaded file does not match the selected file. Please upload it again.');
  if (mimeType !== expected.contentType) {
    throw new Error('The uploaded file type does not match the selected file. Please upload it again.');
  }
  return { path: receipt.path, mimeType, sizeBytes: size };
}

/** Long-lived signed URL for a pre-employment document (sent to candidates). */
export async function signPreEmploymentDocument(path: string): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(CANDIDATE_PREEMPLOYMENT_BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !data) throw new Error(`Document signing failed: ${error?.message ?? 'unknown'}`);
  return data.signedUrl;
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

// ─────────────────────────────────────────────────────────────────────────────
// Task images — JPG/PNG screenshots attached to work-item descriptions.
// Bucket is private; we return a signed URL that the description preview can
// render just like externally-hosted image URLs.
// ─────────────────────────────────────────────────────────────────────────────

export type TaskImageUpload = {
  path: string;
  signedUrl: string;
  mimeType: string;
  sizeBytes: number;
};

// ─────────────────────────────────────────────────────────────────────────────
// Timesheet edit-request documents — optional supporting files (screenshots,
// medical certs, outage tickets) an IC attaches when requesting a time
// correction. Private bucket; leads/admins get a short-lived signed URL when
// reviewing the request in the approval queue.
// ─────────────────────────────────────────────────────────────────────────────

const ALLOWED_EDIT_DOC_MIME = new Set([
  'application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/heic',
]);

export function isAllowedTimesheetEditDoc(file: File): boolean {
  return ALLOWED_EDIT_DOC_MIME.has(file.type);
}

export type TimesheetEditUpload = { path: string; name: string; mimeType: string; sizeBytes: number };

/** Upload an optional supporting document for a time-edit request. */
export async function uploadTimesheetEditDocument(args: {
  userId: number;
  file:   File;
}): Promise<TimesheetEditUpload> {
  const ext = extensionFor(args.file.name, args.file.type);
  const base = slugify(args.file.name.replace(/\.[^.]+$/, '') || 'document');
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const path = `time-edits/${args.userId}/${base}-${stamp}.${ext}`;

  const admin = createAdminClient();
  const bytes = new Uint8Array(await args.file.arrayBuffer());

  const { error } = await admin.storage.from(TIMESHEET_DOCS_BUCKET).upload(path, bytes, {
    contentType: args.file.type || 'application/octet-stream',
    upsert: false,
  });
  if (error) throw new Error(`Document upload failed: ${error.message}`);

  return { path, name: args.file.name, mimeType: args.file.type || 'application/octet-stream', sizeBytes: args.file.size };
}

/** Short-lived signed URL (1h) for a lead/admin reviewing an edit-request doc. */
export async function signTimesheetEditDocument(path: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin.storage.from(TIMESHEET_DOCS_BUCKET).createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}

export async function uploadTaskImageToStorage(args: {
  workItemId: number;
  file: File;
}): Promise<TaskImageUpload> {
  if (!isAllowedTaskImageUpload(args.file)) {
    throw new Error('Only JPG and PNG images are accepted.');
  }

  const ext = taskImageExtension(args.file.name);
  const name = args.file.name.replace(/\.[^.]+$/, '') || 'image';
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const path = `work-items/${args.workItemId}/${slugify(name)}-${stamp}.${ext}`;

  const admin = createAdminClient();
  const bytes = new Uint8Array(await args.file.arrayBuffer());

  const { error: uploadError } = await admin.storage.from(TASK_IMAGE_BUCKET).upload(path, bytes, {
    contentType: args.file.type,
    upsert: false,
  });
  if (uploadError) {
    throw new Error(`Task image upload failed: ${uploadError.message}`);
  }

  const { data: signed, error: signError } = await admin.storage
    .from(TASK_IMAGE_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (signError || !signed) {
    throw new Error(`Task image signing failed: ${signError?.message ?? 'unknown'}`);
  }

  return {
    path,
    signedUrl: signed.signedUrl,
    mimeType: args.file.type,
    sizeBytes: args.file.size,
  };
}

// ── User photos — PUBLIC bucket, so a plain URL works everywhere ───────────
export function userPhotoUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${USER_PHOTOS_BUCKET}/${path}`;
}

export async function uploadUserPhoto(userId: number, file: File): Promise<string> {
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  // Fresh key per upload so browsers/CDN never serve a stale cached photo.
  const path = `${userId}/${Date.now()}.${ext}`;
  const { error } = await createAdminClient().storage.from(USER_PHOTOS_BUCKET).upload(path, file, { contentType: file.type });
  if (error) throw new Error(`User photo upload failed: ${error.message}`);
  return path;
}

export type PhotoResolver = (who: { name?: string | null; email?: string | null }) => string | null;

/** Portal-owned photos keyed by email. Call once per request, then map a
 *  whole roster through the returned closure. No photo = initials avatar. */
export async function getUserPhotoResolver(): Promise<PhotoResolver> {
  const admin = createAdminClient();
  const { data: rows } = await admin.from('user_reporting').select('user_id, photo_path').not('photo_path', 'is', null);
  const byEmail = new Map<string, string>();
  if (rows?.length) {
    const { data: users } = await admin.from('users').select('id, email').in('id', rows.map(r => r.user_id));
    for (const row of rows) {
      const email = users?.find(u => u.id === row.user_id)?.email;
      const url = userPhotoUrl(row.photo_path);
      if (email && url) byEmail.set(String(email).toLowerCase(), url);
    }
  }
  return (who) => byEmail.get(who.email?.toLowerCase().trim() ?? '') ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Market Research cover images. Unlike the buckets above this one is PUBLIC
// (the website + og:image crawlers need a stable URL), so we return only the
// path; researchCoverUrl() turns it into the public URL. Names are random so a
// draft's cover isn't guessable before it's published.
// ─────────────────────────────────────────────────────────────────────────────

export async function uploadResearchCover(file: File): Promise<{ path: string }> {
  const ext = coverImageExtension(file);
  if (!ext) throw new Error('Only JPG, PNG, and WebP images are accepted.');
  if (file.size > MAX_COVER_BYTES) throw new Error('Cover image must be 5 MB or smaller.');

  const path = `covers/${crypto.randomUUID()}.${ext}`;
  const admin = createAdminClient();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error } = await admin.storage.from(RESEARCH_COVERS_BUCKET).upload(path, bytes, {
    contentType: file.type,
    upsert: false,
  });
  if (error) throw new Error(`Cover upload failed: ${error.message}`);
  return { path };
}

// Best-effort cleanup when a cover is replaced or its post deleted — a leftover
// object is harmless, so failures are logged rather than thrown.
export async function removeResearchCover(path: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.storage.from(RESEARCH_COVERS_BUCKET).remove([path]);
  if (error) console.error('[research] cover cleanup failed:', path, error.message);
}

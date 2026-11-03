// Shared rules for direct-to-storage uploads. The browser sends file bytes
// straight to Supabase Storage through a one-time signed upload URL, so they
// never pass through a server action (1 MB default body limit) or a Vercel
// function (4.5 MB request cap). These rules run in three places: in the
// browser before upload, in the server "prepare" step before a signed URL is
// issued, and again in the "record" step against the stored object.
//
// Safe to import from both client and server code (no server-only deps).

export const MAX_DIRECT_UPLOAD_BYTES = 25 * 1024 * 1024;
export const MAX_DIRECT_UPLOAD_LABEL = '25 MB';

export type UploadPolicy = 'onboarder_document' | 'pre_employment_document';

const PDF  = 'application/pdf';
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

// Extension -> canonical MIME type the object is stored with.
const POLICY_TYPES: Record<UploadPolicy, Record<string, string>> = {
  onboarder_document: {
    pdf:  PDF,
    docx: DOCX,
    png:  'image/png',
    jpg:  'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif:  'image/gif',
    heic: 'image/heic',
    heif: 'image/heif',
  },
  pre_employment_document: {
    pdf:  PDF,
    docx: DOCX,
  },
};

// Browser-reported MIME aliases that are fine for a given canonical type.
const MIME_ALIASES: Record<string, string[]> = {
  'image/jpeg': ['image/jpg', 'image/pjpeg'],
  'image/heic': ['image/heic-sequence'],
  'image/heif': ['image/heif-sequence'],
};

export const POLICY_HINT: Record<UploadPolicy, string> = {
  onboarder_document:      'PDF, image (JPG, PNG, WebP, GIF, HEIC) or DOCX',
  pre_employment_document: 'PDF or DOCX',
};

export type UploadFileMeta = { name: string; size: number; type: string };

export type UploadCheck =
  | { ok: true; contentType: string; extension: string }
  | { ok: false; error: string };

export function fileExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  if (dot < 0 || dot === name.length - 1) return '';
  return name.slice(dot + 1).toLowerCase();
}

export function formatMegabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Validate a file's name, size and type against an upload policy. Returns the
 * canonical content type to store the object with. The extension decides the
 * type; a browser-reported MIME type must agree with it when present.
 */
export function checkUploadFile(file: UploadFileMeta, policy: UploadPolicy): UploadCheck {
  const name = String(file.name ?? '').trim();
  const size = Number(file.size);
  if (!name) return { ok: false, error: 'Choose a file to upload' };
  if (!Number.isFinite(size) || size <= 0) return { ok: false, error: 'The file is empty' };
  if (size > MAX_DIRECT_UPLOAD_BYTES) {
    return { ok: false, error: `File is ${formatMegabytes(size)}. The limit is ${MAX_DIRECT_UPLOAD_LABEL}.` };
  }
  const extension = fileExtension(name);
  const contentType = POLICY_TYPES[policy][extension];
  if (!contentType) {
    return { ok: false, error: `This file type isn't allowed. Upload a ${POLICY_HINT[policy]}.` };
  }
  const reported = String(file.type ?? '').trim().toLowerCase();
  if (reported && reported !== 'application/octet-stream'
      && reported !== contentType && !(MIME_ALIASES[contentType] ?? []).includes(reported)) {
    return { ok: false, error: `The file's type (${reported}) doesn't match its .${extension} name.` };
  }
  return { ok: true, contentType, extension };
}

/** The value for an <input type="file" accept> attribute for a policy. */
export function acceptAttribute(policy: UploadPolicy): string {
  const types = POLICY_TYPES[policy];
  return [...Object.keys(types).map(ext => `.${ext}`), ...new Set(Object.values(types))].join(',');
}

/** What the browser hands back to the record step after a direct upload. */
export type DirectUploadReceipt = {
  path:     string;
  fileName: string;
  size:     number;
  type:     string;
};

/** What a prepare step returns: where to upload and the one-time token. */
export type DirectUploadTicket = {
  bucket: string;
  path:   string;
  token:  string;
};

/**
 * Server actions return errors as values: Next.js hides thrown error messages
 * in production, and these are messages the uploader needs to read.
 */
export type UploadActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

export function uploadErrorMessage(err: unknown, fallback = 'Upload failed'): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

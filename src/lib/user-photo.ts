// Profile-photo rules, shared by the upload form (instant feedback) and the
// upload route (authoritative check). Keep in sync with the `user-photos`
// bucket's allowed_mime_types / file_size_limit.
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const PHOTO_MAX_BYTES = 4_000_000; // under Vercel's 4.5 MB request-body cap

/** Error message for a file that can't be a profile photo, or null if OK. */
export function photoError(file: { type: string; size: number }): string | null {
  if (!PHOTO_TYPES.includes(file.type)) return 'Photo must be a JPG, PNG or WebP image';
  if (file.size > PHOTO_MAX_BYTES) return 'Photo must be 4 MB or smaller';
  return null;
}

/** True if the bytes really are a JPG, PNG or WebP (the reported type can be faked). */
export function isImageBytes(b: Uint8Array): boolean {
  const jpg  = b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  const png  = b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  const webp = String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP';
  return jpg || png || webp;
}

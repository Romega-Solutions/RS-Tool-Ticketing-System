// Pure YouTube URL helpers — no React, safe to import from both server
// (actions, RSC) and client. Used by the lesson player, the admin preview,
// and the admin save actions so "paste a YouTube link" behaves consistently.

/** Pull the 11-char video id out of any common YouTube URL/shorthand, else null. */
export function extractYoutubeId(url: string): string | null {
  if (!url) return null;
  // youtu.be/ID · /embed/ID · /shorts/ID · /live/ID
  const path = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|shorts\/|live\/))([A-Za-z0-9_-]{11})/);
  if (path) return path[1];
  // watch?…&v=ID — v may sit anywhere in the query string.
  const query = url.match(/[?&]v=([A-Za-z0-9_-]{11})/);
  if (query) return query[1];
  return null;
}

/** True when the string is plausibly a YouTube link (used to auto-pick the source). */
export function isYoutubeUrl(url: string): boolean {
  return /(?:youtu\.be\/|youtube\.com\/)/i.test(url ?? '');
}

/** A privacy-friendly embeddable URL for the given watch URL, or null if unparseable. */
export function youtubeEmbedUrl(url: string): string | null {
  const id = extractYoutubeId(url);
  return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
}

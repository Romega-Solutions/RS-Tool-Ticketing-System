// Pure, client-safe helpers for lesson-body Markdown rendering.
// Kept dependency-free so the lesson player's client bundle doesn't pull in
// any server-only modules.

// External links (http/https) open in a new tab; relative/in-app links don't.
export function isExternalUrl(href: string | null | undefined): boolean {
  if (!href) return false;
  return /^https?:\/\//i.test(href.trim());
}

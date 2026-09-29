// Pure helpers for a task's "Related links" — shared by the API route and the
// task sheet, so validation and the activity payload stay in one place.

export const LINK_TITLE_MAX = 200;
export const LINK_URL_MAX = 2048;

/**
 * Normalize user input into a safe http(s) URL, or null if it isn't one.
 * A bare host ("github.com/foo") gets https:// prepended; any other scheme
 * (javascript:, data:, mailto:, …) is rejected so the link is safe to render.
 */
export function normalizeLinkUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > LINK_URL_MAX) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (!url.hostname.includes('.') && url.hostname !== 'localhost') return null;
  return url.toString();
}

/** Display text for a link: its title, else the URL minus the scheme. */
export function linkDisplayText(title: string, url: string): string {
  return title.trim() || url.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

// link_added / link_removed activity rows store the link as JSON in to_value /
// from_value so the timeline can render it after the link itself is deleted.
export interface LinkActivityValue {
  title: string;
  url: string;
}

export function encodeLinkActivity(link: LinkActivityValue): string {
  return JSON.stringify({ title: link.title, url: link.url });
}

export function decodeLinkActivity(raw: string | null): LinkActivityValue | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<LinkActivityValue>;
    if (typeof v.url !== 'string' || normalizeLinkUrl(v.url) == null) return null;
    return { title: typeof v.title === 'string' ? v.title : '', url: v.url };
  } catch {
    return null;
  }
}

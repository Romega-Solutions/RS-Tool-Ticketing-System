/**
 * Pull the mentioned user ids out of submitted comment HTML.
 *
 * The Tiptap Mention extension serializes each mention as
 * `<span data-type="mention" data-id="123" data-label="…">@Name</span>`.
 * We scan every span, keep the ones tagged `data-type="mention"`, and read their
 * `data-id`. Robust to attribute order and quote style. Run this on the RAW HTML
 * *before* sanitizing — `sanitizeRichText` strips the `data-*` attributes.
 *
 * Pure function (no I/O) so it can be unit-tested directly.
 */
export function extractMentionUserIds(html: string | null | undefined): number[] {
  if (!html) return [];
  const ids = new Set<number>();
  const spanRe = /<span\b([^>]*)>/gi;
  let m: RegExpExecArray | null;
  while ((m = spanRe.exec(html)) !== null) {
    const attrs = m[1];
    if (!/data-type\s*=\s*["']mention["']/i.test(attrs)) continue;
    const idMatch = attrs.match(/data-id\s*=\s*["'](\d+)["']/i);
    if (!idMatch) continue;
    const id = Number(idMatch[1]);
    if (Number.isInteger(id) && id > 0) ids.add(id);
  }
  return [...ids];
}

// Strip tags to a readable plain-text snippet for the activity log + email.
export function toPlainText(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

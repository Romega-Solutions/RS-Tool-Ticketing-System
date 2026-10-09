// Shared task-search matching for the project board and My Tasks.
// Kept dependency-free so it can run in the client bundle.

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
};

// Task descriptions are stored as rich-text HTML. Reduce one to lowercase plain
// text so a search hits the words people typed, not tag or attribute names.
// Block-level tags become spaces so "<p>foo</p><p>bar</p>" doesn't read "foobar".
export function descriptionSearchText(html: string | null | undefined): string {
  if (!html) return '';
  return html
    .replace(/<\/?(?:p|br|li|ul|ol|h[1-6]|blockquote|pre|div)\b[^>]*>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
      const c = code.toLowerCase();
      if (c.startsWith('#x')) return String.fromCodePoint(parseInt(c.slice(2), 16));
      if (c.startsWith('#')) return String.fromCodePoint(parseInt(c.slice(1), 10));
      return ENTITIES[c] ?? m;
    })
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export type TaskSearchQuery = {
  term: string;
  // "12", "#12", or "PROJ-12" → match the ticket number (and project identifier when given).
  number?: string;
  identifier?: string;
};

export function parseTaskSearch(raw: string): TaskSearchQuery | null {
  const term = raw.trim().toLowerCase();
  if (!term) return null;
  const m = term.match(/^(?:#|([a-z0-9]+)-)?(\d+)$/);
  return m ? { term, number: m[2], identifier: m[1] } : { term };
}

// `text` is the item's pre-lowercased searchable text (title, description, …);
// build it once per item rather than per keystroke.
export function matchesTaskSearch(
  q: TaskSearchQuery,
  item: { text: string; sequence_id: number; identifier?: string },
): boolean {
  if (item.text.includes(q.term)) return true;
  if (q.number === undefined || String(item.sequence_id) !== q.number) return false;
  return !q.identifier || !item.identifier || item.identifier.toLowerCase() === q.identifier;
}

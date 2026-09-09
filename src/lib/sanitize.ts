import sanitizeHtml from 'sanitize-html';

// Allowlist sized to exactly what the Tiptap job-description editor can emit:
// StarterKit (bold→<strong>, italic→<em>, strike→<s>, underline→<u>, lists,
// blockquote, headings, code) + TextStyle/FontSize (<span style="font-size:…">)
// + links. Everything else (scripts, event handlers, arbitrary styles, images)
// is stripped. Run on write AND on render — it's idempotent.

const FONT_SIZE = /^\d+(?:\.\d+)?(?:px|pt|em|rem|%)$/;

// The Tiptap editor is WYSIWYG, not a raw-HTML input: typing the characters
// `<br>` into it (a common instinct when someone wants a line break and
// doesn't find one via the toolbar) becomes literal text, which the editor's
// HTML serializer correctly escapes to `&lt;br&gt;` — and that then renders
// as the visible string "<br>" instead of an actual line break. Normalize
// that specific, predictable mistake into a real `<br>` before sanitizing.
// Applied on every sanitize call (write + render), so it also repairs
// descriptions that were already saved this way.
const LITERAL_BR = /&lt;\s*br\s*\/?\s*&gt;/gi;

export function sanitizeRichText(dirty: string): string {
  const normalized = (dirty ?? '').replace(LITERAL_BR, '<br>');
  return sanitizeHtml(normalized, {
    allowedTags: [
      'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'strike',
      'ul', 'ol', 'li', 'blockquote', 'h1', 'h2', 'h3', 'code', 'pre', 'span', 'a',
    ],
    allowedAttributes: {
      a:    ['href', 'target', 'rel'],
      span: ['style'],
    },
    allowedStyles: {
      '*': { 'font-size': [FONT_SIZE] },
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    transformTags: {
      // Force every link to open safely in a new tab.
      a: (_tag, attribs) => ({
        tagName: 'a',
        attribs: { ...attribs, target: '_blank', rel: 'noopener noreferrer nofollow' },
      }),
    },
  });
}

// True when the HTML has no visible text content (Tiptap leaves an empty
// "<p></p>" behind when the editor is cleared).
export function isRichTextEmpty(html: string | null | undefined): boolean {
  if (!html) return true;
  const text = html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
  return text.length === 0;
}

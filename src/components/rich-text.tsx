import { sanitizeRichText } from '@/lib/sanitize';

// Server component: renders stored job-description HTML safely. Sanitizes again
// at render time (defense in depth) and applies the `.rs-richtext` styles so
// lists/headings survive Tailwind's preflight reset.
export function RichText({ html, className }: { html: string; className?: string }) {
  const clean = sanitizeRichText(html);
  return (
    <div
      className={`rs-richtext ${className ?? ''}`}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}

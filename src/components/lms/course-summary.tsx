import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowUpRight } from 'lucide-react';
import { isExternalUrl } from '@/lib/lms-markdown';

// Spacious, readable renderer for a course summary/description. Same safe
// Markdown pipeline as lesson bodies (remark-gfm autolinks; react-markdown v10
// strips raw HTML and dangerous schemes — no XSS surface), but tuned for the
// course overview: larger prose, generous line-height, capped reading width.
const components: Components = {
  a(props) {
    const { href, children } = props;
    const external = isExternalUrl(href);
    return (
      <a
        href={href ?? undefined}
        {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        className="font-medium text-(--rs-primary-600) underline underline-offset-2 hover:text-(--rs-primary-700) break-words"
      >
        {children}
        {external && <ArrowUpRight className="inline-block w-3.5 h-3.5 ml-0.5 -translate-y-px" aria-hidden />}
      </a>
    );
  },
};

export function CourseSummary({ md, className }: { md: string | null; className?: string }) {
  if (!md || !md.trim()) return null;
  return (
    <div
      className={
        'prose max-w-[68ch] text-[0.95rem] leading-relaxed text-(--rs-neutral-grey-700) ' +
        'prose-headings:font-serif prose-headings:text-(--rs-neutral-grey-900) ' +
        'prose-p:leading-[1.65] prose-li:leading-[1.6] prose-strong:text-(--rs-neutral-grey-900) ' +
        'prose-hr:border-(--rs-neutral-grey-100) ' + (className ?? '')
      }
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>{md}</ReactMarkdown>
    </div>
  );
}

// Strip Markdown to plain text for compact previews (cards, lists).
export function stripMarkdown(md: string | null | undefined): string {
  if (!md) return '';
  return md
    .replace(/```[\s\S]*?```/g, ' ')          // code fences
    .replace(/`([^`]+)`/g, '$1')              // inline code
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')    // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')  // links → label
    .replace(/^[#>\s-]+/gm, '')               // heading/quote/list markers
    .replace(/[*_~]+/g, '')                   // emphasis markers
    .replace(/\s+/g, ' ')
    .trim();
}

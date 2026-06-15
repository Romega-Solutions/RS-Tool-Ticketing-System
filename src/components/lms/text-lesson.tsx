import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowUpRight } from 'lucide-react';
import { isExternalUrl } from '@/lib/lms-markdown';

// Shared lesson-body renderer. remark-gfm turns raw pasted URLs into real
// links (so authors can drop a Google Slides / video URL and learners get a
// one-click link). External links open in a new tab and carry rel="noopener";
// in-app links navigate normally. react-markdown v10 strips dangerous URL
// schemes (javascript:, etc.) and never renders raw HTML, so there's no XSS
// surface from lesson content.
const markdownComponents: Components = {
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
        {external && (
          <ArrowUpRight className="inline-block w-3.5 h-3.5 ml-0.5 -translate-y-px" aria-hidden />
        )}
      </a>
    );
  },
};

export function TextLesson({ body }: { body: string | null }) {
  if (!body || !body.trim()) {
    return (
      <p className="text-sm italic text-(--rs-neutral-grey-400)">
        This lesson has no written content.
      </p>
    );
  }
  return (
    <div className="prose prose-sm max-w-none prose-headings:font-serif prose-headings:text-(--rs-neutral-grey-900)">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {body}
      </ReactMarkdown>
    </div>
  );
}

import ReactMarkdown from 'react-markdown';

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
      <ReactMarkdown>{body}</ReactMarkdown>
    </div>
  );
}

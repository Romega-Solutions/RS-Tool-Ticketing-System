'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { RichTextEditor } from '@/components/rich-text-editor.client';
import { RichText } from '@/components/rich-text';
import { isRichTextEmpty } from '@/lib/sanitize';

interface ProjectComment {
  id: number;
  author_id: number;
  author_name: string;
  body: string;
  created_at: string;
}

interface Member {
  user_id: number;
  name: string;
}

function fmt(ts: string): string {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function ProjectDiscussionClient({
  projectId,
  initialComments,
  members,
  currentUserId,
  isAdmin,
  canComment,
  initialFocusCommentId,
}: {
  projectId: string;
  initialComments: ProjectComment[];
  members: Member[];
  currentUserId: number;
  isAdmin: boolean;
  canComment: boolean;
  initialFocusCommentId?: string | null;
}) {
  const [comments, setComments] = useState<ProjectComment[]>(initialComments);
  const [newComment, setNewComment] = useState('');
  const [postingComment, setPostingComment] = useState(false);
  const [error, setError] = useState('');
  const [highlightCommentId, setHighlightCommentId] = useState<string | null>(null);
  const commentsListRef = useRef<HTMLDivElement>(null);
  const handledFocusRef = useRef(false);

  // Honor a ?comment= deep link (from a "tagged you" notification): scroll to
  // and briefly highlight the tagged comment. Guarded by a ref so it only
  // fires once even though `comments` can change after this runs (posting).
  useEffect(() => {
    if (!initialFocusCommentId || handledFocusRef.current) return;
    if (!comments.some(c => String(c.id) === initialFocusCommentId)) return;
    handledFocusRef.current = true;

    let innerRaf = 0;
    const raf = window.requestAnimationFrame(() => {
      innerRaf = window.requestAnimationFrame(() => {
        commentsListRef.current
          ?.querySelector(`[data-comment-id="${initialFocusCommentId}"]`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setHighlightCommentId(initialFocusCommentId);
      });
    });
    const clear = window.setTimeout(() => setHighlightCommentId(null), 2600);
    return () => {
      window.cancelAnimationFrame(raf);
      window.cancelAnimationFrame(innerRaf);
      window.clearTimeout(clear);
    };
  }, [initialFocusCommentId, comments]);

  const handlePostComment = async () => {
    if (isRichTextEmpty(newComment)) return;
    setPostingComment(true); setError('');
    try {
      const res = await fetch(`/api/tickets/projects/${projectId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: newComment }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? 'Failed to post');
      }
      const created = (await res.json()) as ProjectComment;
      setComments(prev => [...prev, created]);
      setNewComment('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setPostingComment(false);
    }
  };

  const handleDeleteComment = async (commentId: number) => {
    const res = await fetch(`/api/tickets/projects/${projectId}/comments/${commentId}`, {
      method: 'DELETE',
    });
    if (res.ok) setComments(prev => prev.filter(c => c.id !== commentId));
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      <div ref={commentsListRef} className="space-y-3">
        {comments.length === 0 && (
          <p className="text-sm text-(--rs-neutral-grey-400) italic">No discussion yet.</p>
        )}
        {comments.map(c => (
          <div
            key={c.id}
            data-comment-id={c.id}
            className={`rounded-lg p-3 transition-colors duration-500 ${
              highlightCommentId === String(c.id)
                ? 'border border-(--rs-accent-300) bg-(--rs-accent-50) ring-2 ring-(--rs-accent-200)'
                : 'border border-(--rs-neutral-grey-100) bg-white'
            }`}
          >
            <div className="flex items-center justify-between text-xs text-(--rs-neutral-grey-500) mb-1.5">
              <span className="font-medium text-(--rs-neutral-grey-800)">{c.author_name}</span>
              <div className="flex items-center gap-2">
                <span>{fmt(c.created_at)}</span>
                {(c.author_id === currentUserId || isAdmin) && (
                  <button
                    onClick={() => handleDeleteComment(c.id)}
                    className="flex h-8 w-8 items-center justify-center rounded-md text-(--rs-neutral-grey-400) hover:bg-red-50 hover:text-red-500"
                    title="Delete"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
            <RichText html={c.body} className="text-sm text-(--rs-neutral-grey-800)" />
          </div>
        ))}
      </div>

      {canComment && (
        <div className="pt-2 space-y-2">
          <RichTextEditor
            value={newComment}
            onChange={setNewComment}
            placeholder="Write an update… use @ to tag a teammate"
            bodyClassName="min-h-[84px] overflow-y-auto"
            enableMentions
            enableEmoji
            mentionUsers={members.map(m => ({ id: m.user_id, name: m.name }))}
          />
          <button
            onClick={handlePostComment}
            disabled={postingComment || isRichTextEmpty(newComment)}
            className="flex min-h-10 items-center justify-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            style={{ background: 'var(--rs-primary-500)' }}
          >
            {postingComment && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Post
          </button>
        </div>
      )}
    </div>
  );
}

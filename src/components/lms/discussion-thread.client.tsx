'use client';

import { useState, useTransition } from 'react';

export type DiscussionComment = {
  id:        number;
  body:      string;
  userId:    number;
  userName:  string;
  parentId:  number | null;
  pinned:    number;
  deletedAt: string | null;
  createdAt: string;
};

type Props = {
  lessonId:    number;
  currentUserId: number;
  isAdmin:     boolean;
  comments:    DiscussionComment[];
  onPost:      (lessonId: number, body: string, parentId: number | null) => Promise<void>;
  onDelete:    (commentId: number) => Promise<void>;
  onPin:       (commentId: number, pinned: boolean) => Promise<void>;
};

export function DiscussionThread(props: Props) {
  const [body, setBody] = useState('');
  const [replyTo, setReplyTo] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function submit() {
    const text = body.trim();
    if (!text) return;
    setErr(null);
    startTransition(async () => {
      try {
        await props.onPost(props.lessonId, text, replyTo);
        setBody('');
        setReplyTo(null);
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Could not post.');
      }
    });
  }

  // Top-level comments first (pinned first), then their direct replies.
  const tops = props.comments
    .filter(c => c.parentId === null && c.deletedAt === null)
    .sort((a, b) => (b.pinned - a.pinned) || (a.createdAt < b.createdAt ? -1 : 1));

  function repliesOf(id: number) {
    return props.comments
      .filter(c => c.parentId === id && c.deletedAt === null)
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  }

  return (
    <section className="space-y-4 rounded-xl border border-(--rs-neutral-grey-200) bg-white p-5">
      <h3 className="font-serif text-base font-semibold text-(--rs-neutral-grey-800)">Discussion</h3>

      {tops.length === 0 ? (
        <p className="text-sm italic text-(--rs-neutral-grey-400)">
          No comments yet. Be the first to start the conversation.
        </p>
      ) : (
        <ul className="space-y-3">
          {tops.map(c => (
            <li key={c.id} className="space-y-2">
              <CommentRow
                comment={c}
                isOwn={c.userId === props.currentUserId}
                isAdmin={props.isAdmin}
                onReply={() => setReplyTo(c.id)}
                onDelete={() => props.onDelete(c.id)}
                onPin={(p) => props.onPin(c.id, p)}
              />
              {repliesOf(c.id).map(r => (
                <div key={r.id} className="pl-8">
                  <CommentRow
                    comment={r}
                    isOwn={r.userId === props.currentUserId}
                    isAdmin={props.isAdmin}
                    onReply={() => setReplyTo(c.id)}
                    onDelete={() => props.onDelete(r.id)}
                    onPin={(p) => props.onPin(r.id, p)}
                    isReply
                  />
                </div>
              ))}
            </li>
          ))}
        </ul>
      )}

      <div className="border-t border-(--rs-neutral-grey-100) pt-3 space-y-2">
        {replyTo !== null && (
          <div className="text-xs text-(--rs-neutral-grey-500)">
            Replying to comment #{replyTo}.{' '}
            <button type="button" onClick={() => setReplyTo(null)} className="text-(--rs-primary-600) hover:underline">
              Cancel
            </button>
          </div>
        )}
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          rows={3}
          placeholder="Write a comment…"
          className="block w-full rounded-md border border-(--rs-neutral-grey-300) bg-white px-3 py-2 text-sm"
        />
        <div className="flex items-center gap-3">
          <button type="button" onClick={submit} disabled={pending || !body.trim()}
            className="rounded-md bg-(--rs-primary-500) text-white text-sm font-semibold px-3 py-1.5 hover:bg-(--rs-primary-600) disabled:opacity-50">
            {pending ? 'Posting…' : (replyTo !== null ? 'Reply' : 'Post')}
          </button>
          {err && <p className="text-sm text-red-600">{err}</p>}
        </div>
      </div>
    </section>
  );
}

function CommentRow({
  comment, isOwn, isAdmin, onReply, onDelete, onPin, isReply,
}: {
  comment:  DiscussionComment;
  isOwn:    boolean;
  isAdmin:  boolean;
  onReply:  () => void;
  onDelete: () => Promise<void>;
  onPin:    (pinned: boolean) => Promise<void>;
  isReply?: boolean;
}) {
  const [pending, start] = useTransition();
  return (
    <article className={`rounded-md ${isReply ? 'bg-(--rs-neutral-grey-50)' : ''} p-3`}>
      <header className="flex items-center gap-2 text-xs text-(--rs-neutral-grey-500)">
        <span className="font-semibold text-(--rs-neutral-grey-700)">{comment.userName}</span>
        <span>·</span>
        <span>{new Date(comment.createdAt).toLocaleDateString('en-US')}</span>
        {comment.pinned === 1 && (
          <span className="ml-2 rounded-full bg-(--rs-accent-50) text-(--rs-accent-700) px-2 py-0.5 text-[10px] font-semibold">
            Pinned
          </span>
        )}
      </header>
      <p className="mt-1 whitespace-pre-wrap text-sm text-(--rs-neutral-grey-900)">{comment.body}</p>
      <footer className="mt-2 flex items-center gap-3 text-xs">
        {!isReply && (
          <button type="button" onClick={onReply}
            className="text-(--rs-primary-600) hover:underline">Reply</button>
        )}
        {(isOwn || isAdmin) && (
          <button type="button" disabled={pending} onClick={() => start(async () => { await onDelete(); })}
            className="text-red-600 hover:underline disabled:opacity-50">Delete</button>
        )}
        {isAdmin && (
          <button type="button" disabled={pending} onClick={() => start(async () => { await onPin(comment.pinned !== 1); })}
            className="text-(--rs-neutral-grey-600) hover:underline disabled:opacity-50">
            {comment.pinned === 1 ? 'Unpin' : 'Pin'}
          </button>
        )}
      </footer>
    </article>
  );
}

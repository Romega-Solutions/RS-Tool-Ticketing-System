'use client';

import { useTransition } from 'react';
import { Trash2 } from 'lucide-react';
import { setResearchPostPublished, deleteResearchPost } from './actions';

export function PostPublishToggle({ id, published }: { id: number; published: boolean }) {
  const [isPending, start] = useTransition();
  return (
    <select
      // Keyed on the server value so a rejected publish (missing fields) snaps
      // the select back instead of showing "Published" for a draft.
      key={String(published)}
      defaultValue={published ? 'published' : 'draft'}
      disabled={isPending}
      onChange={(e) => {
        const next = e.target.value === 'published';
        const select = e.currentTarget;
        start(async () => {
          try { await setResearchPostPublished(id, next); }
          catch (err) {
            select.value = published ? 'published' : 'draft';
            console.error(err);
            alert(err instanceof Error ? err.message : 'Update failed');
          }
        });
      }}
      className={`rounded-full px-3 py-1 text-xs font-semibold border-0 cursor-pointer ${
        published ? 'bg-green-100 text-green-700' : 'bg-(--rs-neutral-grey-100) text-(--rs-neutral-grey-600)'
      }`}
    >
      <option value="published">Published</option>
      <option value="draft">Draft</option>
    </select>
  );
}

export function PostDelete({ id }: { id: number }) {
  const [isPending, start] = useTransition();
  return (
    <button
      type="button"
      aria-label="Delete post"
      disabled={isPending}
      onClick={() => {
        if (!confirm('Delete this post? If it is published it disappears from the website. This cannot be undone.')) return;
        start(async () => {
          try { await deleteResearchPost(id); }
          catch (err) { console.error(err); alert(err instanceof Error ? err.message : 'Delete failed'); }
        });
      }}
      className="rounded-md p-1.5 text-(--rs-neutral-grey-400) hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-50"
    >
      <Trash2 className="w-3.5 h-3.5" />
    </button>
  );
}

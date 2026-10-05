'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Newspaper, Search, Pencil, ImageOff } from 'lucide-react';
import { PostPublishToggle, PostDelete } from './post-row-actions';

export type ResearchPostRow = {
  id:               number;
  title:            string;
  slug:             string;
  summary:          string | null;
  cover_image_path: string | null;
  cover_url:        string | null;
  published:        boolean;
  published_at:     string | null;
  author_name:      string | null;
  updated_at:       string;
};

function formatDate(iso: string | null) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return iso; }
}

const selectClass =
  'h-9 rounded-lg border border-(--rs-neutral-grey-200) bg-white px-2.5 text-xs text-(--rs-neutral-grey-700) focus:border-(--rs-primary-300) focus:outline-none';

export function ResearchPostsTable({ posts }: { posts: ResearchPostRow[] }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | 'published' | 'draft'>('all');

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return posts.filter(p => {
      if (status === 'published' && !p.published) return false;
      if (status === 'draft' && p.published) return false;
      if (!q) return true;
      return p.title.toLowerCase().includes(q)
        || (p.summary ?? '').toLowerCase().includes(q)
        || (p.author_name ?? '').toLowerCase().includes(q);
    });
  }, [posts, search, status]);

  if (posts.length === 0) {
    return (
      <Card>
        <CardContent className="p-0">
          <div className="px-6 py-20 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-(--rs-primary-50) flex items-center justify-center mb-3">
              <Newspaper className="w-6 h-6 text-(--rs-primary-500)" />
            </div>
            <p className="text-sm font-semibold text-(--rs-neutral-grey-900)">No posts yet</p>
            <p className="text-sm text-(--rs-neutral-grey-500) mt-1 max-w-sm mx-auto">
              Click <strong>New post</strong> to start your first research article.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-(--rs-neutral-grey-100) px-4 py-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-(--rs-neutral-grey-400)" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search title, summary, author…"
              className="h-9 w-full rounded-lg border border-(--rs-neutral-grey-200) bg-white pl-9 pr-3 text-sm placeholder:text-(--rs-neutral-grey-400) focus:border-(--rs-primary-300) focus:outline-none"
            />
          </div>
          <select aria-label="Filter by status" value={status} onChange={e => setStatus(e.target.value as typeof status)} className={selectClass}>
            <option value="all">All posts</option>
            <option value="published">Published</option>
            <option value="draft">Drafts</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-(--rs-neutral-grey-200) text-left text-xs uppercase tracking-wider text-(--rs-neutral-grey-500) bg-(--rs-neutral-grey-50)">
              <tr>
                <th className="px-6 py-3 font-semibold">Post</th>
                <th className="px-4 py-3 font-semibold">Author</th>
                <th className="px-4 py-3 font-semibold">Published</th>
                <th className="px-4 py-3 font-semibold">Updated</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-(--rs-neutral-grey-100)">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-14 text-center text-sm text-(--rs-neutral-grey-500)">
                    No posts match your filters.
                  </td>
                </tr>
              ) : rows.map(p => {
                const editHref = `/research/${p.id}/edit`;
                return (
                  <tr key={p.id} className="hover:bg-(--rs-neutral-grey-50) transition-colors">
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="h-12 w-20 shrink-0 overflow-hidden rounded-md bg-(--rs-neutral-grey-100) flex items-center justify-center">
                          {p.cover_url
                            // eslint-disable-next-line @next/next/no-img-element -- public bucket URL, no next/image remote config needed for a thumbnail
                            ? <img src={p.cover_url} alt="" className="h-full w-full object-cover" />
                            : <ImageOff className="h-4 w-4 text-(--rs-neutral-grey-400)" />}
                        </div>
                        <div className="min-w-0">
                          <Link
                            href={editHref}
                            className="font-medium text-(--rs-neutral-grey-900) hover:text-(--rs-primary-600) hover:underline underline-offset-2"
                          >
                            {p.title}
                          </Link>
                          {p.summary && (
                            <div className="text-xs text-(--rs-neutral-grey-500) mt-0.5 line-clamp-1 max-w-md">{p.summary}</div>
                          )}
                          <div className="text-[11px] text-(--rs-neutral-grey-400) mt-0.5">/market-research/{p.slug}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-(--rs-neutral-grey-700)">{p.author_name || '—'}</td>
                    <td className="px-4 py-3.5 text-(--rs-neutral-grey-500) whitespace-nowrap">{formatDate(p.published_at)}</td>
                    <td className="px-4 py-3.5 text-(--rs-neutral-grey-500) whitespace-nowrap">{formatDate(p.updated_at)}</td>
                    <td className="px-4 py-3.5">
                      <PostPublishToggle id={p.id} published={p.published} />
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-0.5">
                        <Link
                          href={editHref}
                          aria-label="Edit post"
                          className="rounded-md p-1.5 text-(--rs-neutral-grey-400) hover:bg-(--rs-primary-50) hover:text-(--rs-primary-600) transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Link>
                        <PostDelete id={p.id} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

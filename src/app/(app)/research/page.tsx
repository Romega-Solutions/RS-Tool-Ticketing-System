import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Newspaper, AlertCircle, Plus, Globe, FilePen } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LeadToolHeader, StatCard } from '@/components/lead-tool-header';
import { getSession } from '@/lib/session';
import { hasToolAccess } from '@/lib/rbac';
import { researchCoverUrl } from '@/lib/research-posts';
import { ResearchPostsTable, type ResearchPostRow } from './posts-table.client';

function isTableMissing(msg: string | undefined) {
  if (!msg) return false;
  const m = msg.toLowerCase();
  return m.includes('research_posts') && (m.includes('does not exist') || m.includes('schema cache'));
}

export default async function ResearchPage() {
  const session = await getSession();
  if (!session || !hasToolAccess('research', session.role, session.toolAccess)) {
    redirect('/dashboard');
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('research_posts')
    .select('id, title, slug, summary, cover_image_path, published, published_at, author_name, updated_at')
    .order('updated_at', { ascending: false })
    .limit(500);

  const tableMissing = isTableMissing(error?.message);
  const unexpectedError = error && !tableMissing ? error.message : null;

  const posts: ResearchPostRow[] = ((data ?? []) as Omit<ResearchPostRow, 'cover_url'>[]).map(p => ({
    ...p,
    cover_url: researchCoverUrl(p.cover_image_path),
  }));
  const liveCount  = posts.filter(p => p.published).length;
  const draftCount = posts.length - liveCount;

  return (
    <div className="space-y-6">
      <LeadToolHeader
        eyebrow="Research tool"
        title="Market Research"
        description="Write and publish research articles for the Market Research section of romega-solutions.com. Only published posts appear on the website; drafts stay here."
        action={
          !tableMissing && !unexpectedError ? (
            <Button className="gap-2" nativeButton={false} render={<Link href="/research/new" />}>
              <Plus className="w-4 h-4" /> New post
            </Button>
          ) : null
        }
      />

      {tableMissing && (
        <Card>
          <CardContent className="p-6 space-y-3">
            <h2 className="font-serif text-lg font-bold text-(--rs-neutral-grey-900)">Setup required</h2>
            <p className="text-sm text-(--rs-neutral-grey-600)">
              The <code className="rounded bg-(--rs-neutral-grey-100) px-1.5 py-0.5 text-xs">research_posts</code> table
              doesn&apos;t exist yet. Run this in the Supabase SQL Editor:
            </p>
            <ol className="list-decimal text-sm text-(--rs-neutral-grey-700) ml-5 space-y-1">
              <li><code className="rounded bg-(--rs-neutral-grey-100) px-1.5 py-0.5 text-xs">docs/migrations/add-research-posts.sql</code></li>
            </ol>
          </CardContent>
        </Card>
      )}

      {unexpectedError && (
        <Card>
          <CardContent className="p-6 space-y-2">
            <div className="flex items-center gap-2 text-red-700">
              <AlertCircle className="w-4 h-4" />
              <h2 className="font-serif text-base font-bold">Couldn&apos;t load posts</h2>
            </div>
            <p className="text-sm text-(--rs-neutral-grey-600)">{unexpectedError}</p>
          </CardContent>
        </Card>
      )}

      {!tableMissing && !unexpectedError && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <StatCard icon={<Globe className="w-4 h-4" />}     label="Published" value={String(liveCount)}  hint="live on the website" />
            <StatCard icon={<FilePen className="w-4 h-4" />}   label="Drafts"    value={String(draftCount)} hint="not visible publicly" />
            <StatCard icon={<Newspaper className="w-4 h-4" />} label="Total"     value={String(posts.length)} accent hint="all posts" />
          </div>

          <ResearchPostsTable posts={posts} />
        </>
      )}
    </div>
  );
}

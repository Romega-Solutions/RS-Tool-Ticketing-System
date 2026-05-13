'use client';

import { useMemo, useState, useTransition } from 'react';
import { Copy, Loader2, Mail, Sparkles, Wand2, Image as ImageIcon, Search, Filter } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { ContentDraftRecord } from '@/lib/content-repurposer';
import { generateContentDraftAction } from './actions';

const SOURCE_TYPES = [
  { value: 'blog', label: 'Blog post' },
  { value: 'transcript', label: 'Video transcript' },
  { value: 'case-study', label: 'Case study' },
  { value: 'other', label: 'Other' },
];

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

export function ContentRepurposerClient({ initialDrafts }: { initialDrafts: ContentDraftRecord[] }) {
  const [drafts, setDrafts] = useState(initialDrafts);
  const [selectedId, setSelectedId] = useState(initialDrafts[0]?.id ?? null);
  const [sourceTitle, setSourceTitle] = useState('');
  const [sourceType, setSourceType] = useState('blog');
  const [sourceContent, setSourceContent] = useState('');
  const [libraryQuery, setLibraryQuery] = useState('');
  const [libraryType, setLibraryType] = useState('all');
  const [activeOutput, setActiveOutput] = useState<'linkedin_carousel' | 'twitter_thread' | 'newsletter_html' | 'instagram_caption'>('linkedin_carousel');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedDraft = useMemo(
    () => drafts.find(item => item.id === selectedId) ?? drafts[0] ?? null,
    [drafts, selectedId],
  );
  const filteredDrafts = useMemo(() => {
    const query = libraryQuery.trim().toLowerCase();
    return drafts.filter(draft => {
      const matchesQuery = !query || [
        draft.source_title,
        draft.source_type,
        draft.source_content,
      ].some(value => value.toLowerCase().includes(query));
      const matchesType = libraryType === 'all' || draft.source_type === libraryType;
      return matchesQuery && matchesType;
    });
  }, [drafts, libraryQuery, libraryType]);

  const copy = async (key: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(key);
    window.setTimeout(() => setCopied(current => current === key ? null : current), 1600);
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_0.85fr]">
      <div className="space-y-6">
        <Card className="animate-lead-card border-(--rs-neutral-grey-200) bg-linear-to-br from-white via-white to-(--rs-primary-50)/40">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-(--rs-accent-700)">
              <Sparkles className="h-3.5 w-3.5" />
              <span className="text-[10px] font-bold uppercase tracking-widest">Generate draft set</span>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_180px]">
              <label className="space-y-1.5">
                <span className="text-sm font-semibold text-(--rs-neutral-grey-800)">Source title</span>
                <input
                  value={sourceTitle}
                  onChange={e => setSourceTitle(e.target.value)}
                  placeholder="Q2 delivery lessons from a client launch"
                  className="w-full rounded-lg border border-(--rs-neutral-grey-200) bg-white px-3 py-2.5 text-sm text-(--rs-neutral-grey-900) outline-none transition-colors focus:border-(--rs-primary-300) focus:ring-3 focus:ring-(--rs-primary-100)"
                />
              </label>

              <label className="space-y-1.5">
                <span className="text-sm font-semibold text-(--rs-neutral-grey-800)">Source type</span>
                <select
                  value={sourceType}
                  onChange={e => setSourceType(e.target.value)}
                  className="w-full rounded-lg border border-(--rs-neutral-grey-200) bg-white px-3 py-2.5 text-sm text-(--rs-neutral-grey-900) outline-none transition-colors focus:border-(--rs-primary-300) focus:ring-3 focus:ring-(--rs-primary-100)"
                >
                  {SOURCE_TYPES.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
            </div>

            <label className="mt-4 block space-y-1.5">
              <span className="text-sm font-semibold text-(--rs-neutral-grey-800)">Source content</span>
              <textarea
                value={sourceContent}
                onChange={e => setSourceContent(e.target.value)}
                placeholder="Paste the article, transcript, or case study here."
                rows={12}
                className="w-full rounded-xl border border-(--rs-neutral-grey-200) bg-white px-3 py-3 text-sm text-(--rs-neutral-grey-900) outline-none transition-colors focus:border-(--rs-primary-300) focus:ring-3 focus:ring-(--rs-primary-100)"
              />
            </label>

            <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <p className="text-sm text-(--rs-neutral-grey-500)">
                One source in, four outputs out. Every run is saved to the draft library.
              </p>
              <Button
                type="button"
                disabled={isPending}
                aria-busy={isPending}
                className="min-w-[170px] gap-2"
                onClick={() => {
                  setError(null);
                  startTransition(async () => {
                    try {
                      const draft = await generateContentDraftAction({ sourceTitle, sourceType, sourceContent });
                      setDrafts(current => [draft, ...current.filter(item => item.id !== draft.id)]);
                      setSelectedId(draft.id ?? null);
                      setActiveOutput('linkedin_carousel');
                    } catch (err) {
                      setError(err instanceof Error ? err.message : 'Failed to generate content');
                    }
                  });
                }}
              >
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                {isPending ? 'Generating…' : 'Generate outputs'}
              </Button>
            </div>

            {error && <p className="mt-3 text-sm text-red-600 animate-slide-up">{error}</p>}
          </CardContent>
        </Card>

        {selectedDraft ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {[
                { key: 'linkedin_carousel', label: 'LinkedIn', icon: <Wand2 className="h-4 w-4" /> },
                { key: 'twitter_thread', label: 'X Thread', icon: <Sparkles className="h-4 w-4" /> },
                { key: 'newsletter_html', label: 'Newsletter', icon: <Mail className="h-4 w-4" /> },
                { key: 'instagram_caption', label: 'Instagram', icon: <ImageIcon className="h-4 w-4" /> },
              ].map(item => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setActiveOutput(item.key as typeof activeOutput)}
                  className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold transition-colors ${
                    activeOutput === item.key
                      ? 'bg-(--rs-primary-500) text-white'
                      : 'bg-(--rs-neutral-grey-100) text-(--rs-neutral-grey-700) hover:bg-(--rs-neutral-grey-200)'
                  }`}
                >
                  {item.icon}
                  {item.label}
                </button>
              ))}
            </div>

            {activeOutput === 'linkedin_carousel' && (
              <OutputCard
                icon={<Wand2 className="h-4 w-4" />}
                title="LinkedIn carousel"
                outputKey="linkedin_carousel"
                value={selectedDraft.outputs.linkedin_carousel}
                copied={copied}
                onCopy={copy}
              />
            )}
            {activeOutput === 'twitter_thread' && (
              <OutputCard
                icon={<Sparkles className="h-4 w-4" />}
                title="Twitter / X thread"
                outputKey="twitter_thread"
                value={selectedDraft.outputs.twitter_thread}
                copied={copied}
                onCopy={copy}
              />
            )}
            {activeOutput === 'newsletter_html' && (
              <OutputCard
                icon={<Mail className="h-4 w-4" />}
                title="Newsletter HTML"
                outputKey="newsletter_html"
                value={selectedDraft.outputs.newsletter_html}
                copied={copied}
                onCopy={copy}
                isHtml
              />
            )}
            {activeOutput === 'instagram_caption' && (
              <OutputCard
                icon={<ImageIcon className="h-4 w-4" />}
                title="Instagram caption"
                outputKey="instagram_caption"
                value={selectedDraft.outputs.instagram_caption}
                copied={copied}
                onCopy={copy}
              />
            )}
          </div>
        ) : (
          <Card className="animate-lead-card">
            <CardContent className="p-8 text-center text-sm text-(--rs-neutral-grey-500)">
              Generate your first repurposed draft set to populate the workspace.
            </CardContent>
          </Card>
        )}
      </div>

      <aside className="space-y-4">
        <Card className="animate-lead-card border-(--rs-neutral-grey-200) xl:sticky xl:top-6">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-(--rs-primary-700)">
                  <Wand2 className="h-4 w-4" />
                  <span className="text-[10px] font-bold uppercase tracking-[0.22em]">Draft library</span>
                </div>
                <h2 className="mt-2 font-serif text-lg font-bold text-(--rs-neutral-grey-900)">Recent runs</h2>
              </div>
              <span className="rounded-full bg-(--rs-primary-50) px-2 py-1 text-[11px] font-semibold text-(--rs-primary-700)">
                {drafts.length} drafts
              </span>
            </div>

            <p className="mt-2 text-sm leading-relaxed text-(--rs-neutral-grey-500)">
              Open past repurposing runs to reuse strong hooks, HTML blocks, or social copy.
            </p>

            <div className="mt-4 grid gap-3">
              <label className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-(--rs-neutral-grey-400)" />
                <input
                  value={libraryQuery}
                  onChange={e => setLibraryQuery(e.target.value)}
                  placeholder="Search title, type, or source text"
                  className="w-full rounded-lg border border-(--rs-neutral-grey-200) bg-white py-2 pl-9 pr-3 text-sm text-(--rs-neutral-grey-900) outline-none transition-colors focus:border-(--rs-primary-300) focus:ring-3 focus:ring-(--rs-primary-100)"
                />
              </label>
              <label className="relative">
                <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-(--rs-neutral-grey-400)" />
                <select
                  value={libraryType}
                  onChange={e => setLibraryType(e.target.value)}
                  className="w-full rounded-lg border border-(--rs-neutral-grey-200) bg-white py-2 pl-9 pr-3 text-sm text-(--rs-neutral-grey-900) outline-none transition-colors focus:border-(--rs-primary-300) focus:ring-3 focus:ring-(--rs-primary-100)"
                >
                  <option value="all">All source types</option>
                  {SOURCE_TYPES.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <p className="text-xs text-(--rs-neutral-grey-500)">
                Showing {filteredDrafts.length} of {drafts.length} drafts.
              </p>
            </div>

            <div className="mt-4 space-y-2">
              {filteredDrafts.map((draft, index) => {
                const active = draft.id === selectedDraft?.id;
                return (
                  <button
                    key={draft.id ?? `${draft.source_title}-${draft.created_at}`}
                    type="button"
                    onClick={() => setSelectedId(draft.id ?? null)}
                    className={`block w-full rounded-xl border p-3 text-left transition-all ${
                      active
                        ? 'border-(--rs-primary-300) bg-(--rs-primary-50) shadow-sm'
                        : 'border-(--rs-neutral-grey-200) bg-white hover:border-(--rs-primary-200) hover:bg-(--rs-neutral-grey-50)'
                    } animate-lead-card`}
                    style={{ animationDelay: `${Math.min(index * 45, 220)}ms` }}
                  >
                    <p className="font-semibold text-(--rs-neutral-grey-900)">{draft.source_title}</p>
                    <p className="mt-0.5 text-xs text-(--rs-neutral-grey-500)">
                      {draft.source_type} · {formatDate(draft.created_at)}
                    </p>
                    <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-(--rs-neutral-grey-600)">
                      {draft.source_content}
                    </p>
                  </button>
                );
              })}
              {filteredDrafts.length === 0 && (
                <div className="rounded-xl border border-dashed border-(--rs-neutral-grey-200) bg-(--rs-neutral-grey-50) px-3 py-6 text-center text-sm text-(--rs-neutral-grey-500)">
                  No draft runs match this filter.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}

function OutputCard({
  icon,
  title,
  outputKey,
  value,
  copied,
  onCopy,
  isHtml = false,
}: {
  icon: React.ReactNode;
  title: string;
  outputKey: string;
  value: string;
  copied: string | null;
  onCopy: (key: string, value: string) => Promise<void>;
  isHtml?: boolean;
}) {
  return (
    <Card className="animate-lead-card">
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-(--rs-primary-700)">
            {icon}
            <span className="text-sm font-semibold text-(--rs-neutral-grey-900)">{title}</span>
          </div>
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => onCopy(outputKey, value)}>
            <Copy className="h-3.5 w-3.5" />
            {copied === outputKey ? 'Copied' : 'Copy'}
          </Button>
        </div>
        {isHtml ? (
          <pre className="mt-4 overflow-x-auto rounded-xl bg-(--rs-neutral-grey-50) p-4 text-xs leading-relaxed text-(--rs-neutral-grey-700)">{value}</pre>
        ) : (
          <div className="mt-4 whitespace-pre-wrap rounded-xl bg-(--rs-neutral-grey-50) p-4 text-sm leading-relaxed text-(--rs-neutral-grey-800)">
            {value}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

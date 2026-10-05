'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Newspaper, AlertCircle, Check, ImagePlus, Lock, Globe, EyeOff, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { RichTextEditor } from '@/components/rich-text-editor.client';
import { slugifyTitle, MAX_SUMMARY_LENGTH, MAX_COVER_BYTES } from '@/lib/research-posts';
import { saveResearchPost, setResearchPostPublished } from './actions';

export type PostDefaults = {
  title:            string;
  slug:             string;
  summary:          string | null;
  author_name:      string | null;
  cover_image_path: string | null;
  cover_url:        string | null;
  body_html:        string;
  published:        boolean;
  slug_locked:      boolean;   // true once the post has ever been published
};

/**
 * Full-page article editor, laid out like the position editor: metadata + cover
 * in a sticky left column, the long-form body editor in the wide right column.
 * New posts are saved as drafts; publishing happens from the edit page (or the
 * list's status pill) once the post exists, so a failed publish never leaves
 * the writer on an unsaved form.
 */
export function PostEditor({
  mode,
  postId,
  defaults,
  defaultAuthorName,
}: {
  mode: 'create' | 'edit';
  postId?: number;
  defaults?: PostDefaults;
  defaultAuthorName: string;
}) {
  const router = useRouter();
  const [isPending, start]      = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const [title, setTitle]             = useState(defaults?.title ?? '');
  const [slug, setSlug]               = useState(defaults?.slug ?? '');
  const [slugTouched, setSlugTouched] = useState(mode === 'edit');
  const [summary, setSummary]         = useState(defaults?.summary ?? '');

  const [coverPath, setCoverPath]     = useState(defaults?.cover_image_path ?? '');
  const [coverUrl, setCoverUrl]       = useState(defaults?.cover_url ?? null);
  const [uploading, setUploading]     = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const published  = defaults?.published ?? false;
  const slugLocked = defaults?.slug_locked ?? false;

  function onTitleChange(next: string) {
    setTitle(next);
    if (!slugTouched && !slugLocked) setSlug(slugifyTitle(next));
  }

  async function onCoverPicked(file: File | undefined) {
    if (!file) return;
    setErrorMsg(null);
    if (file.size > MAX_COVER_BYTES) { setErrorMsg('Cover image must be 5 MB or smaller.'); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/research/cover', { method: 'POST', body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? 'Upload failed');
      setCoverPath(json.path);
      setCoverUrl(json.url);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function onSubmit(formData: FormData) {
    setErrorMsg(null);
    setSavedMsg(null);
    // React passes the clicked submit button's name/value through FormData.
    const intent = String(formData.get('intent') ?? 'save');
    start(async () => {
      try {
        if (mode === 'create') {
          const id = await saveResearchPost(null, formData);
          router.push(`/research/${id}/edit`);
          return;
        }
        // Unpublish BEFORE saving: a live post can't be saved incomplete, and
        // taking it offline is exactly how the writer gets out of that state.
        if (intent === 'unpublish') await setResearchPostPublished(postId!, false);
        await saveResearchPost(postId!, formData);
        if (intent === 'publish') await setResearchPostPublished(postId!, true);
        setSavedMsg(intent === 'publish' ? 'Published' : intent === 'unpublish' ? 'Unpublished' : 'Saved');
        router.refresh();
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Failed to save post');
      }
    });
  }

  const busy = isPending || uploading;

  return (
    <form action={onSubmit} className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href="/research"
            className="inline-flex items-center gap-1.5 text-sm text-(--rs-neutral-grey-500) hover:text-(--rs-primary-600)"
          >
            <ArrowLeft className="w-4 h-4" /> Back to posts
          </Link>
          <h1 className="mt-2 font-serif text-2xl font-bold text-(--rs-neutral-grey-900)">
            {mode === 'edit' ? 'Edit post' : 'New research post'}
          </h1>
          <p className="text-sm text-(--rs-neutral-grey-500)">
            {mode === 'edit'
              ? published
                ? 'This post is live on the website. Saved changes show up there too.'
                : 'Draft. Only people with the Research tool can see it.'
              : 'Saved as a draft. You can publish it once the cover, summary, and body are in.'}
          </p>
        </div>
        {mode === 'edit' && (
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
            published ? 'bg-green-100 text-green-700' : 'bg-(--rs-neutral-grey-100) text-(--rs-neutral-grey-600)'
          }`}>
            {published ? 'Published' : 'Draft'}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(320px,420px)_1fr] lg:items-start">
        {/* Left column — sticky so the Save button stays reachable on long posts */}
        <div className="lg:sticky lg:top-6 space-y-4">
          <Card>
            <CardContent className="p-5 space-y-4">
              <div className="inline-flex items-center gap-2 w-fit px-2.5 py-1 rounded-full bg-(--rs-primary-50) text-(--rs-primary-700) text-[10px] font-bold uppercase tracking-wider">
                <Newspaper className="w-3 h-3" /> Post details
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="title">Title</Label>
                <Input id="title" name="title" required value={title} onChange={e => onTitleChange(e.target.value)} placeholder="e.g. 2026 Philippine BPO Talent Outlook" />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="slug">URL slug</Label>
                <div className="flex items-center rounded-lg border border-(--rs-neutral-grey-200) bg-(--rs-neutral-grey-50) text-sm focus-within:border-(--rs-primary-300)">
                  <span className="pl-3 text-(--rs-neutral-grey-400) whitespace-nowrap">/market-research/</span>
                  <input
                    id="slug"
                    name="slug"
                    value={slug}
                    readOnly={slugLocked}
                    onChange={e => { setSlugTouched(true); setSlug(e.target.value.toLowerCase()); }}
                    // Normalize on blur ("Q4 Outlook!" → "q4-outlook") so a hand-typed
                    // slug doesn't bounce off the server's format check.
                    onBlur={() => { if (!slugLocked) setSlug(s => slugifyTitle(s)); }}
                    className="h-9 min-w-0 flex-1 bg-transparent pr-3 focus:outline-none read-only:text-(--rs-neutral-grey-500)"
                  />
                  {slugLocked && <Lock className="mr-3 h-3.5 w-3.5 text-(--rs-neutral-grey-400)" />}
                </div>
                <p className="text-xs text-(--rs-neutral-grey-500)">
                  {slugLocked
                    ? 'Locked because this post has been published, so shared links keep working.'
                    : 'Lowercase letters, numbers, and hyphens. Locks after the first publish.'}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="summary">Summary</Label>
                <textarea
                  id="summary"
                  name="summary"
                  rows={3}
                  maxLength={MAX_SUMMARY_LENGTH}
                  value={summary}
                  onChange={e => setSummary(e.target.value)}
                  placeholder="One or two sentences for the listing card and link previews."
                  className="w-full rounded-lg border border-(--rs-neutral-grey-200) bg-white px-3 py-2 text-sm placeholder:text-(--rs-neutral-grey-400) focus:border-(--rs-primary-300) focus:outline-none"
                />
                <p className="text-right text-[11px] text-(--rs-neutral-grey-400)">{summary.length}/{MAX_SUMMARY_LENGTH}</p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="authorName">Author byline</Label>
                <Input id="authorName" name="authorName" defaultValue={defaults?.author_name ?? defaultAuthorName} />
              </div>

              <div className="space-y-1.5">
                <Label>Cover image</Label>
                <input type="hidden" name="coverImagePath" value={coverPath} />
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={e => onCoverPicked(e.target.files?.[0])}
                />
                {coverUrl ? (
                  <div className="relative overflow-hidden rounded-lg border border-(--rs-neutral-grey-200)">
                    {/* eslint-disable-next-line @next/next/no-img-element -- public bucket URL preview */}
                    <img src={coverUrl} alt="Cover preview" className="aspect-[1.91/1] w-full object-cover" />
                    <button
                      type="button"
                      aria-label="Remove cover image"
                      onClick={() => { setCoverPath(''); setCoverUrl(null); }}
                      className="absolute right-2 top-2 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : null}
                <Button type="button" variant="outline" size="sm" className="gap-2" disabled={busy} onClick={() => fileRef.current?.click()}>
                  <ImagePlus className="h-4 w-4" /> {uploading ? 'Uploading…' : coverUrl ? 'Replace image' : 'Upload image'}
                </Button>
                <p className="text-xs text-(--rs-neutral-grey-500)">JPG, PNG, or WebP, up to 5 MB. 1200×630 works best for link previews.</p>
              </div>
            </CardContent>
          </Card>

          {errorMsg && (
            <div className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
          {savedMsg && !errorMsg && (
            <div className="flex items-center gap-2 rounded-lg bg-green-50 p-3 text-sm text-green-700">
              <Check className="w-4 h-4 shrink-0" /> {savedMsg}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" name="intent" value="save" disabled={busy} className="gap-2">
              {isPending ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Saving…
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" /> {mode === 'edit' ? 'Save changes' : 'Save draft'}
                </>
              )}
            </Button>
            {mode === 'edit' && (published ? (
              <Button type="submit" name="intent" value="unpublish" variant="outline" disabled={busy} className="gap-2">
                <EyeOff className="w-4 h-4" /> Unpublish
              </Button>
            ) : (
              <Button type="submit" name="intent" value="publish" variant="outline" disabled={busy} className="gap-2">
                <Globe className="w-4 h-4" /> Save &amp; publish
              </Button>
            ))}
            <Button type="button" variant="ghost" disabled={busy} nativeButton={false} render={<Link href="/research" />}>
              Cancel
            </Button>
          </div>
        </div>

        <Card>
          <CardContent className="p-5 space-y-2">
            <Label htmlFor="body" className="text-(--rs-neutral-grey-700) font-medium">Article</Label>
            <p className="text-xs text-(--rs-neutral-grey-500)">
              Use Heading and Subheading to break up sections. Pasted formatting is cleaned on save.
            </p>
            <RichTextEditor
              name="body"
              defaultValue={defaults?.body_html ?? ''}
              bodyClassName="min-h-[60vh] max-h-[75vh] overflow-y-auto"
              placeholder="Write the research article…"
              enableArticleFormats
            />
          </CardContent>
        </Card>
      </div>
    </form>
  );
}

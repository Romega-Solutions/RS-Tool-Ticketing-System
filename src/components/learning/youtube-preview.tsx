import { youtubeEmbedUrl } from '@/lib/youtube';

// Inline preview of a saved YouTube lesson so an admin can confirm the link
// actually embeds/plays before assigning the course. Pure iframe — no JS API.
export function YoutubePreview({ url }: { url: string }) {
  const embed = youtubeEmbedUrl(url);

  if (!embed) {
    return (
      <p className="text-xs text-amber-700">
        This link isn’t a recognizable YouTube URL, so it won’t play for learners. Use a
        <code className="mx-1">youtube.com/watch?v=…</code> or <code className="mx-1">youtu.be/…</code> link.
      </p>
    );
  }

  return (
    <div className="relative aspect-video w-full max-w-md overflow-hidden rounded-lg border border-(--rs-neutral-grey-200) bg-black">
      <iframe
        src={embed}
        className="absolute inset-0 h-full w-full"
        loading="lazy"
        title="Lesson video preview"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
      />
    </div>
  );
}

'use client';

export function UploadVideoPlayer({
  signedUrl,
  onEnded,
}: {
  signedUrl: string;
  onEnded: () => void;
}) {
  // Same framed 16:9 container as the YouTube player so both video sources sit
  // in an identical, height-capped box (object-contain keeps any aspect ratio).
  return (
    <div className="relative mx-auto aspect-video w-full max-w-[calc(74vh*16/9)] overflow-hidden rounded-xl bg-black shadow-sm ring-1 ring-(--rs-neutral-grey-200)">
      <video
        className="absolute inset-0 h-full w-full object-contain bg-black"
        controls
        src={signedUrl}
        onEnded={onEnded}
      />
    </div>
  );
}

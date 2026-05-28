'use client';

export function UploadVideoPlayer({
  signedUrl,
  onEnded,
}: {
  signedUrl: string;
  onEnded: () => void;
}) {
  return (
    <video
      className="w-full rounded-lg bg-black"
      controls
      src={signedUrl}
      onEnded={onEnded}
    />
  );
}

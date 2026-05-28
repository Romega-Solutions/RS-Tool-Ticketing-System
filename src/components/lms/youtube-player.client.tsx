'use client';

import { useEffect, useRef } from 'react';

// Pull a YouTube video ID out of a typical URL or shorthand.
// Returns null when the input doesn't parse — caller renders a fallback.
export function extractYoutubeId(url: string): string | null {
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

// Minimal global hook for the YouTube IFrame API script (loaded once).
type YTPlayer = {
  destroy(): void;
};
type YTPlayerCtor = new (
  element: HTMLElement,
  opts: {
    videoId: string;
    events?: { onStateChange?: (e: { data: number }) => void };
    playerVars?: Record<string, string | number>;
  }
) => YTPlayer;
type YT = { Player: YTPlayerCtor; PlayerState: { ENDED: number } };

declare global {
  interface Window {
    YT?: YT;
    onYouTubeIframeAPIReady?: () => void;
    __ytApiReady?: Promise<void>;
  }
}

function loadYoutubeApi(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.YT?.Player) return Promise.resolve();
  if (window.__ytApiReady) return window.__ytApiReady;

  window.__ytApiReady = new Promise<void>((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
  });
  return window.__ytApiReady;
}

export function YoutubePlayer({
  url,
  onEnded,
}: {
  url: string;
  onEnded: () => void;
}) {
  const videoId = extractYoutubeId(url);
  const mountRef = useRef<HTMLDivElement | null>(null);
  const onEndedRef = useRef(onEnded);

  // Sync the ref in an effect so the player's onStateChange always sees the
  // latest callback without re-instantiating the iframe.
  useEffect(() => {
    onEndedRef.current = onEnded;
  }, [onEnded]);

  useEffect(() => {
    if (!videoId || !mountRef.current) return;
    let player: YTPlayer | null = null;
    let cancelled = false;

    loadYoutubeApi().then(() => {
      if (cancelled || !window.YT || !mountRef.current) return;
      player = new window.YT.Player(mountRef.current, {
        videoId,
        playerVars: { modestbranding: 1, rel: 0 },
        events: {
          onStateChange: (e) => {
            if (window.YT && e.data === window.YT.PlayerState.ENDED) {
              onEndedRef.current();
            }
          },
        },
      });
    });

    return () => {
      cancelled = true;
      player?.destroy();
    };
  }, [videoId]);

  if (!videoId) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        This YouTube URL could not be parsed. Ask an admin to update the link.
      </div>
    );
  }

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black">
      <div ref={mountRef} className="absolute inset-0" />
    </div>
  );
}

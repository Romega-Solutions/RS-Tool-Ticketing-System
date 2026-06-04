'use client';

import { useState, useTransition } from 'react';
import { TextLesson } from './text-lesson';
import { YoutubePlayer } from './youtube-player.client';
import { UploadVideoPlayer } from './upload-video-player.client';
import { resolveLessonMedia } from '@/lib/lms-media';
import type { LessonType } from '@/lib/lms';

type Props = {
  lessonId:     number;
  lessonType:   LessonType;
  bodyMd:       string | null;
  videoSource:  'youtube' | 'upload' | null;
  videoUrl:     string | null;   // YouTube URL or signed storage URL
  alreadyDone:  boolean;
  onComplete:   (lessonId: number, watchedToEnd: boolean) => Promise<void>;
};

export function LessonPlayer(props: Props) {
  // Decide what to render from the configured media, not the (often stale)
  // lesson_type — so a YouTube video pasted onto a "text" lesson still plays.
  const { showVideo, showText } = resolveLessonMedia(props);

  const [done, setDone] = useState(props.alreadyDone);
  const [watchedToEnd, setWatchedToEnd] = useState(!showVideo);
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  // Lessons with no video can be marked complete immediately; lessons that show
  // a video unlock once it reaches the end.
  const canMark = !showVideo || watchedToEnd;

  function handleMark() {
    setErr(null);
    startTransition(async () => {
      try {
        await props.onComplete(props.lessonId, watchedToEnd);
        setDone(true);
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Could not mark complete.');
      }
    });
  }

  return (
    <div className="space-y-6">
      {showVideo && props.videoUrl && (
        <div>
          {props.videoSource === 'youtube' ? (
            <YoutubePlayer url={props.videoUrl} onEnded={() => setWatchedToEnd(true)} />
          ) : (
            <UploadVideoPlayer signedUrl={props.videoUrl} onEnded={() => setWatchedToEnd(true)} />
          )}
          {!watchedToEnd && !done && (
            <p className="mt-2 text-xs text-(--rs-neutral-grey-400)">
              Mark Complete unlocks when the video reaches the end.
            </p>
          )}
        </div>
      )}

      {showText && <TextLesson body={props.bodyMd} />}

      <div className="border-t border-(--rs-neutral-grey-100) pt-4">
        {done ? (
          <div className="inline-flex items-center gap-2 text-sm font-semibold text-green-700">
            <span className="inline-block w-4 h-4 rounded-full bg-green-100 text-green-700 text-xs leading-4 text-center">✓</span>
            Lesson complete
          </div>
        ) : (
          <button
            type="button"
            onClick={handleMark}
            disabled={!canMark || pending}
            className="inline-flex items-center gap-2 rounded-lg bg-(--rs-primary-500) text-white text-sm font-semibold px-4 py-2 hover:bg-(--rs-primary-600) disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {pending ? 'Saving…' : 'Mark Complete'}
          </button>
        )}
        {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
      </div>
    </div>
  );
}

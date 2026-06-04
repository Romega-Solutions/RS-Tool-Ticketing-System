import type { LessonType } from './lms';

// Pure, dependency-free (safe for the client bundle): decide what a lesson
// should actually render. We key off the CONFIGURED media rather than the
// lesson_type field, because lesson_type is easy to leave on the "text" default
// while still pasting in a video — which previously hid the video entirely.
export function resolveLessonMedia(lesson: {
  lessonType:  LessonType;
  videoSource: 'youtube' | 'upload' | null;
  videoUrl:    string | null;
  bodyMd:      string | null;
}): { showVideo: boolean; showText: boolean } {
  const hasVideo = !!(lesson.videoUrl && lesson.videoSource);
  const hasText  = !!(lesson.bodyMd && lesson.bodyMd.trim());

  const showVideo = hasVideo || lesson.lessonType === 'video' || lesson.lessonType === 'mixed';
  // Show text when there's real body content, or for a text-typed lesson that
  // isn't actually carrying a video (so we don't render the empty "no written
  // content" placeholder above a video).
  const showText  = hasText || (lesson.lessonType !== 'video' && !hasVideo);

  return { showVideo, showText };
}

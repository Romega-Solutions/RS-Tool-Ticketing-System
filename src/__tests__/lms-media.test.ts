import { describe, it, expect } from 'vitest';
import { resolveLessonMedia } from '@/lib/lms-media';

describe('resolveLessonMedia (render from configured media, not stale lesson_type)', () => {
  it('plays a YouTube video on a lesson left typed as "text" (the reported bug)', () => {
    // type=text but a valid youtube source+url is configured.
    expect(resolveLessonMedia({
      lessonType: 'text', videoSource: 'youtube',
      videoUrl: 'https://www.youtube.com/watch?v=4NRXx6U8ABQ', bodyMd: null,
    })).toEqual({ showVideo: true, showText: false });
  });

  it('shows text-only for a real text lesson with body and no video', () => {
    expect(resolveLessonMedia({
      lessonType: 'text', videoSource: null, videoUrl: null, bodyMd: '# Hello',
    })).toEqual({ showVideo: false, showText: true });
  });

  it('shows video-only for a video lesson with no body', () => {
    expect(resolveLessonMedia({
      lessonType: 'video', videoSource: 'youtube', videoUrl: 'https://youtu.be/abcdefghijk', bodyMd: null,
    })).toEqual({ showVideo: true, showText: false });
  });

  it('shows both for a mixed lesson with video and body', () => {
    expect(resolveLessonMedia({
      lessonType: 'mixed', videoSource: 'upload', videoUrl: 'signed://x', bodyMd: 'notes',
    })).toEqual({ showVideo: true, showText: true });
  });

  it('still shows the empty-text placeholder for a degenerate text lesson (no body, no video)', () => {
    expect(resolveLessonMedia({
      lessonType: 'text', videoSource: null, videoUrl: null, bodyMd: '   ',
    })).toEqual({ showVideo: false, showText: true });
  });

  it('does not treat a dangling source with no url as a video', () => {
    expect(resolveLessonMedia({
      lessonType: 'text', videoSource: 'youtube', videoUrl: null, bodyMd: 'body',
    })).toEqual({ showVideo: false, showText: true });
  });
});

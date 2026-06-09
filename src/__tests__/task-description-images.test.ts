import { describe, expect, it } from 'vitest';
import { extractTaskDescriptionImageUrls } from '@/lib/task-description-images';

describe('extractTaskDescriptionImageUrls', () => {
  it('extracts direct image URLs from task descriptions', () => {
    expect(extractTaskDescriptionImageUrls(
      'Please check https://example.com/screenshot.png and https://cdn.example.com/flow.webp',
    )).toEqual([
      'https://example.com/screenshot.png',
      'https://cdn.example.com/flow.webp',
    ]);
  });

  it('keeps query strings and trims surrounding punctuation', () => {
    expect(extractTaskDescriptionImageUrls(
      'Screenshot: (https://example.com/image.jpg?token=abc123).',
    )).toEqual(['https://example.com/image.jpg?token=abc123']);
  });

  it('extracts markdown image URLs without duplicating the same URL', () => {
    expect(extractTaskDescriptionImageUrls(
      '![broken setup](https://example.com/setup.png) https://example.com/setup.png',
    )).toEqual(['https://example.com/setup.png']);
  });

  it('ignores non-image and data URLs', () => {
    expect(extractTaskDescriptionImageUrls(
      'Docs https://example.com/spec.pdf data:image/png;base64,abc https://example.com/page',
    )).toEqual([]);
  });

  it('limits previews to four images by default', () => {
    expect(extractTaskDescriptionImageUrls(
      [
        'https://example.com/1.png',
        'https://example.com/2.png',
        'https://example.com/3.png',
        'https://example.com/4.png',
        'https://example.com/5.png',
      ].join(' '),
    )).toEqual([
      'https://example.com/1.png',
      'https://example.com/2.png',
      'https://example.com/3.png',
      'https://example.com/4.png',
    ]);
  });
});

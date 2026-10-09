import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  slugifyTitle, isValidSlug, coverImageExtension, researchCoverUrl, publishBlockers, MAX_SLUG_LENGTH,
} from '@/lib/research-posts';

describe('slugifyTitle', () => {
  it('lowercases, strips diacritics and punctuation, hyphenates', () => {
    expect(slugifyTitle('  2026 Philippine BPO: Talent Outlook! ')).toBe('2026-philippine-bpo-talent-outlook');
    expect(slugifyTitle('Café Économie')).toBe('cafe-economie');
  });

  it('caps length without leaving a trailing hyphen', () => {
    const slug = slugifyTitle('word '.repeat(40));
    expect(slug.length).toBeLessThanOrEqual(MAX_SLUG_LENGTH);
    expect(slug.endsWith('-')).toBe(false);
  });

  it('produces a valid slug or empty string', () => {
    expect(isValidSlug(slugifyTitle('Market Research Q4'))).toBe(true);
    expect(slugifyTitle('!!!')).toBe('');
  });
});

describe('isValidSlug', () => {
  it('accepts lowercase hyphenated slugs', () => {
    expect(isValidSlug('q4-market-outlook')).toBe(true);
  });

  it('rejects uppercase, spaces, leading/trailing/double hyphens, path chars', () => {
    for (const bad of ['', 'Q4', 'a b', '-a', 'a-', 'a--b', 'a/b', '../x']) {
      expect(isValidSlug(bad)).toBe(false);
    }
  });
});

describe('coverImageExtension', () => {
  it('maps allowed image types and rejects others', () => {
    expect(coverImageExtension({ type: 'image/jpeg' })).toBe('jpg');
    expect(coverImageExtension({ type: 'image/webp' })).toBe('webp');
    expect(coverImageExtension({ type: 'image/svg+xml' })).toBeNull();
    expect(coverImageExtension({ type: 'application/pdf' })).toBeNull();
  });
});

describe('researchCoverUrl', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('builds the public bucket URL', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://abc.supabase.co/');
    expect(researchCoverUrl('covers/x.jpg'))
      .toBe('https://abc.supabase.co/storage/v1/object/public/research-covers/covers/x.jpg');
  });

  it('returns null without a path', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://abc.supabase.co');
    expect(researchCoverUrl(null)).toBeNull();
  });
});

describe('publishBlockers', () => {
  const ready = {
    title: 'T', slug: 't', summary: 'S', cover_image_path: 'covers/x.jpg', bodyIsEmpty: false,
  };

  it('is empty for a complete post', () => {
    expect(publishBlockers(ready)).toEqual([]);
  });

  it('lists every missing field', () => {
    expect(publishBlockers({ title: ' ', slug: 'Bad Slug', summary: null, cover_image_path: null, bodyIsEmpty: true }))
      .toEqual(['title', 'URL slug', 'summary', 'cover image', 'article body']);
  });
});

import { describe, it, expect } from 'vitest';
import { isExternalUrl } from '@/lib/lms-markdown';

describe('isExternalUrl', () => {
  it('treats http/https URLs as external', () => {
    expect(isExternalUrl('https://docs.google.com/presentation/d/abc')).toBe(true);
    expect(isExternalUrl('http://example.com')).toBe(true);
  });

  it('is case-insensitive on the scheme and tolerates surrounding whitespace', () => {
    expect(isExternalUrl('HTTPS://example.com')).toBe(true);
    expect(isExternalUrl('  https://example.com  ')).toBe(true);
  });

  it('treats in-app / relative links as internal', () => {
    expect(isExternalUrl('/learning/12/3')).toBe(false);
    expect(isExternalUrl('#section')).toBe(false);
    expect(isExternalUrl('mailto:team@romega.com')).toBe(false);
  });

  it('returns false for empty / nullish input', () => {
    expect(isExternalUrl('')).toBe(false);
    expect(isExternalUrl(null)).toBe(false);
    expect(isExternalUrl(undefined)).toBe(false);
  });
});

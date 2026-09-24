import { describe, it, expect } from 'vitest';
import { normalizeLinkUrl, linkDisplayText, encodeLinkActivity, decodeLinkActivity } from '@/lib/work-item-links';

describe('normalizeLinkUrl', () => {
  it('keeps http(s) URLs', () => {
    expect(normalizeLinkUrl('https://github.com/org/repo/pull/1')).toBe('https://github.com/org/repo/pull/1');
    expect(normalizeLinkUrl('  http://example.com/a?b=c  ')).toBe('http://example.com/a?b=c');
  });

  it('prepends https:// to a bare host', () => {
    expect(normalizeLinkUrl('docs.google.com/doc/123')).toBe('https://docs.google.com/doc/123');
  });

  it('rejects non-http schemes and junk', () => {
    expect(normalizeLinkUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeLinkUrl('data:text/html,hi')).toBeNull();
    expect(normalizeLinkUrl('mailto:a@b.com')).toBeNull();
    expect(normalizeLinkUrl('not a url')).toBeNull();
    expect(normalizeLinkUrl('')).toBeNull();
  });
});

describe('linkDisplayText', () => {
  it('prefers the title, else a scheme-less URL', () => {
    expect(linkDisplayText('Spec', 'https://x.com/a')).toBe('Spec');
    expect(linkDisplayText('  ', 'https://x.com/a/')).toBe('x.com/a');
  });
});

describe('link activity payload', () => {
  it('round-trips', () => {
    const v = { title: 'PR', url: 'https://github.com/o/r/pull/2' };
    expect(decodeLinkActivity(encodeLinkActivity(v))).toEqual(v);
  });

  it('rejects malformed or unsafe payloads', () => {
    expect(decodeLinkActivity(null)).toBeNull();
    expect(decodeLinkActivity('nope')).toBeNull();
    expect(decodeLinkActivity(JSON.stringify({ title: 'x', url: 'javascript:alert(1)' }))).toBeNull();
  });
});

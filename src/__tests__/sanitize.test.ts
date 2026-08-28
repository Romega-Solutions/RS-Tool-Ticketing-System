import { describe, it, expect } from 'vitest';
import { sanitizeRichText } from '@/lib/sanitize';

describe('sanitizeRichText', () => {
  it('converts a literal typed <br> (escaped by the editor) into a real line break', () => {
    const dirty = '<p>Line one&lt;br&gt;Line two</p>';
    expect(sanitizeRichText(dirty)).toBe('<p>Line one<br />Line two</p>');
  });

  it('handles common <br> variants (self-closing, spaced, uppercase)', () => {
    expect(sanitizeRichText('a&lt;br/&gt;b')).toBe('a<br />b');
    expect(sanitizeRichText('a&lt; br &gt;b')).toBe('a<br />b');
    expect(sanitizeRichText('a&lt;BR&gt;b')).toBe('a<br />b');
  });

  it('still strips disallowed tags and attributes', () => {
    expect(sanitizeRichText('<script>alert(1)</script><p onclick="x()">hi</p>'))
      .toBe('<p>hi</p>');
  });

  it('is idempotent (safe to run again at render time)', () => {
    const once = sanitizeRichText('<p>Line one&lt;br&gt;Line two</p>');
    expect(sanitizeRichText(once)).toBe(once);
  });
});

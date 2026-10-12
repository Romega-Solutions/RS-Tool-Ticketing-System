import { describe, expect, it } from 'vitest';
import { descriptionSearchText, matchesTaskSearch, parseTaskSearch } from '@/lib/task-search';

describe('descriptionSearchText', () => {
  it('strips tags, decodes entities, and lowercases', () => {
    expect(descriptionSearchText('<p>Fix the <strong>Invoice</strong> &amp; receipt flow</p>'))
      .toBe('fix the invoice & receipt flow');
  });

  it('keeps words in separate blocks apart', () => {
    expect(descriptionSearchText('<p>alpha</p><p>beta</p><ul><li>gamma</li></ul>'))
      .toBe('alpha beta gamma');
  });

  it('does not expose tag or attribute names', () => {
    const text = descriptionSearchText('<span style="font-size: 12px">hi</span> <a href="https://x.io">link</a>');
    expect(text).toBe('hi link');
  });

  it('handles empty input', () => {
    expect(descriptionSearchText(null)).toBe('');
    expect(descriptionSearchText(undefined)).toBe('');
    expect(descriptionSearchText('')).toBe('');
  });

  it('decodes numeric entities', () => {
    expect(descriptionSearchText('it&#39;s&nbsp;done &#x2014; ok')).toBe('it\'s done — ok');
  });
});

describe('matchesTaskSearch', () => {
  const item = (text: string, sequence_id = 7, identifier?: string) => ({ text, sequence_id, identifier });

  it('returns null for a blank query', () => {
    expect(parseTaskSearch('   ')).toBeNull();
  });

  it('matches a keyword that only appears in the description text', () => {
    const text = `login page ${descriptionSearchText('<p>Users see a <em>CSRF</em> error after timeout</p>')}`;
    expect(matchesTaskSearch(parseTaskSearch('csrf')!, item(text))).toBe(true);
    expect(matchesTaskSearch(parseTaskSearch('CSRF error')!, item(text))).toBe(true);
    expect(matchesTaskSearch(parseTaskSearch('payroll')!, item(text))).toBe(false);
  });

  it('matches ticket numbers with or without a project identifier', () => {
    expect(matchesTaskSearch(parseTaskSearch('7')!, item('x'))).toBe(true);
    expect(matchesTaskSearch(parseTaskSearch('#7')!, item('x'))).toBe(true);
    expect(matchesTaskSearch(parseTaskSearch('ops-7')!, item('x', 7, 'OPS'))).toBe(true);
    expect(matchesTaskSearch(parseTaskSearch('web-7')!, item('x', 7, 'OPS'))).toBe(false);
    expect(matchesTaskSearch(parseTaskSearch('8')!, item('x'))).toBe(false);
  });
});

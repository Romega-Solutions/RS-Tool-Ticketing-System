import { describe, it, expect } from 'vitest';
import { extractMentionUserIds } from '@/lib/mentions';

// The Tiptap Mention extension serializes a mention as:
//   <span data-type="mention" data-id="123" data-label="Name">@Name</span>
// extractMentionUserIds() must pull the numeric data-id out of those nodes only.

describe('extractMentionUserIds', () => {
  it('extracts the id from a single mention node', () => {
    const html = '<p>Hey <span data-type="mention" data-id="42" data-label="Ada">@Ada</span> look</p>';
    expect(extractMentionUserIds(html)).toEqual([42]);
  });

  it('extracts ids from multiple mentions, preserving order', () => {
    const html =
      '<p><span data-type="mention" data-id="7" data-label="A">@A</span> and ' +
      '<span data-type="mention" data-id="9" data-label="B">@B</span></p>';
    expect(extractMentionUserIds(html)).toEqual([7, 9]);
  });

  it('dedupes repeated mentions of the same user', () => {
    const html =
      '<span data-type="mention" data-id="5">@X</span> ' +
      '<span data-type="mention" data-id="5">@X</span>';
    expect(extractMentionUserIds(html)).toEqual([5]);
  });

  it('is robust to attribute order and single quotes', () => {
    const html = "<span data-id='13' data-label='C' data-type='mention'>@C</span>";
    expect(extractMentionUserIds(html)).toEqual([13]);
  });

  it('ignores plain "@name" text that is NOT a mention node', () => {
    const html = '<p>email me @bob or @alice please</p>';
    expect(extractMentionUserIds(html)).toEqual([]);
  });

  it('ignores non-mention spans (e.g. font-size styling)', () => {
    const html = '<p><span style="font-size:20px">big</span> @nope</p>';
    expect(extractMentionUserIds(html)).toEqual([]);
  });

  it('skips mention nodes without a numeric data-id', () => {
    const html = '<span data-type="mention" data-label="Ghost">@Ghost</span>';
    expect(extractMentionUserIds(html)).toEqual([]);
  });

  it('returns [] for empty / null / undefined input', () => {
    expect(extractMentionUserIds('')).toEqual([]);
    expect(extractMentionUserIds(null)).toEqual([]);
    expect(extractMentionUserIds(undefined)).toEqual([]);
  });
});

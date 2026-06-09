import { describe, expect, it } from 'vitest';
import { normalizeProjectPatch } from '@/lib/tickets';

describe('normalizeProjectPatch', () => {
  it('trims project names before saving', () => {
    expect(normalizeProjectPatch({ name: '  Romega Portal  ' })).toEqual({
      name: 'Romega Portal',
    });
  });

  it('rejects blank project names', () => {
    expect(() => normalizeProjectPatch({ name: '   ' })).toThrow('Project name cannot be blank');
  });

  it('normalizes empty descriptions to null', () => {
    expect(normalizeProjectPatch({ description: '   ' })).toEqual({
      description: null,
    });
  });
});

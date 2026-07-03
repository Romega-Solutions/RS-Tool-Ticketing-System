import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('src/app/(app)/admin/broadcasts/broadcast-center.client.tsx', 'utf8');

describe('broadcast preview UI', () => {
  it('opens a preview dialog before sending the broadcast', () => {
    expect(source).toContain('DialogContent');
    expect(source).toContain('Preview broadcast');
    expect(source).toContain('Send now');
    expect(source).toContain('openPreview');
  });
});

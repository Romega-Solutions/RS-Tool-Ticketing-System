import { describe, expect, it } from 'vitest';
import { formatReminderSentAt } from '@/lib/format';

describe('formatReminderSentAt', () => {
  it('shows the saved instant in Manila time', () => {
    expect(formatReminderSentAt('2026-09-14T13:05:00.000Z')).toBe('Sep 14, 9:05 PM PHT');
  });

  it('does not render an empty last-sent label', () => {
    expect(formatReminderSentAt(null)).toBeNull();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  read: vi.fn(), update: vi.fn(), insert: vi.fn(),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('@/lib/session', () => ({ getSession: async () => ({ id: 1, name: 'Test', role: 'admin' }) }));
vi.mock('@/lib/rbac', () => ({ hasToolAccess: () => true }));
vi.mock('@/lib/storage', () => ({ uploadOnboarderDocument: vi.fn() }));
vi.mock('@/lib/n8n', () => ({ notifyOnboardingWebhook: vi.fn(), notifyFormReminder: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: mocks.read }) }),
      update: mocks.update,
      insert: mocks.insert,
    }),
  }),
}));

import { updateOnboarderStatus } from '@/app/(app)/onboarders/actions';

describe('Day 1 start date', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-17T17:00:00Z'));
    mocks.read.mockResolvedValue({ data: { status: 'pre_onboarding', start_date: null, full_name: 'Test Person' }, error: null });
    mocks.update.mockReturnValue({ eq: async () => ({ error: null }) });
    mocks.insert.mockResolvedValue({ error: null });
  });
  afterEach(() => vi.useRealTimers());

  it('sets the Philippine date on Day 1 entry and records history', async () => {
    await updateOnboarderStatus(1, 'day_one');
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'day_one', start_date: '2026-09-18' }));
    expect(mocks.insert).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ field: 'start_date', new_value: '2026-09-18' }),
    ]));
  });

  it('replaces a planned date on Day 1 entry', async () => {
    mocks.read.mockResolvedValue({ data: { status: 'pre_onboarding', start_date: '2026-09-01', full_name: 'Test Person' }, error: null });
    await updateOnboarderStatus(1, 'day_one');
    expect(mocks.update.mock.calls[0][0].start_date).toBe('2026-09-18');
  });

  it('does not reset the date when already in Day 1', async () => {
    mocks.read.mockResolvedValue({ data: { status: 'day_one', start_date: '2026-09-01' }, error: null });
    await updateOnboarderStatus(1, 'day_one');
    expect(mocks.update.mock.calls[0][0]).not.toHaveProperty('start_date');
  });

  it('leaves the date untouched for other status changes', async () => {
    mocks.read.mockResolvedValue({ data: { status: 'day_one', start_date: '2026-09-01', full_name: 'Test Person' }, error: null });
    await updateOnboarderStatus(1, 'pre_onboarding');
    expect(mocks.update.mock.calls[0][0]).not.toHaveProperty('start_date');
  });

  it('does not write if the record cannot be read', async () => {
    mocks.read.mockResolvedValue({ data: null, error: { message: 'Read failed' } });
    await expect(updateOnboarderStatus(1, 'day_one')).rejects.toThrow('Read failed');
    expect(mocks.update).not.toHaveBeenCalled();
  });
});

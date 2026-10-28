import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TimeEditEmailRequest } from '@/lib/time-edit-emails';

// after() is replaced so the test decides when the deferred work runs.
const afterMock = vi.fn<(fn: () => unknown) => void>();
vi.mock('next/server', () => ({ after: (fn: () => unknown) => afterMock(fn) }));

import { sendTimeEditEmailAfterResponse } from '@/lib/time-edit-emails';

const request: TimeEditEmailRequest = {
  id: 7, userId: 1, date: '2026-10-09',
  currentClockIn: '2026-10-09T15:00:00.000Z', currentClockOut: '2026-10-09T18:00:00.000Z',
  requestedClockIn: null, requestedClockOut: '2026-10-09T18:30:00.000Z',
  reason: 'Late clock out.', documentName: null, requestedAt: '2026-10-10T01:41:00.000Z', supervisorId: null,
};

function fakeAdmin() {
  const inFn = vi.fn(async (_c: string, ids: number[]) => ({
    data: ids.includes(1) ? [{ id: 1, name: 'Req Er', email: 'requester@example.test', is_active: 1 }] : [],
    error: null,
  }));
  const from = vi.fn(() => ({ select: () => ({ in: inFn }) }));
  return { admin: { from } as never, from };
}

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  afterMock.mockReset();
  fetchMock = vi.fn(async () => new Response('', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('N8N_HTML_EMAIL_URL', 'https://n8n.test/html');
  vi.stubEnv('TIME_EDIT_EMAILS_MODE', 'send');
  vi.stubEnv('VERCEL_ENV', 'production');
  vi.stubEnv('TIME_EDIT_EMAILS_TEST_TO', '');
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('sendTimeEditEmailAfterResponse', () => {
  it('defers all work to after() and does nothing before it runs', async () => {
    const { admin, from } = fakeAdmin();
    sendTimeEditEmailAfterResponse({ kind: 'received', waitingFor: 'supervisor', request, admin });
    expect(afterMock).toHaveBeenCalledTimes(1);
    expect(from).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();

    await afterMock.mock.calls[0][0]();
    expect(from).toHaveBeenCalledWith('users');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('runs the send directly when there is no request scope', async () => {
    afterMock.mockImplementation(() => { throw new Error('`after` was called outside a request scope'); });
    const { admin } = fakeAdmin();
    sendTimeEditEmailAfterResponse({ kind: 'received', waitingFor: 'supervisor', request, admin });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });
});

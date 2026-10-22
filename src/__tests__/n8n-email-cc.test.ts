import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildEmailPayload, sendEmailAwaited } from '@/lib/n8n';

describe('buildEmailPayload', () => {
  it('omits cc when empty (old contract unchanged)', () => {
    expect(buildEmailPayload({ to: 'a@x', subject: 's', html: '<b>hi</b>' }))
      .toEqual({ to: 'a@x', subject: 's', body: 'hi', html: '<b>hi</b>' });
  });
  it('joins, trims and dedupes cc, dropping the To address', () => {
    expect(buildEmailPayload({ to: 'a@x', cc: [' b@x', 'b@x', 'A@x', ''], subject: 's', html: 'h' }).cc).toBe('b@x');
  });
});

describe('sendEmailAwaited', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  it('reports not configured', async () => {
    vi.stubEnv('N8N_NOTIFICATION_EMAIL_URL', '');
    vi.stubEnv('N8N_ACCOUNT_SETUP_URL', '');
    expect(await sendEmailAwaited({ to: 'a@x', subject: 's', html: 'h' })).toEqual({ ok: false, error: 'email webhook not configured' });
  });
  it('awaits the response and reports status', async () => {
    vi.stubEnv('N8N_NOTIFICATION_EMAIL_URL', 'https://n8n.test/hook');
    const fetchMock = vi.fn(async () => new Response('', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await sendEmailAwaited({ to: 'a@x', cc: ['b@x'], subject: 's', html: 'h' })).toEqual({ ok: true });
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.cc).toBe('b@x');
    fetchMock.mockResolvedValueOnce(new Response('', { status: 500 }));
    expect(await sendEmailAwaited({ to: 'a@x', subject: 's', html: 'h' })).toEqual({ ok: false, error: 'n8n responded 500' });
  });
});

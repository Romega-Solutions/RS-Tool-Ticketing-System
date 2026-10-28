import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildEmailPayload, sendEmailAwaited, sendHtmlEmailAwaited } from '@/lib/n8n';

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

describe('sendHtmlEmailAwaited', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it('sends nothing and does not fall back to the plain-text webhook when its URL is unset', async () => {
    vi.stubEnv('N8N_HTML_EMAIL_URL', '');
    vi.stubEnv('N8N_NOTIFICATION_EMAIL_URL', 'https://n8n.test/plain');
    vi.stubEnv('N8N_ACCOUNT_SETUP_URL', 'https://n8n.test/setup');
    const fetchMock = vi.fn(async () => new Response('', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await sendHtmlEmailAwaited({ to: 'a@x', subject: 's', html: 'h' }))
      .toEqual({ ok: false, error: 'html email webhook not configured' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts the same payload to its own URL, never to the plain-text one', async () => {
    vi.stubEnv('N8N_HTML_EMAIL_URL', 'https://n8n.test/html');
    vi.stubEnv('N8N_NOTIFICATION_EMAIL_URL', 'https://n8n.test/plain');
    const fetchMock = vi.fn(async () => new Response('', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await sendHtmlEmailAwaited({ to: 'a@x', cc: ['b@x'], subject: 's', html: '<b>h</b>', text: 'h' })).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://n8n.test/html');
    expect(JSON.parse(init.body as string)).toEqual({ to: 'a@x', subject: 's', body: 'h', html: '<b>h</b>', cc: 'b@x' });
  });

  it('reports a failed response and a thrown error without throwing', async () => {
    vi.stubEnv('N8N_HTML_EMAIL_URL', 'https://n8n.test/html');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500 })));
    expect(await sendHtmlEmailAwaited({ to: 'a@x', subject: 's', html: 'h' })).toEqual({ ok: false, error: 'n8n responded 500' });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down'); }));
    expect(await sendHtmlEmailAwaited({ to: 'a@x', subject: 's', html: 'h' })).toEqual({ ok: false, error: 'down' });
  });
});

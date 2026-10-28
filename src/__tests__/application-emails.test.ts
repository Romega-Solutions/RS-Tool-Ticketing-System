import { describe, it, expect, vi } from 'vitest';
import {
  APPLICANT_FROM,
  APPLICANT_REPLY_TO,
  DEFAULT_APPLICATION_NOTIFY_TO,
  EMAIL_FONT_STACK,
  buildApplicantAckEmail,
  deliverApplicantAck,
  getApplicantAckMode,
  getApplicationNotifyTo,
  sendApplicantAck,
} from '@/lib/application-emails';

const STUB_KEY = 're_stub_not_a_real_key';

const sample = {
  fullName: 'Jamie Rivera',
  role: 'Full-Stack Developer',
  applicationCode: 'APP-2026-0071',
};

function stubFetch(status = 200, body: unknown = { id: 'email_stub_1' }) {
  return vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  );
}

describe('getApplicationNotifyTo', () => {
  it('defaults to the HR address when unset', () => {
    expect(getApplicationNotifyTo({} as NodeJS.ProcessEnv)).toBe('hr@romega-solutions.com');
    expect(DEFAULT_APPLICATION_NOTIFY_TO).toBe('hr@romega-solutions.com');
  });

  it('uses a valid override, trimmed and lower-cased', () => {
    const env = { APPLICATION_NOTIFY_TO: '  Test.Person@Example.com ' } as unknown as NodeJS.ProcessEnv;
    expect(getApplicationNotifyTo(env)).toBe('test.person@example.com');
  });

  it('falls back to the default for a blank or invalid value', () => {
    for (const bad of ['', '   ', 'not-an-email', 'a@b', 'a@b.com, c@d.com', 'x y@z.com', '<a@b.com>']) {
      const env = { APPLICATION_NOTIFY_TO: bad } as unknown as NodeJS.ProcessEnv;
      expect(getApplicationNotifyTo(env)).toBe('hr@romega-solutions.com');
    }
  });
});

describe('getApplicantAckMode', () => {
  it('is off unless the value is exactly "hr"', () => {
    expect(getApplicantAckMode({} as NodeJS.ProcessEnv)).toBe('n8n');
    for (const v of ['', 'off', 'n8n', 'true', '1', 'hr2', 'on']) {
      expect(getApplicantAckMode({ APPLICANT_ACK_MODE: v } as unknown as NodeJS.ProcessEnv)).toBe('n8n');
    }
  });

  it('turns on for "hr" in any case with spaces', () => {
    for (const v of ['hr', 'HR', ' Hr ']) {
      expect(getApplicantAckMode({ APPLICANT_ACK_MODE: v } as unknown as NodeJS.ProcessEnv)).toBe('hr');
    }
  });
});

describe('buildApplicantAckEmail', () => {
  it('fills the subject, greeting, role and code', () => {
    const m = buildApplicantAckEmail(sample);
    expect(m.subject).toBe('Application received — Full-Stack Developer (APP-2026-0071)');
    expect(m.html).toContain('Thank you, Jamie.');
    expect(m.html).toContain('Full-Stack Developer');
    expect(m.html).toContain('APP-2026-0071');
    expect(m.html).toContain('5 to 7 business days');
    expect(m.html).toContain(APPLICANT_REPLY_TO);
    expect(m.text).toContain('Hi Jamie,');
    expect(m.text).toContain('Your application code: APP-2026-0071');
    expect(m.text).toContain('Full-Stack Developer position');
  });

  it('has no leftover template markers or sample banner', () => {
    const m = buildApplicantAckEmail(sample);
    expect(m.html).not.toMatch(/\{\{[^}]*\}\}/);
    expect(m.text).not.toMatch(/\{\{[^}]*\}\}/);
    expect(m.html).not.toMatch(/SAMPLE|MOCKUP/i);
    expect(m.html).not.toContain('data:image');
    expect(m.html).not.toContain('data-hosted-src');
  });

  it('uses Poppins only: neither Aptos nor Segoe appears anywhere in the output', () => {
    const withCode = buildApplicantAckEmail(sample);
    const withoutCode = buildApplicantAckEmail({ ...sample, applicationCode: null });
    for (const m of [withCode, withoutCode]) {
      for (const part of [m.subject, m.html, m.text]) {
        expect(part).not.toMatch(/aptos/i);
        expect(part).not.toMatch(/segoe/i);
        expect(part).not.toMatch(/times new roman|georgia/i);
      }
    }
  });

  it('uses exactly one font stack (the Outlook-only block uses plain Arial)', () => {
    expect(EMAIL_FONT_STACK).toBe("'Poppins', Arial, Helvetica, sans-serif");
    const m = buildApplicantAckEmail(sample);
    const declared = [...m.html.matchAll(/font-family:([^;"]+)/g)].map(x => x[1]);
    expect(declared.length).toBeGreaterThan(5);
    const allowed = new Set([EMAIL_FONT_STACK, 'Arial,sans-serif !important']);
    for (const d of declared) expect(allowed.has(d)).toBe(true);
    expect(m.html).toContain(`font-family:${EMAIL_FONT_STACK}`);
  });

  it('points the images at the public portal images and has the yellow line under the logo', () => {
    const m = buildApplicantAckEmail(sample);
    expect(m.html).toContain('src="https://portal.romega-solutions.com/images/romega-email-logo.png"');
    expect(m.html).toContain('src="https://portal.romega-solutions.com/images/email-check.png"');
    expect(m.html).toContain('border-bottom:4px solid #febd18');
    expect(m.html).toContain('alt="Romega Solutions"');
  });

  it('escapes the name and role, even with markup in them', () => {
    const m = buildApplicantAckEmail({
      fullName: '<img src=x onerror=alert(1)> Jordan',
      role: 'Dev <script>alert(1)</script> & "QA"',
      applicationCode: 'APP-<b>1</b>',
    });
    expect(m.html).not.toContain('<img src=x');
    expect(m.html).not.toContain('<script>');
    expect(m.html).not.toContain('<b>1</b>');
    expect(m.html).toContain('&lt;img');
    expect(m.html).toContain('&lt;script&gt;');
    expect(m.html).toContain('&amp;');
    expect(m.html).toContain('&quot;QA&quot;');
  });

  it('keeps the subject and text on one line even with line breaks in the input', () => {
    const m = buildApplicantAckEmail({
      fullName: 'Ann\r\nBcc: x@y.com',
      role: 'Dev\r\nBcc: x@y.com',
      applicationCode: 'APP-1\nX',
    });
    expect(m.subject).not.toMatch(/[\r\n]/);
    expect(m.subject).toBe('Application received — Dev Bcc: x@y.com (APP-1 X)');
    expect(m.text.split('\n')[0]).toBe('Hi Ann,');
  });

  it('drops the code card when there is no application code', () => {
    const m = buildApplicantAckEmail({ ...sample, applicationCode: null });
    expect(m.subject).toBe('Application received — Full-Stack Developer');
    expect(m.html).not.toContain('Your application code');
    expect(m.text).not.toContain('application code');
  });

  it('uses a neutral greeting, with no name, when the applicant name is blank', () => {
    for (const fullName of ['', '   ', '\r\n\t']) {
      const m = buildApplicantAckEmail({ ...sample, fullName });
      expect(m.html).toContain('Thank you for applying. We have received your application');
      expect(m.html).not.toContain('Thank you, ');
      expect(m.html).not.toMatch(/Thank you, there/i);
      expect(m.text.split('\n')[0]).toBe('Hello,');
      expect(m.text).not.toMatch(/\bthere\b/i);
      expect(m.text).not.toContain('Hi ,');
    }
  });

  it('has a hidden preheader and a plain-text part', () => {
    const m = buildApplicantAckEmail(sample);
    expect(m.html).toContain('display:none');
    expect(m.html).toContain('Your code is APP-2026-0071.');
    expect(m.text.length).toBeGreaterThan(100);
  });
});

describe('sendApplicantAck', () => {
  const env = { RESEND_API_KEY: STUB_KEY } as unknown as NodeJS.ProcessEnv;

  it('posts to Resend from the HR address to the applicant only, with reply-to HR', async () => {
    const fetchImpl = stubFetch();
    const r = await sendApplicantAck(
      { ...sample, to: 'Jamie@Example.com ', idempotencyKey: 'applicant-ack-5' },
      { env, fetchImpl },
    );
    expect(r).toEqual({ ok: true, id: 'email_stub_1' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${STUB_KEY}`);
    expect(headers['Idempotency-Key']).toBe('applicant-ack-5');
    const body = JSON.parse(String(init.body));
    expect(body.from).toBe(APPLICANT_FROM);
    expect(body.from).toContain('hr@romega-solutions.com');
    expect(body.to).toEqual(['jamie@example.com']);
    expect(body.reply_to).toBe('hr@romega-solutions.com');
    expect(body.subject).toBe('Application received — Full-Stack Developer (APP-2026-0071)');
    expect(body.html).toContain('APP-2026-0071');
    expect(body.text).toContain('Hi Jamie,');
    expect(body.bcc).toBeUndefined();
    expect(body.cc).toBeUndefined();
  });

  it('sends nothing and reports "not sent" when the key is missing', async () => {
    const fetchImpl = stubFetch();
    const r = await sendApplicantAck({ ...sample, to: 'a@example.com' }, { env: {} as NodeJS.ProcessEnv, fetchImpl });
    expect(r).toEqual({ ok: false, notSent: true, error: 'RESEND_API_KEY is not configured' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('sends nothing for an invalid applicant address', async () => {
    const fetchImpl = stubFetch();
    for (const bad of ['', 'nope', 'a@b', 'a b@c.com', 'a@b.com,c@d.com']) {
      const r = await sendApplicantAck({ ...sample, to: bad }, { env, fetchImpl });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.notSent).toBe(true);
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('never throws and marks a 4xx as not sent, without leaking the key', async () => {
    const r = await sendApplicantAck({ ...sample, to: 'a@example.com' }, { env, fetchImpl: stubFetch(403, { message: 'domain not verified' }) });
    expect(r).toEqual({ ok: false, notSent: true, error: 'Resend responded 403' });
    expect(JSON.stringify(r)).not.toContain(STUB_KEY);
  });

  it('marks a 5xx and a network failure as unknown (not safe to resend by another route)', async () => {
    const r5 = await sendApplicantAck({ ...sample, to: 'a@example.com' }, { env, fetchImpl: stubFetch(500, {}) });
    expect(r5).toEqual({ ok: false, notSent: false, error: 'Resend responded 500' });

    const boom = vi.fn(async () => { throw new Error('socket hang up'); });
    const rn = await sendApplicantAck({ ...sample, to: 'a@example.com' }, { env, fetchImpl: boom });
    expect(rn).toEqual({ ok: false, notSent: false, error: 'socket hang up' });
    expect(JSON.stringify(rn)).not.toContain(STUB_KEY);
  });

  it('tolerates an empty success body', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 200 }));
    const r = await sendApplicantAck({ ...sample, to: 'a@example.com' }, { env, fetchImpl });
    expect(r).toEqual({ ok: true, id: null });
  });
});

describe('deliverApplicantAck (exactly one email per application)', () => {
  const input = { ...sample, to: 'jamie@example.com', idempotencyKey: 'applicant-ack-9' };

  function makeHooks() {
    return {
      sendPlain:    vi.fn(async () => {}),
      recordSent:   vi.fn<(id: string | null) => Promise<void>>(async () => {}),
      recordFailed: vi.fn<(error: string, fellBack: boolean) => Promise<void>>(async () => {}),
    };
  }

  it('is off by default: only the plain acknowledgement, and Resend is never called', async () => {
    const hooks = makeHooks();
    const fetchImpl = stubFetch();
    const route = await deliverApplicantAck({ input, ...hooks }, { env: { RESEND_API_KEY: STUB_KEY } as unknown as NodeJS.ProcessEnv, fetchImpl });
    expect(route).toBe('plain');
    expect(hooks.sendPlain).toHaveBeenCalledTimes(1);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(hooks.recordSent).not.toHaveBeenCalled();
    expect(hooks.recordFailed).not.toHaveBeenCalled();
  });

  it('stays off for any value other than "hr"', async () => {
    const hooks = makeHooks();
    const fetchImpl = stubFetch();
    const env = { APPLICANT_ACK_MODE: 'on', RESEND_API_KEY: STUB_KEY } as unknown as NodeJS.ProcessEnv;
    expect(await deliverApplicantAck({ input, ...hooks }, { env, fetchImpl })).toBe('plain');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('mode hr and a good send: only the HR confirmation, plain is not sent', async () => {
    const hooks = makeHooks();
    const fetchImpl = stubFetch();
    const env = { APPLICANT_ACK_MODE: 'hr', RESEND_API_KEY: STUB_KEY } as unknown as NodeJS.ProcessEnv;
    expect(await deliverApplicantAck({ input, ...hooks }, { env, fetchImpl })).toBe('hr');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(hooks.recordSent).toHaveBeenCalledWith('email_stub_1');
    expect(hooks.sendPlain).not.toHaveBeenCalled();
    expect(hooks.recordFailed).not.toHaveBeenCalled();
  });

  it('mode hr but no key: falls back to the plain acknowledgement and records the failure', async () => {
    const hooks = makeHooks();
    const fetchImpl = stubFetch();
    const env = { APPLICANT_ACK_MODE: 'hr' } as unknown as NodeJS.ProcessEnv;
    expect(await deliverApplicantAck({ input, ...hooks }, { env, fetchImpl })).toBe('plain_after_hr_refused');
    expect(hooks.sendPlain).toHaveBeenCalledTimes(1);
    expect(hooks.recordFailed).toHaveBeenCalledWith('RESEND_API_KEY is not configured', true);
    expect(hooks.recordSent).not.toHaveBeenCalled();
  });

  it('mode hr and Resend refuses (4xx): falls back to plain, once', async () => {
    const hooks = makeHooks();
    const env = { APPLICANT_ACK_MODE: 'hr', RESEND_API_KEY: STUB_KEY } as unknown as NodeJS.ProcessEnv;
    expect(await deliverApplicantAck({ input, ...hooks }, { env, fetchImpl: stubFetch(422, {}) })).toBe('plain_after_hr_refused');
    expect(hooks.sendPlain).toHaveBeenCalledTimes(1);
    expect(hooks.recordFailed).toHaveBeenCalledWith('Resend responded 422', true);
  });

  it('mode hr and an unknown outcome (5xx or network error): no second email, failure recorded', async () => {
    const env = { APPLICANT_ACK_MODE: 'hr', RESEND_API_KEY: STUB_KEY } as unknown as NodeJS.ProcessEnv;
    const h1 = makeHooks();
    expect(await deliverApplicantAck({ input, ...h1 }, { env, fetchImpl: stubFetch(503, {}) })).toBe('failed');
    expect(h1.sendPlain).not.toHaveBeenCalled();
    expect(h1.recordFailed).toHaveBeenCalledWith('Resend responded 503', false);

    const h2 = makeHooks();
    const boom = vi.fn(async () => { throw new Error('timeout'); });
    expect(await deliverApplicantAck({ input, ...h2 }, { env, fetchImpl: boom })).toBe('failed');
    expect(h2.sendPlain).not.toHaveBeenCalled();
  });

  it('a failing history write never stops the plain fallback or turns a good send into an error', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const env = { APPLICANT_ACK_MODE: 'hr', RESEND_API_KEY: STUB_KEY } as unknown as NodeJS.ProcessEnv;

    const h1 = makeHooks();
    h1.recordFailed.mockRejectedValue(new Error('history table unavailable'));
    expect(await deliverApplicantAck({ input, ...h1 }, { env, fetchImpl: stubFetch(422, {}) })).toBe('plain_after_hr_refused');
    expect(h1.sendPlain).toHaveBeenCalledTimes(1);

    const h2 = makeHooks();
    h2.recordFailed.mockRejectedValue(new Error('history table unavailable'));
    expect(await deliverApplicantAck({ input, ...h2 }, { env: { APPLICANT_ACK_MODE: 'hr' } as unknown as NodeJS.ProcessEnv, fetchImpl: stubFetch() })).toBe('plain_after_hr_refused');
    expect(h2.sendPlain).toHaveBeenCalledTimes(1);

    const h3 = makeHooks();
    h3.recordSent.mockRejectedValue(new Error('history table unavailable'));
    expect(await deliverApplicantAck({ input, ...h3 }, { env, fetchImpl: stubFetch() })).toBe('hr');
    expect(h3.sendPlain).not.toHaveBeenCalled();

    const h4 = makeHooks();
    h4.recordFailed.mockRejectedValue(new Error('history table unavailable'));
    expect(await deliverApplicantAck({ input, ...h4 }, { env, fetchImpl: stubFetch(503, {}) })).toBe('failed');
    expect(h4.sendPlain).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});

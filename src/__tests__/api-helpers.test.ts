import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  HttpError,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  timingSafeEqual,
  verifyBearer,
  assertSession,
  assertAdmin,
  parseBody,
  parseOptionalBody,
  route,
} from '@/lib/api';
import type { SessionUser } from '@/lib/session';

const sessionOf = (role: SessionUser['role']): SessionUser => ({
  id: 1, email: 'a@b.com', name: 'A', username: 'a',
  role, team: null, jobTitle: null, isOnboarding: false,
});

describe('HttpError factories', () => {
  it('carry the right status and default message', () => {
    expect(badRequest()).toMatchObject({ status: 400, message: 'Bad request' });
    expect(unauthorized()).toMatchObject({ status: 401, message: 'Unauthorized' });
    expect(forbidden()).toMatchObject({ status: 403, message: 'Forbidden' });
    expect(notFound()).toMatchObject({ status: 404, message: 'Not found' });
    expect(badRequest('nope')).toBeInstanceOf(HttpError);
    expect(badRequest('nope').message).toBe('nope');
  });
});

describe('timingSafeEqual', () => {
  it('is true for identical strings', () => {
    expect(timingSafeEqual('s3cret-token', 's3cret-token')).toBe(true);
  });
  it('is false for different strings', () => {
    expect(timingSafeEqual('s3cret-token', 's3cret-toxen')).toBe(false);
  });
  it('is false for different lengths (no throw)', () => {
    expect(timingSafeEqual('short', 'a-much-longer-secret')).toBe(false);
  });
});

describe('verifyBearer', () => {
  it('throws 500 when the secret is not configured', () => {
    expect(() => verifyBearer('Bearer x', undefined)).toThrow(
      expect.objectContaining({ status: 500 }),
    );
  });
  it('throws 401 when the header is missing', () => {
    expect(() => verifyBearer(null, 'sec')).toThrow(
      expect.objectContaining({ status: 401 }),
    );
  });
  it('throws 401 when the token does not match', () => {
    expect(() => verifyBearer('Bearer wrong', 'sec')).toThrow(
      expect.objectContaining({ status: 401 }),
    );
  });
  it('does not throw when the token matches', () => {
    expect(() => verifyBearer('Bearer sec', 'sec')).not.toThrow();
  });
});

describe('assertSession / assertAdmin', () => {
  it('assertSession returns the session when present', () => {
    const s = sessionOf('ic');
    expect(assertSession(s)).toBe(s);
  });
  it('assertSession throws 401 when null', () => {
    expect(() => assertSession(null)).toThrow(expect.objectContaining({ status: 401 }));
  });
  it('assertAdmin throws 401 when null', () => {
    expect(() => assertAdmin(null)).toThrow(expect.objectContaining({ status: 401 }));
  });
  it('assertAdmin throws 403 for a non-admin', () => {
    expect(() => assertAdmin(sessionOf('lead'))).toThrow(
      expect.objectContaining({ status: 403 }),
    );
  });
  it('assertAdmin returns the session for an admin', () => {
    const s = sessionOf('admin');
    expect(assertAdmin(s)).toBe(s);
  });
});

describe('parseBody', () => {
  const schema = z.object({ name: z.string().min(1) });
  const reqWith = (body: string) =>
    new Request('http://t/x', { method: 'POST', body, headers: { 'content-type': 'application/json' } });

  it('returns the parsed value on a valid body', async () => {
    const data = await parseBody(reqWith(JSON.stringify({ name: 'Ken' })), schema);
    expect(data).toEqual({ name: 'Ken' });
  });
  it('throws 400 on invalid JSON', async () => {
    await expect(parseBody(reqWith('{not json'), schema)).rejects.toMatchObject({ status: 400 });
  });
  it('throws 400 when the schema fails', async () => {
    await expect(parseBody(reqWith(JSON.stringify({ name: '' })), schema)).rejects.toMatchObject({
      status: 400,
    });
  });
});

describe('parseOptionalBody', () => {
  const schema = z.object({ name: z.string().optional() });
  const reqWith = (body: string) =>
    new Request('http://t/x', { method: 'POST', body, headers: { 'content-type': 'application/json' } });

  it('uses the fallback value when the optional body is malformed', async () => {
    const data = await parseOptionalBody(reqWith('{not json'), schema);
    expect(data).toEqual({});
  });

  it('still validates present optional bodies', async () => {
    await expect(
      parseOptionalBody(reqWith(JSON.stringify({ name: 123 })), schema),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('route() wrapper', () => {
  it('passes a successful Response through unchanged', async () => {
    const handler = route(async () => Response.json({ ok: true }));
    const res = await handler();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
  it('converts a thrown HttpError into its status + { error } envelope', async () => {
    const handler = route(async () => { throw forbidden('no way'); });
    const res = await handler();
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'no way' });
  });
  it('converts an unexpected error into a 500 { error } envelope', async () => {
    const handler = route(async () => { throw new Error('boom'); });
    const res = await handler();
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ error: expect.any(String) });
  });
});

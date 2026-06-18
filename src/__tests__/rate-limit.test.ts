import { describe, it, expect } from 'vitest';
import { windowStartIso, retryAfterSeconds, keyByUser, keyByIp, clientIp } from '@/lib/rate-limit';

const at = (iso: string) => new Date(iso);

describe('windowStartIso', () => {
  it('floors to the start of the fixed window', () => {
    // 60s window: 12:00:37 → 12:00:00
    expect(windowStartIso(at('2026-06-18T12:00:37.500Z'), 60)).toBe('2026-06-18T12:00:00.000Z');
  });
  it('handles a 1h window', () => {
    expect(windowStartIso(at('2026-06-18T12:59:59Z'), 3600)).toBe('2026-06-18T12:00:00.000Z');
  });
});

describe('retryAfterSeconds', () => {
  it('returns seconds left in the current window', () => {
    expect(retryAfterSeconds(at('2026-06-18T12:00:37Z'), 60)).toBe(23);
  });
  it('never returns less than 1', () => {
    expect(retryAfterSeconds(at('2026-06-18T12:00:00.000Z'), 60)).toBe(60);
    expect(retryAfterSeconds(at('2026-06-18T12:00:59.999Z'), 60)).toBe(1);
  });
});

describe('key builders', () => {
  it('namespaces by tag + id', () => {
    expect(keyByUser('admin-users', 7)).toBe('admin-users:u:7');
    expect(keyByIp('apply', '1.2.3.4')).toBe('apply:ip:1.2.3.4');
  });
});

describe('clientIp', () => {
  it('takes the first x-forwarded-for hop', () => {
    const req = new Request('http://x', { headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' } });
    expect(clientIp(req)).toBe('1.2.3.4');
  });
  it('falls back to x-real-ip then "unknown"', () => {
    expect(clientIp(new Request('http://x', { headers: { 'x-real-ip': '9.9.9.9' } }))).toBe('9.9.9.9');
    expect(clientIp(new Request('http://x'))).toBe('unknown');
  });
});

import { describe, it, expect, afterEach } from 'vitest';
import { publicBaseUrl, CANONICAL_BASE_URL } from '@/lib/app-url';

const orig = {
  APP_BASE_URL: process.env.APP_BASE_URL,
  NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL,
};
afterEach(() => {
  process.env.APP_BASE_URL = orig.APP_BASE_URL;
  process.env.NEXT_PUBLIC_BASE_URL = orig.NEXT_PUBLIC_BASE_URL;
});

describe('publicBaseUrl — base for links in outbound email', () => {
  it('falls back to the canonical production URL when env points at localhost', () => {
    process.env.APP_BASE_URL = 'http://localhost:3000';
    process.env.NEXT_PUBLIC_BASE_URL = 'http://localhost:3000';
    expect(publicBaseUrl()).toBe(CANONICAL_BASE_URL);
  });

  it('falls back to the canonical production URL when env is empty', () => {
    delete process.env.APP_BASE_URL;
    delete process.env.NEXT_PUBLIC_BASE_URL;
    expect(publicBaseUrl()).toBe(CANONICAL_BASE_URL);
  });

  it('uses an explicit non-localhost env URL, trimming any trailing slash', () => {
    process.env.APP_BASE_URL = 'https://rs-tool-ticketing-system.vercel.app/';
    expect(publicBaseUrl()).toBe('https://rs-tool-ticketing-system.vercel.app');
  });

  it('never returns a 127.0.0.1 URL', () => {
    process.env.APP_BASE_URL = 'http://127.0.0.1:3000';
    delete process.env.NEXT_PUBLIC_BASE_URL;
    expect(publicBaseUrl()).not.toContain('127.0.0.1');
    expect(publicBaseUrl()).toBe(CANONICAL_BASE_URL);
  });
});

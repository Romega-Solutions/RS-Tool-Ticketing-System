import { describe, expect, it } from 'vitest';
import {
  parseTestAddress,
  isValidEmailAddress,
  resolveTimeEditEmailPlan,
  timeEditEmailMode,
  timeEditEmailsReplaceDecided,
} from '@/lib/time-edit-email-mode';

const HTML = 'https://n8n.test/html';

describe('timeEditEmailMode', () => {
  it('defaults to log and only accepts send or off', () => {
    expect(timeEditEmailMode(undefined)).toBe('log');
    expect(timeEditEmailMode('')).toBe('log');
    expect(timeEditEmailMode('yes')).toBe('log');
    expect(timeEditEmailMode(' SEND ')).toBe('send');
    expect(timeEditEmailMode('off')).toBe('off');
  });
});

describe('parseTestAddress', () => {
  it('accepts one plain address and rejects lists and junk', () => {
    expect(parseTestAddress(' qa@example.test ')).toBe('qa@example.test');
    expect(parseTestAddress('a@example.test, b@example.test')).toBeNull();
    expect(parseTestAddress('not an email')).toBeNull();
    expect(parseTestAddress(undefined)).toBeNull();
  });
});

describe('resolveTimeEditEmailPlan', () => {
  it('is off when the HTML webhook is not configured, whatever the mode', () => {
    expect(resolveTimeEditEmailPlan({ TIME_EDIT_EMAILS_MODE: 'send', VERCEL_ENV: 'production' }).action).toBe('off');
    expect(resolveTimeEditEmailPlan({ N8N_HTML_EMAIL_URL: '   ', TIME_EDIT_EMAILS_MODE: 'send' }).action).toBe('off');
  });

  it('logs by default and when the mode is log', () => {
    expect(resolveTimeEditEmailPlan({ N8N_HTML_EMAIL_URL: HTML, VERCEL_ENV: 'production' }).action).toBe('log');
    expect(resolveTimeEditEmailPlan({ N8N_HTML_EMAIL_URL: HTML, TIME_EDIT_EMAILS_MODE: 'log' }).action).toBe('log');
  });

  it('does nothing when the mode is off', () => {
    expect(resolveTimeEditEmailPlan({ N8N_HTML_EMAIL_URL: HTML, TIME_EDIT_EMAILS_MODE: 'off', VERCEL_ENV: 'production' }).action).toBe('off');
  });

  it('sends to real recipients only in production', () => {
    expect(resolveTimeEditEmailPlan({ N8N_HTML_EMAIL_URL: HTML, TIME_EDIT_EMAILS_MODE: 'send', VERCEL_ENV: 'production' }))
      .toEqual({ action: 'send', testTo: null });
  });

  it('is log-only in preview and local runs unless a test address is set', () => {
    expect(resolveTimeEditEmailPlan({ N8N_HTML_EMAIL_URL: HTML, TIME_EDIT_EMAILS_MODE: 'send', VERCEL_ENV: 'preview' }).action).toBe('log');
    expect(resolveTimeEditEmailPlan({ N8N_HTML_EMAIL_URL: HTML, TIME_EDIT_EMAILS_MODE: 'send' }).action).toBe('log');
  });

  it('sends only to the test address when one is set outside production', () => {
    const env = { N8N_HTML_EMAIL_URL: HTML, TIME_EDIT_EMAILS_MODE: 'send', TIME_EDIT_EMAILS_TEST_TO: 'qa@example.test' };
    expect(resolveTimeEditEmailPlan({ ...env, VERCEL_ENV: 'preview' })).toEqual({ action: 'send', testTo: 'qa@example.test' });
    expect(resolveTimeEditEmailPlan({ ...env })).toEqual({ action: 'send', testTo: 'qa@example.test' });
  });

  it('only logs when a test address is set in production, so real requesters are never left without an email', () => {
    const plan = resolveTimeEditEmailPlan({
      N8N_HTML_EMAIL_URL: HTML, TIME_EDIT_EMAILS_MODE: 'send', TIME_EDIT_EMAILS_TEST_TO: 'qa@example.test', VERCEL_ENV: 'production',
    });
    expect(plan.action).toBe('log');
  });

  it('never falls back to real recipients when the test address is malformed', () => {
    const plan = resolveTimeEditEmailPlan({
      N8N_HTML_EMAIL_URL: HTML, TIME_EDIT_EMAILS_MODE: 'send', TIME_EDIT_EMAILS_TEST_TO: 'oops', VERCEL_ENV: 'production',
    });
    expect(plan.action).toBe('log');
  });
});

describe('isValidEmailAddress', () => {
  it('accepts one plain address and rejects lists and junk', () => {
    expect(isValidEmailAddress(' a@example.test ')).toBe(true);
    expect(isValidEmailAddress('a@example.test, b@example.test')).toBe(false);
    expect(isValidEmailAddress('Name <a@example.test>')).toBe(false);
    expect(isValidEmailAddress('nope')).toBe(false);
    expect(isValidEmailAddress(null)).toBe(false);
  });
});

describe('timeEditEmailsReplaceDecided', () => {
  it('is true only when the new emails really send', () => {
    const send = { N8N_HTML_EMAIL_URL: HTML, TIME_EDIT_EMAILS_MODE: 'send', VERCEL_ENV: 'production' };
    expect(timeEditEmailsReplaceDecided(send)).toBe(true);
    expect(timeEditEmailsReplaceDecided({ ...send, TIME_EDIT_EMAILS_MODE: 'log' })).toBe(false);
    expect(timeEditEmailsReplaceDecided({ ...send, TIME_EDIT_EMAILS_MODE: 'off' })).toBe(false);
    expect(timeEditEmailsReplaceDecided({ ...send, N8N_HTML_EMAIL_URL: undefined })).toBe(false);
    expect(timeEditEmailsReplaceDecided({ ...send, VERCEL_ENV: 'preview' })).toBe(false);
  });
});

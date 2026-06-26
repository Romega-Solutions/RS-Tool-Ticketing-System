import { describe, it, expect } from 'vitest';
import { resolvePlaceholders } from '@/lib/email-templates';

const baseCtx = {
  name: 'Jane Dela Cruz',
  email: 'jane@romega-solutions.com',
  role: 'ic',
  team: 'Technical',
  loginLink: 'https://app.example.com/login',
  guideLink: 'https://app.example.com/guide',
};

describe('resolvePlaceholders — recipient details', () => {
  it('substitutes {{first_name}} (first token of name) in the subject', () => {
    const r = resolvePlaceholders({ subject: 'Welcome {{first_name}}', body: 'x' }, baseCtx);
    expect(r.subject).toBe('Welcome Jane');
  });

  it('substitutes {{name}}, {{email}}, {{role}} and {{team}} into the plain-text body', () => {
    const r = resolvePlaceholders(
      { subject: 's', body: '{{name}} <{{email}}> — {{role}} on {{team}}' },
      baseCtx,
    );
    expect(r.text).toBe('Jane Dela Cruz <jane@romega-solutions.com> — ic on Technical');
  });

  it('renders link tokens as raw URLs in text and anchors in html', () => {
    const r = resolvePlaceholders({ subject: 's', body: 'Sign in: {{login_link}} · Help: {{guide_link}}' }, baseCtx);
    expect(r.text).toContain('Sign in: https://app.example.com/login');
    expect(r.text).toContain('Help: https://app.example.com/guide');
    expect(r.html).toContain('<a href="https://app.example.com/login"');
    expect(r.html).toContain('<a href="https://app.example.com/guide"');
  });

  it('converts body newlines to <br> in the html version', () => {
    const r = resolvePlaceholders({ subject: 's', body: 'line one\nline two' }, baseCtx);
    expect(r.html).toContain('line one<br>line two');
    expect(r.text).toContain('line one\nline two');
  });
});

describe('resolvePlaceholders — safety & edge cases', () => {
  it('HTML-escapes recipient values so a hostile name cannot inject markup', () => {
    const r = resolvePlaceholders(
      { subject: 's', body: 'Hi {{name}}' },
      { ...baseCtx, name: '<script>alert(1)</script>' },
    );
    expect(r.html).toContain('&lt;script&gt;');
    expect(r.html).not.toContain('<script>');
  });

  it('resolves a missing name to empty strings (never "undefined" or a leftover token)', () => {
    const r = resolvePlaceholders(
      { subject: 'Hi {{first_name}}', body: 'Dear {{name}},' },
      { ...baseCtx, name: null },
    );
    expect(r.subject).toBe('Hi ');
    expect(r.text).toBe('Dear ,');
    expect(r.text).not.toContain('undefined');
    expect(r.text).not.toContain('{{');
  });

  it('leaves an unknown placeholder literal so a typo is visible in preview', () => {
    const r = resolvePlaceholders({ subject: 's', body: 'Hi {{frist_name}}' }, baseCtx);
    expect(r.text).toBe('Hi {{frist_name}}');
  });
});

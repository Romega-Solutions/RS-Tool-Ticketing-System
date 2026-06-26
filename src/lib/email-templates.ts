// Editable transactional email templates. v1 ships exactly one — the
// "account setup" email an admin sends to a newly-added user telling them to sign
// in with Google. The saved default lives in the `email_templates` table (one row
// per `key`); the admin can tweak subject/body per send and optionally save the
// tweak back as the new default. The app owns the template and resolves it; the
// n8n workflow behind N8N_ACCOUNT_SETUP_URL is a plain Gmail sender (see
// src/lib/n8n.ts → sendAccountSetupEmail).
//
// This module is intentionally PURE (no server imports) so the send dialog can
// import resolvePlaceholders for its live preview. The Supabase-backed default
// get/save accessors live in src/lib/email-templates-store.ts.

export const ACCOUNT_SETUP_KEY = 'account_setup';

// Built-in fallback used when the DB row is missing (fresh DB / pre-migration).
export const DEFAULT_ACCOUNT_SETUP = {
  subject: 'Your RS Ticketing System account is ready, {{first_name}}',
  body: `Hi {{first_name}},

An account has been created for you on the RS Ticketing System — Romega's internal workspace for tasks, attendance, and weekly reports.

Getting in takes one click:

1. Open the sign-in page: {{login_link}}
2. Choose "Continue with Google".
3. Use this exact email address: {{email}}

Your role and details are already set up, so you'll land straight in your workspace.

Need a hand? See the quick guide at {{guide_link}}, or just reply to this email.

— The Romega Solutions team`,
};

export type EmailTemplate = {
  subject: string;
  body: string;
  updatedAt: string | null;
  updatedBy: number | null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Placeholder resolution (pure — unit-tested in src/__tests__/email-templates.test.ts)
// ─────────────────────────────────────────────────────────────────────────────

export type TemplateContext = {
  name?: string | null;
  email?: string | null;
  role?: string | null;
  team?: string | null;
  loginLink: string;
  guideLink?: string | null;
};

export type ResolvedEmail = { subject: string; html: string; text: string };

type TokenValue = { type: 'text' | 'link'; value: string };

const TOKEN_RE = /\{\{(\w+)\}\}/g;

function firstName(name: string): string {
  const t = name.trim();
  return t ? t.split(/\s+/)[0] : '';
}

function buildValues(ctx: TemplateContext): Record<string, TokenValue> {
  const name = (ctx.name ?? '').trim();
  return {
    name:       { type: 'text', value: name },
    first_name: { type: 'text', value: firstName(name) },
    email:      { type: 'text', value: ctx.email ?? '' },
    role:       { type: 'text', value: ctx.role ?? '' },
    team:       { type: 'text', value: ctx.team ?? '' },
    login_link: { type: 'link', value: ctx.loginLink },
    guide_link: { type: 'link', value: ctx.guideLink ?? '' },
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Literal (non-token) body text → escaped HTML with line breaks preserved.
function literalHtml(s: string): string {
  return escapeHtml(s).replace(/\n/g, '<br>');
}

function anchorHtml(key: string, url: string): string {
  const weight = key === 'login_link' ? 'font-weight:600;' : '';
  return `<a href="${escapeHtml(url)}" style="color:#0a72cf;${weight}">${escapeHtml(url)}</a>`;
}

// Substitute known tokens with their raw value (links → raw URL). Unknown tokens
// are left literal so a typo stays visible in the live preview rather than
// silently vanishing. Used for the subject line and the plain-text body.
function toText(s: string, values: Record<string, TokenValue>): string {
  return s.replace(TOKEN_RE, (m, key: string) => (key in values ? values[key].value : m));
}

// HTML body: escape all literal text and text-type values (so a hostile name
// can't inject markup), turn link tokens into anchors, keep unknown tokens
// literal (escaped). Newlines in literal text become <br>.
function toHtmlBody(body: string, values: Record<string, TokenValue>): string {
  let out = '';
  let last = 0;
  let m: RegExpExecArray | null;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(body))) {
    out += literalHtml(body.slice(last, m.index));
    const key = m[1];
    const v = values[key];
    if (!v) out += escapeHtml(m[0]);
    else if (v.type === 'link') out += v.value ? anchorHtml(key, v.value) : '';
    else out += escapeHtml(v.value);
    last = m.index + m[0].length;
  }
  out += literalHtml(body.slice(last));
  return out;
}

function wrapHtml(inner: string): string {
  return (
    `<!doctype html><html><body style="margin:0;background:#f5f6f8;padding:24px 12px;` +
    `font-family:'Source Sans 3',Arial,Helvetica,sans-serif;color:#1f2a37">` +
    `<div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;` +
    `border-radius:12px;padding:28px 32px">` +
    `<div style="font-weight:700;font-size:18px;color:#0a72cf;margin-bottom:18px">Romega Solutions</div>` +
    `<div style="font-size:15px;line-height:1.6">${inner}</div>` +
    `</div></body></html>`
  );
}

export function resolvePlaceholders(
  template: { subject: string; body: string },
  ctx: TemplateContext,
): ResolvedEmail {
  const values = buildValues(ctx);
  return {
    subject: toText(template.subject, values),
    text: toText(template.body, values),
    html: wrapHtml(toHtmlBody(template.body, values)),
  };
}

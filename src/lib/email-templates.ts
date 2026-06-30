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

import { publicBaseUrl } from '@/lib/app-url';

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

// ─────────────────────────────────────────────────────────────────────────────
// Notification emails — the HTML/text rendered for every bell event the
// recipient has opted into (see src/lib/notifications.ts). One shared shell:
// brand header, a headline, an optional body line, an optional task-detail box
// (Title / Description / Priority / Due Date) and a SINGLE CTA button that deep
// links into the portal. Pure + unit-tested.
// ─────────────────────────────────────────────────────────────────────────────

export type NotificationTaskMeta = {
  title?:       string | null;
  description?: string | null;
  priority?:    string | null;
  dueDate?:     string | null;
};

const PRIORITY_LABEL: Record<string, string> = {
  urgent: 'Urgent', high: 'High', medium: 'Medium', low: 'Low', none: 'None',
};

function priorityLabel(p?: string | null): string {
  if (!p) return 'None';
  const k = p.toLowerCase();
  return PRIORITY_LABEL[k] ?? (p.charAt(0).toUpperCase() + p.slice(1));
}

function dueLabel(d?: string | null): string {
  if (!d) return 'No due date';
  // target_date is a 'YYYY-MM-DD' string; keep just the date part if a time slipped in.
  return String(d).slice(0, 10);
}

// Rich-text task descriptions are stored as HTML — flatten to readable text for
// the email (strip tags, collapse whitespace) then escape on render.
function stripToText(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function truncate(s: string, max = 280): string {
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

function ctaButton(url: string, label: string): string {
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 4px">` +
    `<tr><td style="border-radius:8px;background:#0a72cf">` +
    `<a href="${escapeHtml(url)}" style="display:inline-block;padding:11px 22px;` +
    `font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px">${escapeHtml(label)}</a>` +
    `</td></tr></table>`
  );
}

function detailRow(label: string, valueHtml: string): string {
  return (
    `<tr>` +
    `<td style="padding:6px 12px 6px 0;font-size:12px;font-weight:600;color:#4b5563;` +
    `vertical-align:top;white-space:nowrap">${escapeHtml(label)}</td>` +
    `<td style="padding:6px 0;font-size:14px;color:#1f2a37;vertical-align:top">${valueHtml}</td>` +
    `</tr>`
  );
}

// Absolute, externally-clickable deep link for the CTA (never localhost).
function actionHref(link?: string | null): string {
  const base = publicBaseUrl();
  if (!link) return base;
  return link.startsWith('/') ? `${base}${link}` : `${base}/${link}`;
}

export function renderNotificationEmail(input: {
  title:  string;
  body?:  string | null;
  link?:  string | null;
  task?:  NotificationTaskMeta | null;
}): ResolvedEmail {
  const actionUrl = actionHref(input.link);
  const title = input.title?.trim() || 'You have a new notification';
  const bodyLine = (input.body ?? '').trim();
  const task = input.task ?? null;
  const descText = task?.description ? truncate(stripToText(task.description)) : '';

  // ── HTML ──
  let inner =
    `<div style="font-size:17px;font-weight:700;color:#1f2a37;margin-bottom:8px">${escapeHtml(title)}</div>`;
  if (bodyLine) {
    inner += `<div style="font-size:14px;line-height:1.6;color:#374151">${literalHtml(bodyLine)}</div>`;
  }
  if (task) {
    let rows = detailRow('Title', escapeHtml(task.title?.trim() || title));
    if (descText) rows += detailRow('Description', literalHtml(descText));
    rows += detailRow('Priority', escapeHtml(priorityLabel(task.priority)));
    rows += detailRow('Due Date', escapeHtml(dueLabel(task.dueDate)));
    inner +=
      `<table role="presentation" cellpadding="0" cellspacing="0" ` +
      `style="width:100%;margin-top:16px;border:1px solid #e5e7eb;border-radius:10px;` +
      `border-collapse:separate;background:#f9fafb;padding:6px 14px">${rows}</table>`;
  }
  inner += ctaButton(actionUrl, 'Open in Romega Portal');

  // ── Plain text (fallback) ──
  const lines: string[] = [title];
  if (bodyLine) lines.push('', bodyLine);
  if (task) {
    lines.push('');
    lines.push(`Title: ${task.title?.trim() || title}`);
    if (descText) lines.push(`Description: ${descText}`);
    lines.push(`Priority: ${priorityLabel(task.priority)}`);
    lines.push(`Due Date: ${dueLabel(task.dueDate)}`);
  }
  lines.push('', `Open in Romega Portal: ${actionUrl}`, '', '— Romega Solutions');

  return { subject: title, html: wrapHtml(inner), text: lines.join('\n') };
}

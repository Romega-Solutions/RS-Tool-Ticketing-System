# Account-Setup Email for Admin-Added Users — Design

- **Date:** 2026-06-26
- **Status:** Draft (awaiting review)
- **Area:** User Management (`admin/users`), auth onboarding, n8n email

---

## Problem

When an admin adds a teammate in **User Management**, that person's account is
effectively ready — but they don't know it. They've never been told to open the
app and click **"Continue with Google."** So added users sit idle and ping the
admin asking "what do I do now?"

We want a one-click **"Send setup email"** from the Users table that emails the
added person friendly, editable instructions for getting into their already-provisioned
account via Google sign-in — sent through the existing n8n → Gmail pipeline.

## What already works (no code needed)

The "can an admin-added user actually log in with Google?" half is **already
true** today:

- The admin create flow (`POST /api/admin/users`, `src/app/api/admin/users/route.ts`)
  inserts a `public.users` row for the new email.
- The OAuth callback (`src/app/auth/callback/route.ts:50-56`) logs anyone in the
  instant a `public.users` row exists for their email; it only blocks brand-new
  emails that have **no** row and aren't in the org chart (the `not_allowed` error
  on `login` — `src/app/login/page.tsx:26`).
- `getSession()` matches purely by email (`src/lib/session.ts:32`).

So the only real dependency is that **the admin enters the user's actual Gmail**.
This feature does not change auth; it just *tells the user what to do*.

> **Verify (config, not code):** the Supabase project must allow a Google identity
> to attach to the email/password auth user the admin create flow makes for the
> same verified email (default Supabase behavior). Because `getSession()` joins by
> email, login still resolves even if a second auth identity is created, so this is
> low-risk — note it, don't block on it.

## Goals

1. A per-user **"Send setup email" / "Resend"** action in the Users table that is
   **always available**, regardless of whether a prior send is on record.
2. An **editable email template**: a saved org-wide default, tweakable per send,
   edited **inside the send dialog** (no separate settings screen).
3. Send via the established **n8n → Gmail** integration pattern (fire-and-forget,
   recorded, never blocks the UI).
4. A per-row **"Sent · <date>"** badge so admins can see who's been invited.
5. A **"Send setup email now"** checkbox in the Add-user form (create + invite in
   one step).

## Non-goals (YAGNI)

Multiple template variants, scheduled reminders / drip sequences, open/click
tracking, a rich WYSIWYG editor, a standalone template-settings page. Plain
subject + body with `{{placeholders}}` only.

---

## UX

### Send dialog (the one surface)

Opened by the per-row mail button. On open it `GET`s the saved default and shows:

- **Subject** input (editable) and **Body** textarea (editable), both with
  `{{placeholder}}` tokens.
- A **live preview** panel showing subject + body with this user's values
  substituted (their name, email, the login link) — preview only; the raw
  template is what's sent.
- A **"Save as default"** checkbox — when checked, the (tweaked) subject/body is
  persisted back as the new org-wide default after a successful send.
- A **"Send"** primary button and **Cancel**.

The dialog is both the send surface and the default-editor; "save as default"
folds editing into the same flow the user already opened.

### Users table

- New action button in the row actions cell of `src/components/user-management-table.tsx`
  (next to Edit / Remove), using a mail icon. Label: **"Send setup email"** when
  `setupEmailSentAt` is null, **"Resend"** when it's set. Always shown for active
  users.
- A small muted **"Sent · Jun 26"** badge near the user's name/email when
  `setupEmailSentAt` is set.

### Add-user form

- A **"Send setup email now"** checkbox (default off). On a successful create, the
  client chains a call to the send route for the new user's id. (Server `POST
  /api/admin/users` is unchanged; the orchestration is client-side so a failed
  email never rolls back a successful create.)

---

## Data model

New table — keep it generic so future editable emails reuse it:

```sql
-- drizzle/0008_email_templates.sql (hand-authored; see Migration section)
CREATE TABLE IF NOT EXISTS email_templates (
  key         text PRIMARY KEY,
  subject     text NOT NULL,
  body        text NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  integer REFERENCES users(id)
);

INSERT INTO email_templates (key, subject, body)
VALUES ('account_setup', '<default subject>', '<default body>')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE users ADD COLUMN IF NOT EXISTS setup_email_sent_at timestamptz;
```

Both `email_templates` and the new `users.setup_email_sent_at` column are **added
to `src/db/schema.ts`** as well — required so the `supabase-write-columns` guard
test recognizes the new write payloads (it skips unmodeled tables, so an
unmodeled column would otherwise slip through *and* an unmodeled write to a known
table would fail the test).

## Backend

### `src/lib/email-templates.ts` (new)

- `getAccountSetupTemplate()` → `{ subject, body, updatedAt, updatedBy }` (reads the
  `account_setup` row; falls back to a built-in constant default if the row is
  somehow missing).
- `saveAccountSetupTemplate({ subject, body, updatedBy })` → upserts the row.
- `resolvePlaceholders(template, ctx)` → **pure**, returns `{ subject, html, text }`.
  - Supported tokens: `{{name}}`, `{{first_name}}`, `{{email}}`, `{{role}}`,
    `{{team}}`, `{{login_link}}`, `{{guide_link}}`.
  - `text`: raw substitution of values into the body.
  - `html`: HTML-escape all literal text and text-type values (so an admin pasting
    `<` can't break layout / inject markup), convert newlines to `<br>`, and render
    link tokens (`login_link`, `guide_link`) as anchors — `login_link` as a styled
    button — inside a light branded shell (logo + button).
  - Missing/empty context values resolve to an empty string (no `undefined` leaks).
  - Exported for unit tests.

### `src/lib/n8n.ts` (extend)

Add, mirroring `notifyOnboardingWebhook` exactly (8s `AbortController`, never
throws, typed `{ ok } | { ok:false, error }`):

```ts
export async function sendAccountSetupEmail(msg: {
  to: string; subject: string; html: string; text: string;
}): Promise<{ ok: true } | { ok: false; error: string }>
```

- Posts JSON to **`N8N_ACCOUNT_SETUP_URL`** (new env var). Missing var → `ok:false`
  with a clear message.
- The n8n workflow is a **generic transactional sender** (Webhook → Gmail Send →
  Respond) taking `{ to, subject, html, text }`. Unlike the onboarding/ATS
  workflows, it does **not** own the template — the app does.

### Routes

`GET /api/admin/email-templates/account-setup` (new)
- `route()` + `requireAdmin()`. Returns the saved default for the dialog to load.
  (Top-level path, not nested under `users/`, to avoid sitting as a sibling of the
  `[id]` dynamic segment.)

`POST /api/admin/users/[id]/send-setup-email` (new)
- `route()` + `requireAdmin()` + `enforceRateLimit({ key: keyByUser('admin-setup-email', session.id), limit: 30, windowSeconds: 60 })`.
- Body: `{ subject: string; body: string; saveAsDefault?: boolean }` — the raw
  (possibly tweaked) template the dialog is sending. Server is authoritative for
  user PII: it loads the target user (`email`, `name`, `role`, `team`) from
  `public.users` by `[id]`.
- Builds links: `loginLink = ${base}/login`, `guideLink = ${base}/guide` where
  `base = (process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_BASE_URL || '').replace(/\/+$/, '')`.
  If `base` is empty → `400` with a clear "set APP_BASE_URL" message (an email link
  must be absolute).
- `resolvePlaceholders()` → `sendAccountSetupEmail()`.
- On success: set `users.setup_email_sent_at = now()`; if `saveAsDefault`, persist
  the template; `recordAudit({ action: 'user.setup_email_sent', actorId, targetUserId })`.
- On failure: return `ok:false` + error (no throw, no state change beyond nothing).

### `src/lib/audit.ts` (extend)

Add `'user.setup_email_sent'` to the `AuditAction` union and a `describeAudit`
case ("Sent a setup email").

### Reads that must include the new column

`users.setup_email_sent_at` must be added to the `select(...)` + mapped object in
both `src/app/api/admin/users/route.ts` (GET) and
`src/app/(app)/admin/users/page.tsx`, surfaced as `setupEmailSentAt` on the
client user type.

---

## Error handling

- n8n unreachable / `N8N_ACCOUNT_SETUP_URL` unset → `ok:false`, toast in the dialog,
  no `setup_email_sent_at` write. Never throws, never blocks.
- `APP_BASE_URL`/`NEXT_PUBLIC_BASE_URL` unset → `400` with explicit guidance.
- "Send now" at create failing → create still succeeds; a non-blocking toast tells
  the admin the invite email didn't go out and they can resend from the row.

## Testing

- `src/__tests__/email-templates.test.ts` (new) — `resolvePlaceholders`:
  substitution of every token, HTML-escaping of admin-supplied body and of
  text-type values, `login_link` rendered as an anchor not escaped, missing values
  → empty string, newline → `<br>`.
- Extend coverage so the existing `src/__tests__/supabase-write-columns.test.ts`
  guard passes for the new `email_templates` upsert and the `users.setup_email_sent_at`
  update (guaranteed by adding both to `schema.ts`).
- `npm run verify` (lint + build) + `npm test` before any PR.

## Migration (drift-safe)

Per the known `schema.ts` ↔ live-DB drift, **do not** run `drizzle-kit generate`.
Instead, following the established `drizzle/0005–0007` + `scripts/apply-migration.ts`
pattern:

1. Hand-author **`drizzle/0008_email_templates.sql`** (the DDL above: create table +
   seed row + `users` ALTER).
2. Add the `email_templates` `pgTable` and `users.setupEmailSentAt` to
   `src/db/schema.ts` (modeling only).
3. Apply to prod via `npx tsx scripts/apply-migration.ts` (direct DB connection;
   the pooler is dead for DDL).

Flagged **⚠ needs applying to prod** on ship, consistent with recent migrations.

## Rollout / env

> **Implementation note (2026-06-26):** rather than build a new workflow, this
> reuses the existing generic n8n sender **"OpenClaw - Send Email via Gmail"**
> (`/webhook/openclaw-send-email`, contract `{to, subject, body}` → plain-text
> Gmail). So `sendAccountSetupEmail` posts `{to, subject, body: resolved.text}`
> (the html branch of the resolver is unused by this transport). Migration 0008
> is applied to prod; a live test send returned HTTP 200.

- `N8N_ACCOUNT_SETUP_URL` is set in `.env.example` + local `.env` to the OpenClaw
  webhook. **Still needs setting in Vercel prod.**
- Confirm `APP_BASE_URL` (or `NEXT_PUBLIC_BASE_URL`) is set in **Vercel prod** to
  `https://rs-tool-ticketing-system.vercel.app` so email links are absolute (local
  is localhost, which would ship broken links in a real email).

## Default template (seed copy — editable in-app)

**Subject:** `Your RS Ticketing System account is ready, {{first_name}}`

**Body:**
```
Hi {{first_name}},

An account has been created for you on the RS Ticketing System — Romega's
internal workspace for tasks, attendance, and weekly reports.

Getting in takes one click:

1. Open the sign-in page: {{login_link}}
2. Choose "Continue with Google".
3. Use this exact email address: {{email}}

Your role and details are already set up, so you'll land straight in your
workspace.

Need a hand? See the quick guide at {{guide_link}}, or just reply to this email.

— The Romega Solutions team
```

## File-by-file change list

| File | Change |
|------|--------|
| `drizzle/0008_email_templates.sql` | **new** — table + seed + `users` ALTER |
| `src/db/schema.ts` | add `email_templates` table + `users.setup_email_sent_at` |
| `src/lib/email-templates.ts` | **new** — get/save default + pure `resolvePlaceholders` |
| `src/lib/n8n.ts` | add `sendAccountSetupEmail` + `N8N_ACCOUNT_SETUP_URL` |
| `src/lib/audit.ts` | add `user.setup_email_sent` action + describe case |
| `src/app/api/admin/email-templates/account-setup/route.ts` | **new** — GET default |
| `src/app/api/admin/users/[id]/send-setup-email/route.ts` | **new** — POST send |
| `src/app/api/admin/users/route.ts` | select + map `setup_email_sent_at` (GET) |
| `src/app/(app)/admin/users/page.tsx` | select + map `setup_email_sent_at` |
| `src/components/user-management-table.tsx` | row action button, badge, dialog wiring, create "send now" chaining |
| `src/components/send-setup-email-dialog.tsx` | **new** — the dialog |
| `src/__tests__/email-templates.test.ts` | **new** — resolver tests |
| `.env.example` | document `N8N_ACCOUNT_SETUP_URL` |
| (external) n8n | **new** "Account Setup Email" generic Gmail-sender workflow |

# Internal Onboarding — Build Plan

> Operational spec for migrating the manual Romega Solutions onboarding SOP (Gmail + Shared Drive + Google Forms + a Sheet "Onboarding Tracker") onto the in-house app at `/onboarders` plus the existing self-hosted n8n.
>
> Source: *Romega Solutions Onboarding Process for Independent Contractors and Interns* (HR team, 2026).
> Owners: HR team / Onboarding Lead (process), Chief of Staff (SOW + domain provisioning), Engineering (implementation), n8n admin (workflow deploy).

---

## 1. Goal & Success Criteria

**Goal.** Replace the manual Gmail-and-Sheet onboarding SOP — for both independent contractors and interns — with the `/onboarders` module in this app, backed by Supabase + n8n. Keep every step, email and checklist item in the HR SOP. Today the `/onboarders` page is a static scaffold (`src/app/(app)/onboarders/page.tsx`) — it shows stages and an n8n workflow registry but has no rows, no actions, no tracker.

**Success criteria.**
- The HR-team "Onboarding Tracker" Sheet is no longer the source of truth. The `onboarders` table in Supabase is.
- An onboarder row is auto-created the moment a `candidates.status` flips to `hired` (no copy-paste from the ATS).
- Every email called out in the SOP (HRBP first-touch, background check ask, reference check, employment verification, contractor welcome, intern welcome, Gmail-setup nudge, group-chat announcement, Day-1 reminder) is a templated n8n workflow fired by a status change or a button click — not typed by hand.
- Both Google Forms ("Onboarding Form" and "Intern Onboarding Form") are replaced by in-app forms that write directly to Supabase, with file uploads going to a private Supabase Storage bucket.
- The Day-1 checklist (Teams, Romega Gmail, signature, Jibble, Wise, group chats) is a structured list on the onboarder record, not a free-text column.
- An onboarder progresses through the 7 happy-path stages already scaffolded in `src/app/(app)/onboarders/page.tsx`, with two terminal-fail states (`failed_probation`, `withdrew`).
- Every status transition, every email send, every uploaded document is written to an `onboarder_history` audit log.

**Non-goals (v1).**
- Single sign-on or SCIM provisioning to Google Workspace / MS Teams / Jibble / Wise. The Onboarding Lead still clicks through those tools. The app reminds them and tracks completion; it doesn't drive the third-party APIs.
- Background check via a paid provider (CheckPH etc). v1 stays DIY — gov-ID uploads, NBI scan, manual reference replies.
- E-signature on the SOW or NDA. SOW is delivered out-of-band (HRBP composes in Gmail). The app records that it was sent and signed.
- Slack notifications. The SOP is MS Teams based; we can revisit once Teams API access is available.
- A "candidate self-service portal" for onboarding. Onboarders log in to the app to fill the form and view their checklist — they do not see other onboarders.

---

## 2. SOP-to-Stage Mapping

The SOP's 11 numbered steps collapse into the 7 stages already declared in `src/app/(app)/onboarders/page.tsx:28-36`. The mapping is below — *no new stages are needed*, but each stage gains substages (checklist items) so the tracker matches what HR uses today.

| SOP step | Stage | What runs at this stage |
|---|---|---|
| 1. CEO/CoS requests SOW from HRBP | `offer_signed` | Manual outside the app (Gmail). Onboarder row is **created here** when CoS clicks "Start onboarding" on a `hired` candidate, or auto-created by ATS promotion (§9). |
| 2. HRBP sends SOW to new hire | `offer_signed` | n8n workflow `onboarding-sow-followup` sends a reminder if the SOW is unsigned after 48h. Signature is recorded by the Onboarding Lead clicking "Mark SOW signed" on the onboarder row. |
| 3. Background check email — character refs + employment verification asks | `background_check` | n8n workflow `bg-check-initiate` (existing env key reused). The onboarder receives the SOP email body verbatim. |
| 4. Reference check + employment verification emails | `background_check` | n8n workflow `reference-request` (existing env key reused) — one email per referee. Plus a parallel n8n workflow `employment-verification-request` sent to each prior-HR contact. Both pull from child tables on the onboarder row (§3). |
| 5. Official onboarding email (contractor / intern variants) | `pre_onboarding` | n8n workflow `onboarding-welcome` with two templates keyed on `onboarder_type` (`contractor` \| `intern`). |
| 6. Gmail + signature creation nudge | `pre_onboarding` | n8n workflow `gmail-signature-nudge` — body again splits on `onboarder_type`. Onboarding Lead marks the Romega email created in-app. |
| 7. Onboarding Tracker + group-chat announcement | `pre_onboarding` | "Announce new hire" button → n8n workflow `group-chat-announce` builds the message body and posts it (or returns text for the Lead to paste manually). Tracker row is the onboarder record itself — automatic. |
| 8. Day-1 account/tool setup | `day_one` | Day-1 checklist (Teams added, Gmail working, Jibble account, Wise account, group chats joined, signature configured) on the onboarder record. Toggling all items to ✅ advances the stage. |
| 9. Pre-onboarding checklist (before Day 1) | covered in `pre_onboarding`'s substages | Same checklist surface as §8; just gated to "must-be-done-before-Day-1". |
| 10. Key reminders for new hires | shown to the onboarder when they log in | A `welcome-banner` on `/my-tasks` for users with `is_onboarding = true`, with the four reminders (profile photo, camera on, dress code, ask questions). |
| 11. Formal orientation → handoff | `day_one → thirty_day` | The Onboarding Lead schedules orientation via Google Calendar (existing `N8N_DAY1_CALENDAR_URL`). On completion, marks the onboarder "Orientation done" → triggers `N8N_30DAY_CHECKIN_URL` 30 days later via a scheduled n8n sweep. |

The existing 30-day / 90-day / regularized stages are not in the SOP but are kept — they're standard probation milestones for the Onboarding Lead's tracker.

---

## 3. Database Changes

New migration: `docs/migrations/add-onboarders-tables.sql`. Schema below follows the pattern in `add-candidates-table.sql` and `add-ats-history-and-positions.sql` (Supabase Postgres, `snake_case`, `created_at` / `updated_at` timestamps, integer FKs, RLS off — the Next.js API layer enforces auth).

```sql
-- ============================================================
-- 1. onboarders — one row per new hire being onboarded
-- ============================================================
CREATE TABLE IF NOT EXISTS onboarders (
  id                BIGSERIAL PRIMARY KEY,
  candidate_id      BIGINT REFERENCES candidates(id) ON DELETE SET NULL,
  user_id           BIGINT REFERENCES users(id)      ON DELETE SET NULL,

  full_name         TEXT NOT NULL,
  personal_email    TEXT NOT NULL,
  romega_email      TEXT,                                   -- set in pre_onboarding
  phone             TEXT,

  onboarder_type    TEXT NOT NULL CHECK (onboarder_type IN ('contractor', 'intern')),
  role_title        TEXT,                                   -- "Frontend Engineer"
  team              TEXT,                                   -- normalized via orgchart teams
  direct_supervisor TEXT,
  chief_of_staff    TEXT,
  onboarding_lead   TEXT,
  hrbp              TEXT,

  status            TEXT NOT NULL DEFAULT 'offer_signed'
                    CHECK (status IN (
                      'offer_signed','background_check','pre_onboarding','day_one',
                      'thirty_day','ninety_day','regularized',
                      'failed_probation','withdrew'
                    )),

  -- SOW
  sow_sent_at       TIMESTAMPTZ,
  sow_signed_at     TIMESTAMPTZ,

  -- W-8 / forms
  onboarding_form_submitted_at TIMESTAMPTZ,
  w8_uploaded_at               TIMESTAMPTZ,
  wise_details_submitted_at    TIMESTAMPTZ,

  -- Day-1 checklist (booleans → boolean; complex states → table below)
  teams_installed_at     TIMESTAMPTZ,
  gmail_created_at       TIMESTAMPTZ,
  signature_set_at       TIMESTAMPTZ,
  jibble_invited_at      TIMESTAMPTZ,
  wise_setup_at          TIMESTAMPTZ,
  group_chats_joined_at  TIMESTAMPTZ,
  orientation_done_at    TIMESTAMPTZ,

  start_date        DATE,                                   -- "Day 1" — drives reminders
  notes             TEXT,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by        BIGINT REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_onboarders_status     ON onboarders(status);
CREATE INDEX IF NOT EXISTS idx_onboarders_start_date ON onboarders(start_date);

-- ============================================================
-- 2. onboarder_references — character references (3+ per onboarder)
-- ============================================================
CREATE TABLE IF NOT EXISTS onboarder_references (
  id              BIGSERIAL PRIMARY KEY,
  onboarder_id    BIGINT NOT NULL REFERENCES onboarders(id) ON DELETE CASCADE,

  referee_name    TEXT NOT NULL,
  referee_role    TEXT,
  referee_company TEXT,
  relationship    TEXT,
  dates_worked    TEXT,
  email           TEXT NOT NULL,
  mobile          TEXT,
  best_time       TEXT,

  request_sent_at TIMESTAMPTZ,
  responded_at    TIMESTAMPTZ,
  response_path   TEXT,                                     -- Supabase Storage path to PDF
  outcome         TEXT CHECK (outcome IN ('positive','neutral','concerns','no_response')),

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 3. onboarder_employment_verifications — prior-HR contacts
-- ============================================================
CREATE TABLE IF NOT EXISTS onboarder_employment_verifications (
  id              BIGSERIAL PRIMARY KEY,
  onboarder_id    BIGINT NOT NULL REFERENCES onboarders(id) ON DELETE CASCADE,

  company         TEXT NOT NULL,
  hr_contact_name TEXT,
  hr_email        TEXT NOT NULL,
  hr_phone        TEXT,
  best_time       TEXT,

  request_sent_at TIMESTAMPTZ,
  responded_at    TIMESTAMPTZ,
  response_path   TEXT,
  outcome         TEXT CHECK (outcome IN ('verified','partial','no_response','discrepancy')),

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 4. onboarder_documents — gov IDs, NBI, W-8, contracts, etc.
-- ============================================================
CREATE TABLE IF NOT EXISTS onboarder_documents (
  id              BIGSERIAL PRIMARY KEY,
  onboarder_id    BIGINT NOT NULL REFERENCES onboarders(id) ON DELETE CASCADE,

  kind            TEXT NOT NULL CHECK (kind IN (
                    'sow','w8','nda','contract','gov_id','nbi',
                    'reference_response','employment_verification',
                    'other'
                  )),
  label           TEXT,
  storage_path    TEXT NOT NULL,
  mime_type       TEXT,
  size_bytes      BIGINT,

  uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  uploaded_by     BIGINT REFERENCES users(id) ON DELETE SET NULL
);

-- ============================================================
-- 5. onboarder_history — audit log (mirrors candidate_history)
-- ============================================================
CREATE TABLE IF NOT EXISTS onboarder_history (
  id              BIGSERIAL PRIMARY KEY,
  onboarder_id    BIGINT NOT NULL REFERENCES onboarders(id) ON DELETE CASCADE,

  user_id         BIGINT REFERENCES users(id) ON DELETE SET NULL,
  user_name       TEXT NOT NULL,                            -- denormalized for log readability
  field           TEXT NOT NULL,                            -- 'status' | 'email_sent' | 'document_uploaded' | ...
  from_value      TEXT,
  to_value        TEXT,
  summary         TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_onboarder_history_onboarder ON onboarder_history(onboarder_id, created_at DESC);

-- ============================================================
-- 6. users — flag for in-app onboarding banner
-- ============================================================
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_onboarding BOOLEAN NOT NULL DEFAULT FALSE;
```

A Supabase Storage bucket `onboarder-docs` (private) is created via the dashboard or with the same `INSERT INTO storage.buckets` pattern used in `RECRUITMENT_AI_AGENT_BUILD_PLAN.md:111-113`.

---

## 4. Document Storage

**Bucket.** `onboarder-docs` — private, signed URLs only.

**Path scheme.** `onboarders/{onboarderId}/{kind}/{slugified-label-or-timestamp}.{ext}`.
Examples:
- `onboarders/14/w8/w8-form-2026-05-22.pdf`
- `onboarders/14/gov_id/sss-id.jpg`
- `onboarders/14/reference_response/maria-cruz.pdf`

**Helper.** Extend `src/lib/storage.ts` with `uploadOnboarderDocument({ onboarderId, kind, file, label? })` — same shape as `uploadResumeToStorage` from the recruitment plan (`RECRUITMENT_AI_AGENT_BUILD_PLAN.md:117-150`). Returns `{ path, signedUrl }` and inserts an `onboarder_documents` row in the same server action.

---

## 5. n8n Workflows

Each workflow ships as a JSON file under `n8n/`, imported into the self-hosted n8n manually. Webhook URLs go in `.env` under keys already declared in `src/app/(app)/onboarders/page.tsx:55-105`. **Re-using** the existing scaffold's env keys (`N8N_BG_CHECK_INITIATE_URL`, `N8N_REFERENCE_REQUEST_URL`, `N8N_ONBOARDING_PACK_URL`, `N8N_EQUIPMENT_REQUEST_URL`, `N8N_DAY1_CALENDAR_URL`, `N8N_30DAY_CHECKIN_URL`, `N8N_90DAY_REVIEW_URL`) and adding the three new ones the SOP mandates:

| New env key | Workflow file | Fires on |
|---|---|---|
| `N8N_ONBOARDING_WELCOME_URL` | `Romega Onboarding — Welcome Email.json` | Manual button or status → `pre_onboarding` |
| `N8N_GMAIL_SIGNATURE_NUDGE_URL` | `Romega Onboarding — Gmail Setup Nudge.json` | After welcome email or manual |
| `N8N_EMPLOYMENT_VERIFICATION_URL` | `Romega Onboarding — Employment Verification.json` | Per-row "Send" button in the Employment Verification table |
| `N8N_GROUP_CHAT_ANNOUNCE_URL` | `Romega Onboarding — Group-chat Announcement.json` | Manual "Announce new hire" button |
| `N8N_SOW_REMINDER_URL` | `Romega Onboarding — SOW Follow-up.json` | Cron: SOW sent >48h ago, not signed |

### 5a. Communication webhook contract

Every workflow accepts the same shape (mirroring the ATS communication webhook):

```json
{
  "onboarderId": 42,
  "event":       "status_changed" | "manual_resend" | "scheduled_sweep",
  "template":    "welcome-contractor" | "welcome-intern" | "bg-check-initiate" | ...,
  "context":     { /* arbitrary template variables, see §6 */ }
}
```

Each workflow ends with:
1. Gmail send via the existing Gmail credential in n8n (sender: `onboarding@romega-solutions.com`, or whichever account the Onboarding Lead is using).
2. Supabase `INSERT INTO onboarder_history (...)` with `field='email_sent'`, `summary='Sent <template> to <recipient>'`.
3. Respond `{ success: true, template }` to the webhook caller.

### 5b. Unresponsive / SOW reminder cron (`Romega Onboarding — Sweeps.json`)

Schedule: daily 08:00 PHT. Two queries:

1. **SOW unsigned >48h:** rows where `sow_sent_at < now() - interval '48 hours' AND sow_signed_at IS NULL`. Send `sow-reminder` once per row; mark `sow_reminder_sent_at` to avoid duplicates (new column added by the migration in §3, or store in `onboarder_history` as the dedup signal).
2. **Reference / employment-verification non-response >48h:** rows in `onboarder_references` or `onboarder_employment_verifications` with `request_sent_at < now() - interval '48 hours' AND responded_at IS NULL`. Send a polite nudge once per referee.

---

## 6. Backend Wiring

### 6a. Route group

New route group `src/app/(app)/onboarders/`:

```
onboarders/
  page.tsx                  ← already exists — refactored to list onboarders, not just docs
  [id]/
    page.tsx                ← detail view (stages, checklists, references, documents)
    actions.ts              ← server actions for transitions, uploads, email sends
  new/
    page.tsx                ← manual create form (when ATS promotion is bypassed)
  actions.ts                ← list-level actions (create, bulk announce)
```

### 6b. Server actions (`src/app/(app)/onboarders/[id]/actions.ts`)

```ts
'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { notifyOnboardingWebhook, type OnboardingEvent } from '@/lib/n8n';
import { uploadOnboarderDocument } from '@/lib/storage';

const ALLOWED_STATUSES = [
  'offer_signed','background_check','pre_onboarding','day_one',
  'thirty_day','ninety_day','regularized','failed_probation','withdrew',
] as const;

// Status transitions that automatically fire a template
const AUTO_EMAIL_STATUSES: Partial<Record<typeof ALLOWED_STATUSES[number], string>> = {
  background_check: 'bg-check-initiate',
  pre_onboarding:   'welcome',          // template forks contractor/intern in n8n
  day_one:          'day-one-checklist',
};

export async function updateOnboarderStatus(id: number, status: string) { /* ... */ }
export async function markSowSigned(id: number)                          { /* ... */ }
export async function addReference(id: number, fd: FormData)             { /* ... */ }
export async function sendReferenceRequest(refId: number)                { /* ... */ }
export async function addEmploymentVerification(id: number, fd: FormData){ /* ... */ }
export async function sendEmploymentVerification(vId: number)            { /* ... */ }
export async function uploadDocument(id: number, fd: FormData)           { /* ... */ }
export async function toggleChecklistItem(id: number, key: ChecklistKey) { /* ... */ }
export async function announceNewHire(id: number)                        { /* ... */ }
```

Each action:
1. Verifies the caller is an Onboarding Lead, HRBP, admin, or CEO (`session.role` allow-list).
2. Performs the DB write.
3. Writes an `onboarder_history` row (`user_name`, `field`, `from_value`, `to_value`, `summary`).
4. Optionally calls `notifyOnboardingWebhook(event)` — fire-and-forget but result is recorded; same idempotency model as the ATS plan (`RECRUITMENT_AI_AGENT_BUILD_PLAN.md:223-232`).

### 6c. `src/lib/n8n.ts` extensions

```ts
export type OnboardingTemplate =
  | 'sow-reminder' | 'bg-check-initiate'
  | 'reference-request' | 'employment-verification'
  | 'welcome-contractor' | 'welcome-intern'
  | 'gmail-signature-nudge' | 'group-chat-announce'
  | 'day-one-checklist' | '30-day-checkin' | '90-day-review';

export type OnboardingEvent = {
  onboarderId: number;
  event:       'status_changed' | 'manual_send' | 'scheduled_sweep';
  template:    OnboardingTemplate;
  context?:    Record<string, unknown>;
};

export async function notifyOnboardingWebhook(event: OnboardingEvent):
  Promise<{ ok: true; template?: string } | { ok: false; error: string }> { /* mirror ATS */ }
```

Each template resolves to a specific env var (`N8N_BG_CHECK_INITIATE_URL`, etc.). A small map in `src/lib/n8n.ts` keeps that table.

---

## 7. Forms (replacing Google Forms)

Two in-app forms replace the SOP's two Google Forms. Both are accessible to the onboarder once HRBP creates their `users` row (`is_onboarding = true`) — they live under `/onboarding/intake` and `/onboarding/intern-intake` (outside the `(app)` group? No — onboarders are signed in users, so they live inside `(app)` but have a stripped-down layout).

### 7a. Contractor Onboarding Form — `src/app/(app)/my-tasks/onboarding-intake/page.tsx`

Fields (mirroring the SOP form fields):
- Personal: legal full name, preferred name, personal email, phone, mailing address, date of birth.
- Tax / Compliance: country of residence, tax ID, **W-8 PDF upload** (required for non-US contractors).
- Banking: Wise account holder name, Wise email, currency, payout cadence preference.
- Emergency contact: name, relationship, phone.
- Consent: "I agree to the Romega Independent Contractor Agreement" checkbox.

On submit:
- Write to `onboarders` (`onboarding_form_submitted_at`, `wise_details_submitted_at`, `w8_uploaded_at` if file present).
- Upload W-8 via `uploadOnboarderDocument({ kind: 'w8' })`.
- Append `onboarder_history` row.
- Email the Onboarding Lead (n8n `onboarding-form-submitted`) so they don't have to poll.

### 7b. Intern Onboarding Form — `src/app/(app)/my-tasks/onboarding-intern-intake/page.tsx`

Same as 7a minus W-8 (interns are usually domestic / unpaid stipends). Adds:
- School / program, expected start and end date, supervising professor.

### 7c. Form gating

`src/proxy.ts` doesn't need a change — the user is already authenticated; the form is just another `(app)` route. The form *self-hides* once `onboarding_form_submitted_at` is set and shows a "Submitted on …" panel instead, with the ability to re-upload W-8 if it was rejected.

---

## 8. UI Updates

The existing scaffolded page (`src/app/(app)/onboarders/page.tsx`) becomes a **list view** + **stage funnel summary**. The static "Setup required" callout, the workflow registry, and the open-questions card move to a new `/onboarders/setup` admin-only page so the operational list isn't cluttered.

### 8a. `/onboarders` (list)

- Top: 4 stat cards already drafted (`Active onboarders`, `Awaiting BG check`, `Day-1 this week`, `Workflows configured`) — wire to real counts via `count()` aggregates on `onboarders`.
- Kanban board grouped by `status`, columns ordered by the 7 happy-path stages, with the two terminal-fail columns collapsed to the right.
- Each card: onboarder name, `onboarder_type` chip (contractor / intern), team, start date, and small icons showing checklist progress (e.g. `3/7 day-1 items done`).
- "+ New onboarder" button → `/onboarders/new`.
- Filter chips: type, team, status. Search box on name / email.

### 8b. `/onboarders/[id]` (detail)

Tabs across the top:

1. **Overview** — stage, key dates, supervisor / lead / HRBP, quick actions (Mark SOW signed, Advance stage, Send welcome email, Announce new hire). Right rail: `onboarder_history` timeline.
2. **Background check** — references table + employment verification table. Each row has "Send", "View response" (signed URL to PDF), and "Mark complete" actions.
3. **Documents** — table of `onboarder_documents` grouped by `kind`; per-row signed URL download + replace; upload affordance per kind.
4. **Day-1 checklist** — the seven `*_at` columns rendered as checkboxes (`teams_installed_at`, `gmail_created_at`, etc.). All seven checked → status auto-advances to `thirty_day`.
5. **Notes** — free-text editable.

### 8c. Sidebar gating

`src/components/app-sidebar.tsx` (and `src/lib/rbac.ts`'s `canAccessLeadTool('onboarding', …)`) already gate `/onboarders` to `lead | admin | ceo`. No change needed. Onboarders themselves do *not* see `/onboarders` — they only see `/my-tasks` with the welcome banner and the intake form link.

### 8d. Onboarder-facing surfaces

- `/my-tasks` welcome banner — shown while `users.is_onboarding = true`. Bullets the SOP's "Key Reminders" (profile photo, camera on, dress code, ask questions).
- `/my-tasks/onboarding-intake` / `…intern-intake` — the two forms.
- Once `users.is_onboarding` flips to `false` (when status hits `regularized`), the banner disappears.

---

## 9. Promotion from ATS

The SOP's step 1 ("CEO/CoS requests SOW") happens *before* the candidate is recorded in our ATS, but in our flow the candidate is already in `candidates` and just flipped to `hired`. We **bridge** the SOP step 1 by:

- When `candidates.status` transitions to `hired` (in `src/app/(app)/recruiting/candidates/actions.ts`), call a new helper `createOnboarderFromCandidate(candidateId)`:
  1. Pulls candidate row + position.
  2. Inserts an `onboarders` row with `candidate_id`, `full_name`, `personal_email`, `phone`, `role_title = position.job_title`, `team = position.team`, `onboarder_type = 'contractor'` (default — Onboarding Lead can flip to `'intern'` on the detail page), `status = 'offer_signed'`, `start_date = NULL` (Onboarding Lead fills in).
  3. Inserts an `onboarder_history` row with `summary = 'Created from ATS hire'`.
  4. Returns the new onboarder ID. The Onboarding Lead is notified via the existing recruitment communication webhook (a new template `hr-onboarding-ping` from `RECRUITMENT_AI_AGENT_BUILD_PLAN.md:44`).

- If the candidate was hired *before* this feature shipped, an admin-only "Backfill onboarder" button on the candidate detail page calls the same helper.

This satisfies the SOP non-goal `RECRUITMENT_AI_AGENT_BUILD_PLAN.md:25` ("Onboarding kickoff automation on `hired`") — that line gets removed from the recruitment plan once this lands.

---

## 10. Email Templates (verbatim from SOP)

Stored in n8n Set nodes. Variables substituted by n8n: `{{firstName}}`, `{{fullName}}`, `{{onboardingLead}}`, `{{chiefOfStaff}}`, `{{directSupervisor}}`, `{{roleTitle}}`, `{{personalEmail}}`, `{{romegaEmail}}`, `{{startDate}}`, etc.

### 10.1 `bg-check-initiate` — SOP §3

> **Subject:** Employment Verification and Reference Check | Romega Solutions
>
> Hi {{firstName}}!
>
> Congratulations on your offer! To complete our pre-onboarding process, please send the following information within 48 business hours:
>
> **1. Professional Character References (3 required)**
> *Who to provide:* former immediate supervisor (preferred); a work colleague or cross-functional partner; for students or recent graduates, a professor or instructor.
> *What to include for each referee:* full name, role and company/institution, relationship to you and dates worked/studied together, email address, mobile number and best time to contact.
>
> **2. Employment Verification Contacts**
> Please provide the official HR department contact for each previous employer: company, HR contact email, HR contact phone, best time to contact.
>
> Please ask each referee for permission before sharing their details with Romega. Let them know we may contact them by email or SMS.
>
> *Our process:* After we receive your referee list, we will notify them by email and SMS within 24 business hours. Each referee will have 48 business hours to complete the reference form. We will keep you updated on progress and any follow-ups needed.
>
> We will contact HR for factual verification and your references for performance feedback separately. If a referee becomes unavailable, kindly send an alternate so we can stay on track.
>
> Cheers,
> {{onboardingLead}}

### 10.2 `reference-request` — SOP §4 (character references)

> **Subject:** Reference Check for {{fullName}} | Romega Solutions
>
> Hi {{refereeName}},
>
> {{fullName}} listed you as a reference for the {{roleTitle}} at Romega Solutions and has given permission for us to contact you. We'd be grateful for your feedback.
>
> If possible, please respond within 48 business hours, as delays may affect the candidate's onboarding application. Your feedback will be kept confidential and used only for hiring purposes.
>
> *File format:* Please save your responses as a PDF (not Word) and attach it to your reply. PDF helps preserve formatting and reduce accidental edits.
>
> Thank you in advance for your help.
>
> Cheers,
> {{onboardingLead}}
>
> *[Attached: Background Check File]*

### 10.3 `employment-verification` — SOP §4 (prior HR)

> **Subject:** Employment Verification Request for {{fullName}} | Romega Solutions
>
> Hi {{hrContactNameOrDept}},
>
> {{fullName}} listed your company for the employment verification process for the {{roleTitle}} and they have given permission for this verification. We'd be grateful for your feedback.
>
> If possible, please respond within 48 business hours, as delays may affect the candidate's onboarding application. Your verification will be kept confidential and used only for hiring purposes.
>
> *File format:* Please save your responses as a PDF (not Word) and attach it to your reply.
>
> Thank you in advance for your assistance.
>
> Cheers,
> {{onboardingLead}}
>
> *[Attached: Employment Verification File]*

### 10.4 `welcome-contractor` — SOP §5

> **Subject:** Welcome to the Team — Onboarding Information
>
> Hi {{firstName}},
>
> We're thrilled to have you join the team. Welcome aboard! To kick off your onboarding, here are the next steps:
>
> 1. **Download Microsoft Teams.** Please install the Microsoft Teams app (desktop or mobile) so we can add you to our group chat and begin team communications.
> 2. **Add us on Teams.** Once installed, kindly add the following contacts: {{chiefOfStaff}}, {{onboardingLead}}, {{directSupervisor}}. Once you've added us, send a quick message so we can begin your onboarding process.
> 3. **Fill out the Onboarding Form.** Please complete this form: {{onboardingFormLink}}
> 4. **W-8 Form (for Compliance).** Attached are two files: a blank W-8 form and a sample filled form for reference. Please review the sample carefully, fill out the required sections, and upload the completed W-8 through the onboarding form link above.
>
> If anything is unclear or you need assistance, feel free to reach out. Looking forward to working with you!
>
> Best regards,
> {{onboardingLead}}
> *[Official email signature]*

### 10.5 `welcome-intern` — SOP §5

> **Subject:** Welcome to the Team — Onboarding Information
>
> Hi {{firstName}},
>
> We're excited to have you on board. Welcome to the team! Here are your next steps to get started:
>
> 1. **Download Microsoft Teams** so we can add you to our group chat.
> 2. **Add us on Teams:** {{chiefOfStaff}}, {{onboardingLead}}, {{directSupervisor}}.
> 3. **Send us a quick message** once you're connected so we can initiate your onboarding process.
> 4. **Complete the Intern Onboarding Form:** {{internOnboardingFormLink}}
>
> Once you've downloaded Teams, we'll move forward with setting up your email account. If you have any questions, feel free to reach out.
>
> Looking forward to working with you!
>
> Best regards,
> {{onboardingLead}}
> *[Official email signature]*

### 10.6 `gmail-signature-nudge` (contractor) — SOP §6

> For the next step of your onboarding, please create a Gmail account to serve as your official Romega work email. Make sure the account is fully set up and functioning properly.
>
> Use the following format: `[FirstName]@romega-solutions.com` — e.g. `john@romega-solutions.com`.
>
> Once done, just shoot me a message with the email address.

### 10.7 `gmail-signature-nudge` (intern) — SOP §6

> For the next step, please create a Gmail account to serve as your official Romega work email. Make sure the account is fully set up and functioning properly.
>
> Use the following format: `[FirstInitial][FullLastName].romegasolutions@gmail.com` — e.g. John Smith → `jsmith.romegasolutions@gmail.com`.
>
> Once it's done, just shoot me a message with the email address!
>
> Once complete, please create your personal Romega email signature here: https://romega-email-signature.vercel.app/

### 10.8 `group-chat-announce` — SOP §7

> 👋 Team, please welcome our newest {{onboarderTypeLabel}}, **{{fullName}}** ({{roleTitle}}, {{team}}). They're starting on {{startDate}}. {{directSupervisor}} will be their direct supervisor. Welcome to Romega, {{firstName}}! 🎉

### 10.9 `sow-reminder` — internal, SOW unsigned >48h

Sent to the HRBP (not the new hire), reminding them to chase the signature.

### 10.10 `30-day-checkin` and `90-day-review`

Re-uses the existing `N8N_30DAY_CHECKIN_URL` / `N8N_90DAY_REVIEW_URL` workflows (already in the scaffold). Bodies still TBD — out of scope for v1, but the env keys and webhook contract are unchanged.

---

## 11. Pre-Onboarding Checklist (SOP §9)

A read-only callout on `/onboarders/[id]` that **derives** from data already in the row:

- Onboarding Form Completion → `onboarders.onboarding_form_submitted_at IS NOT NULL`
- Wise details → `onboarders.wise_details_submitted_at IS NOT NULL`
- Attendance / Day-1 login → set when the user authenticates on or after `start_date` (a small cron sets `users.first_login_at`, surfaced here)
- Tool readiness → all of `teams_installed_at`, `gmail_created_at`, `signature_set_at`, `jibble_invited_at`, `wise_setup_at` set
- Group chat integration → `group_chats_joined_at IS NOT NULL`

When all five pass, the "Begin orientation" button is enabled.

---

## 12. Phased Rollout

| Phase | Scope | Migration | Switchover |
|---|---|---|---|
| **0 — schema** | Migration `add-onboarders-tables.sql`. No UI yet. | Apply via Supabase SQL Editor. | None — purely additive. |
| **1 — list + detail (read-only)** | Refactor `/onboarders` to read from `onboarders`. Build `/onboarders/[id]` with all tabs but no actions wired. Add `is_onboarding` to `users`. | None. | None — read-only is safe. |
| **2 — actions + audit** | Wire server actions: status transitions, document upload, reference / verification CRUD, `onboarder_history`. No n8n yet. | None. | HR continues to use Gmail for emails; HR types updates into the app. |
| **3 — n8n welcome + Gmail nudge + BG check** | Ship the three workflows + env keys. Wire the "Send" buttons. | n8n imports. Env vars set. | HR clicks the buttons instead of composing in Gmail. |
| **4 — references + employment verification** | Wire `reference-request` and `employment-verification` workflows. Tracker children become "actionable". | n8n imports. | HR no longer copies referee details into Gmail. |
| **5 — ATS promotion** | `createOnboarderFromCandidate` on `hired`. Remove the non-goal from `RECRUITMENT_AI_AGENT_BUILD_PLAN.md:25`. | None. | Once Phase 4 is stable, candidates moved to `hired` will auto-create onboarders. Until then, "Start onboarding" is a manual button. |
| **6 — checklists + auto-advance** | Day-1 checklist auto-advances stage. Pre-onboarding derived checklist. Welcome banner on `/my-tasks`. | None. | UX polish — safe to ship behind a per-onboarder toggle if needed. |
| **7 — sweeps + reminders** | Daily n8n sweep for SOW unsigned >48h, referee non-response >48h. | n8n cron. | Reduces HR's manual chasing. |

Phases 1–3 are the minimum to retire the Google Sheet tracker. Phases 4–7 retire the manual Gmail composing.

---

## 13. Open Questions

- **Who can be an "Onboarding Lead" or Direct Supervisor?** The app allows active Lead, Admin, and Founder users to be selected per onboarder. Decide later whether per-team suggestions are needed.
- **Group-chat announcement** — does the SOP want this auto-posted to a Teams channel via webhook, or just generated text the Lead pastes manually? Teams API access is not assumed in v1; assume *text generation only* until confirmed.
- **W-8 sample file** — the SOP says HR attaches "a blank W-8 form and a sample filled form" to the welcome email. Store both in a public Supabase Storage bucket and link from the email template, or attach via n8n's Gmail node? Attaching is more reliable; storing as links breaks if the bucket is private.
- **SOW signature** — recorded as a single checkbox in v1 (`sow_signed_at = NOW()` when the Lead clicks). When HR moves to a real e-signature provider (DocuSign, Google Workspace), webhook back into this app to set the timestamp automatically.
- **Failed probation vs. PIP first** — same open question as the original `/onboarders` scaffold (`page.tsx:319`). Defer; for v1, "Failed probation" terminates the onboarder; PIPs live outside this module.
- **Intern Romega Gmail format** — the SOP uses `jsmith.romegasolutions@gmail.com` (a personal Gmail, not a workspace account). Confirm with Chief of Staff whether this is still policy in 2026; if interns now get `firstName@romega-solutions.com`, collapse §10.6 and §10.7 into a single template.
- **Bulk-send concerns** — the n8n Gmail send happens from a single account. Daily send limits (500/day Workspace, lower for personal) could throttle reference / verification blasts during hiring sprees. Worth tracking volume after Phase 4.

---

## 14. File Map (new files only)

```
docs/migrations/add-onboarders-tables.sql                              ← §3
src/app/(app)/onboarders/page.tsx                                      ← refactor (list)
src/app/(app)/onboarders/[id]/page.tsx                                 ← new (detail)
src/app/(app)/onboarders/[id]/actions.ts                               ← new
src/app/(app)/onboarders/new/page.tsx                                  ← new (manual create)
src/app/(app)/onboarders/setup/page.tsx                                ← moved from current page.tsx
src/app/(app)/my-tasks/onboarding-intake/page.tsx                      ← new (contractor form)
src/app/(app)/my-tasks/onboarding-intern-intake/page.tsx               ← new (intern form)
src/lib/storage.ts                                                     ← extend (uploadOnboarderDocument)
src/lib/n8n.ts                                                         ← extend (notifyOnboardingWebhook, templates)
src/lib/onboarders.ts                                                  ← new (createOnboarderFromCandidate helper)
n8n/Romega Onboarding — Welcome Email.json                             ← new
n8n/Romega Onboarding — Gmail Setup Nudge.json                         ← new
n8n/Romega Onboarding — Employment Verification.json                   ← new
n8n/Romega Onboarding — Group-chat Announcement.json                   ← new
n8n/Romega Onboarding — Sweeps.json                                    ← new (cron)
```

Files modified:

```
src/app/(app)/recruiting/candidates/actions.ts   ← call createOnboarderFromCandidate on 'hired'
src/components/app-sidebar.tsx                   ← already gates /onboarders; no change
src/lib/rbac.ts                                  ← already has canAccessLeadTool('onboarding'); no change
.env                                              ← five new N8N_* keys
```

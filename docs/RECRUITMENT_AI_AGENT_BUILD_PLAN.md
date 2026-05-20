# Recruitment AI Agent — Build Plan

> Operational spec for migrating the manual Recruitment SOP (Google Sheets + Drive + Gmail) onto the in-house ATS at `/recruiting/candidates` plus the existing self-hosted n8n.
>
> Source: `Recruitment – SOP Workflow.pdf` (HR team, 2026).
> Owners: HR team (process), Engineering (implementation), n8n admin (workflow deploy).

---

## 1. Goal & Success Criteria

**Goal.** Replace the manual Google Sheets / Drive / Gmail recruitment SOP with the ATS app plus n8n, while preserving every stage and email the HR team uses today.

**Success criteria.**
- Recruiters no longer touch the Google Sheet for new applications. The ATS is the source of truth.
- 100% of resumes are stored in Supabase Storage with a deterministic file name.
- Every status transition either fires the right Gmail template automatically or explicitly opts out (per the table in §2).
- Every email send and every status change is recorded in the existing `candidate_history` audit log.
- A candidate can apply from a public URL (`/apply/{positionId}`) without anyone in the HR team typing anything.
- A "pending_response" candidate is auto-flagged "unresponsive" after 7 days, with one nudge email.

**Non-goals (v1).**
- LinkedIn Easy Apply ingestion or LinkedIn job posting automation.
- Interview scheduling on Google Calendar.
- Slack notifications.
- Onboarding kickoff automation on `hired`.
- AI-assisted candidate scoring or shortlisting.

These appear in §10 (Future Automation) as a roadmap.

---

## 2. Status Model

The SOP names 11 status stages. The ATS currently uses 6. We will **replace** the 6 with the 11. Every stage gets a stable slug, a UI color, an "auto-email" template, and a "terminal" flag (no further transitions expected).

| Slug | Label | Auto-email on entry | Terminal? | UI color |
|---|---|---|---|---|
| `pending_response` | Pending Response | `acknowledgment` *(only when the row is first created)* | no | slate |
| `interview_romega` | Interview - Romega | `interview-invite-romega` | no | blue |
| `endorsed_client` | Endorsed - Client | `endorsement-notice` | no | indigo |
| `final_interview` | Final Interview | `interview-invite-final` | no | violet |
| `offered` | Offered | `offer-letter` | no | purple |
| `hired` | Hired | `congratulations` + HR onboarding ping | yes | green |
| `failed` | Failed | `rejection-polite` | yes | red |
| `no_show` | No Show | *(none)* | yes | rose |
| `unresponsive` | Unresponsive (>7d) | `nudge-followup` *(once, by cron)* | no | amber |
| `consider_other` | Consider for other positions | *(none)* | no | cyan |
| `withdrew` | Candidate Declined / Withdrew | `acknowledgment-of-withdrawal` | yes | stone |

**Migration of existing rows** (6 → 11):

| Old slug | New slug |
|---|---|
| `applied` | `pending_response` |
| `screening` | `pending_response` |
| `interview` | `interview_romega` |
| `offer` | `offered` |
| `hired` | `hired` |
| `rejected` | `failed` |

---

## 3. Database Changes

New migration: `docs/migrations/add-recruitment-agent-fields.sql`.

```sql
-- 1. Application code (APP-YYYY-NNNN)
ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS application_code TEXT UNIQUE;

CREATE SEQUENCE IF NOT EXISTS application_code_seq;
-- Recruiter code is generated app-side using sequence + current year:
--   nextval('application_code_seq')  →  formatted as APP-2026-0042

-- 2. Email send tracking
ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS last_email_template TEXT,
  ADD COLUMN IF NOT EXISTS last_email_sent_at  TIMESTAMPTZ;

-- 3. Remap existing statuses to the 11-stage model
UPDATE candidates SET status = 'pending_response' WHERE status IN ('applied', 'screening');
UPDATE candidates SET status = 'interview_romega' WHERE status = 'interview';
UPDATE candidates SET status = 'offered'          WHERE status = 'offer';
UPDATE candidates SET status = 'failed'           WHERE status = 'rejected';
-- 'hired' stays the same.

-- 4. Backfill application_code for existing rows (oldest first)
WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY EXTRACT(YEAR FROM created_at) ORDER BY id) AS n,
         EXTRACT(YEAR FROM created_at)::int AS yr
  FROM candidates
  WHERE application_code IS NULL
)
UPDATE candidates c
   SET application_code = 'APP-' || ordered.yr || '-' || LPAD(ordered.n::text, 4, '0')
  FROM ordered
 WHERE c.id = ordered.id;
```

`candidates.resume_url` already exists (added in `add-candidates-table.sql`) — reused, not added.

---

## 4. Resume Storage (Supabase Storage)

**Bucket.** `candidate-resumes` (private; signed URLs only). Create via the Supabase dashboard or:

```sql
INSERT INTO storage.buckets (id, name, public) VALUES ('candidate-resumes', 'candidate-resumes', false)
  ON CONFLICT (id) DO NOTHING;
```

**Path scheme.** `candidates/{candidateId}/{slugifiedPositionAndName}.pdf`. Example: `candidates/42/frontend-engineer-juan-dela-cruz.pdf`.

**New file:** `src/lib/storage.ts`.

```ts
import { createAdminClient } from '@/lib/supabase/admin';

const BUCKET = process.env.SUPABASE_RESUMES_BUCKET ?? 'candidate-resumes';

export async function uploadResumeToStorage(args: {
  candidateId: number;
  position:    string | null;
  fullName:    string;
  file:        File;
}): Promise<{ path: string; signedUrl: string }> {
  const slug = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const filename = `${slug(args.position ?? 'role')}-${slug(args.fullName)}.pdf`;
  const path = `candidates/${args.candidateId}/${filename}`;

  const admin = createAdminClient();
  const bytes = new Uint8Array(await args.file.arrayBuffer());
  const { error } = await admin.storage.from(BUCKET).upload(path, bytes, {
    contentType: 'application/pdf',
    upsert: true,
  });
  if (error) throw new Error(`Upload failed: ${error.message}`);

  const { data, error: signError } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(path, 60 * 60 * 24 * 365); // 1y
  if (signError || !data) throw new Error(`Signing failed: ${signError?.message ?? 'unknown'}`);

  return { path, signedUrl: data.signedUrl };
}
```

**Wiring.** Persist the file in both flows:
- `createCandidateFromResume(formData)` — after candidate insert, call `uploadResumeToStorage` and update `candidates.resume_url`.
- `parseResumeForCandidate(id, formData)` — same; re-uploads on each re-parse (upsert = true overwrites).
- Public application form (§7) — same.

---

## 5. n8n Workflows

Two new JSON workflows ship under `n8n/`:

### 5a. `Romega ATS — Candidate Communication.json`

- **Trigger:** Webhook POST with `{ candidateId, event, status }`.
- **Steps:**
  1. Fetch candidate from Supabase (`id`, `full_name`, `email`, `position`, `application_code`, `last_email_template`).
  2. Switch on `event` (`created`) or `status` (any of the slugs in §2 with an auto-email).
  3. If `last_email_template === <chosen template>` *and* the run is from a status change (not a manual re-send), short-circuit — dedup guard.
  4. Gmail send (template body in §9).
  5. Supabase update: set `last_email_template`, `last_email_sent_at = now()`.
  6. Respond `{ success: true, template }` to the webhook caller.

### 5b. `Romega ATS — Unresponsive Sweep.json`

- **Trigger:** Schedule, daily 08:00 PHT.
- **Steps:**
  1. Supabase select candidates where `status = 'pending_response' AND created_at < now() - interval '7 days'`.
  2. For each: set `status = 'unresponsive'`, send Gmail `nudge-followup`, set `last_email_template = 'nudge-followup'`, `last_email_sent_at = now()`.
  3. Append a `candidate_history` row via the same Supabase node (`user_name = 'Recruitment Bot'`, `summary = 'Auto-flagged as Unresponsive (>7 days), nudge sent'`).

Both workflows live in `n8n/` (next to `Romega ATS — Resume Extractor (Regex, No API Key).json`) and are imported into the self-hosted n8n manually. Their webhook URLs go in the project `.env`.

---

## 6. Backend Wiring

**Extend `src/lib/n8n.ts`:**

```ts
export function getCommunicationWebhookUrl(): string {
  const url = process.env.N8N_COMMUNICATION_WEBHOOK_URL;
  if (!url) throw new Error('N8N_COMMUNICATION_WEBHOOK_URL is not configured');
  return url;
}

export type CommunicationEvent =
  | { kind: 'created'; candidateId: number }
  | { kind: 'status_changed'; candidateId: number; status: string };

export async function notifyCommunicationWebhook(event: CommunicationEvent): Promise<
  { ok: true; template?: string } | { ok: false; error: string }
> {
  try {
    const res = await fetch(getCommunicationWebhookUrl(), {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(event),
    });
    if (!res.ok) {
      return { ok: false, error: `n8n responded ${res.status}` };
    }
    const data = await res.json() as { template?: string };
    return { ok: true, template: data.template };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'network error' };
  }
}
```

**Modify `src/app/(app)/recruiting/candidates/actions.ts`:**

1. Replace `ALLOWED_STATUSES` with the 11 slugs from §2.
2. Add an `AUTO_EMAIL_STATUSES` set listing which status transitions trigger a webhook call.
3. In `createCandidate` and `createCandidateFromResume`:
   - Generate `application_code` via a small helper: `APP-{year}-{padded sequence}`. Use `nextval('application_code_seq')` via a Supabase RPC, or a single insert with `RETURNING id` + format from year + new sequence column. Simplest: fetch `nextval` via `.rpc('nextval', { seq: 'application_code_seq' })` or via raw SQL.
   - After insert, fire-and-forget `notifyCommunicationWebhook({ kind: 'created', candidateId })`.
   - Catch the webhook result; if not ok, write a `candidate_history` row with `field: 'email_failed'`, `summary: 'Acknowledgment email failed: <reason>'` so the recruiter sees it.
4. In `updateCandidateStatus`:
   - After successful DB update and history write, if the new status is in `AUTO_EMAIL_STATUSES`, call the webhook; surface failure via history as above.

**Important:** the webhook is fire-and-forget *in the sense that* the user gets a response immediately, but the call still happens server-side and its result is recorded. Don't `Promise.race` it with a timeout shorter than ~10s.

---

## 7. Public Application Form

**Route.** `src/app/apply/[positionId]/page.tsx` — outside the `(app)` group, so no sidebar and no auth.

**UI.** Single-page form, RS-branded:
- Auto-filled position title (read from `positions` table by `positionId`).
- Required fields: full name, email, phone, resume (PDF, max 10 MB).
- Optional fields: LinkedIn URL, message.
- On submit → server action → upload resume to Supabase Storage → call n8n resume extractor (`parseResumeWithN8n`) → insert candidate with `source: 'direct'`, `status: 'pending_response'`, `position: positions.job_title`, `assigned_to: positions.created_by` (recruiter ownership), `created_by: NULL`.
- Success view: "Thanks {name} — your application code is APP-2026-NNNN."
- After insert: fire `notifyCommunicationWebhook({ kind: 'created', candidateId })` — acknowledgment goes out.

**Public route gating.** `src/proxy.ts` already redirects unauthenticated users to `/login`. Allow-list `/apply/` before that redirect runs. Confirm no leaked admin client tokens by inspecting the network tab.

**Anti-abuse (v1, light).**
- Server action verifies `file.type === 'application/pdf'` and `file.size ≤ 10 MB`.
- One submission per `(positionId, email)` within 24h (dup-check before insert; existing rows return the same success page).
- No CAPTCHA in v1 — add Cloudflare Turnstile if spam becomes a problem.

---

## 8. UI Updates

**Status options.** Update `STATUSES` and `STATUS_COLOR` in `src/app/(app)/recruiting/candidates/candidate-row.tsx` to match §2.

**Candidate detail page** (`src/app/(app)/recruiting/candidates/[id]/page.tsx`):
- New row in Quick Facts: `Application code` → `c.application_code ?? '—'`.
- New row in Quick Facts: `Last email` → `{last_email_template} · {formatDate(last_email_sent_at)}`.
- New "Resend last email" button next to the status pill, shown only when the last history event is an `email_failed`. Calls a server action that re-fires the webhook.
- Resume section: when `resume_url` is set, show "Download resume" button (signed URL, expires in 1y).

**Positions tab** (`src/app/(app)/recruiting/positions/page.tsx`):
- New action button per row: "Copy application link" → copies `https://{host}/apply/{position.id}` to clipboard.
- New stat card next to existing ones: count of candidates per position (groupable). Skip if it complicates the layout — defer.

**Audit history.** No code change — `candidate_history` rows for status changes, email sends, and email failures are already written by the action layer.

---

## 9. Email Templates

Templates are stored in the n8n workflow's Set node. Variables substituted by n8n (`{{candidateName}}`, `{{positionTitle}}`, `{{applicationCode}}`, `{{recruiterName}}`).

### `acknowledgment` (on creation)
> **Subject:** Application received — {{positionTitle}} ({{applicationCode}})
>
> Hi {{candidateName}},
>
> Thanks for applying to **{{positionTitle}}** at Romega Solutions. We've received your application (ref: **{{applicationCode}}**) and our recruitment team will review it shortly.
>
> If we'd like to move forward, you'll hear from us within 5–7 business days.
>
> — Romega Solutions Recruitment

### `interview-invite-romega` (status → Interview - Romega)
> **Subject:** Interview invitation — {{positionTitle}} ({{applicationCode}})
>
> Hi {{candidateName}},
>
> Good news — we'd like to invite you to an initial interview for the **{{positionTitle}}** role. {{recruiterName}} will reach out separately to schedule a time that works for you.
>
> Please reply to this email to confirm your availability.

### `endorsement-notice` (status → Endorsed - Client)
> **Subject:** Update on your application — {{positionTitle}}
>
> Hi {{candidateName}},
>
> Quick update: your profile has been endorsed to the client team for **{{positionTitle}}**. They'll review and, if there's a fit, follow up directly with next steps. We'll let you know if anything is needed from your side.

### `interview-invite-final` (status → Final Interview)
> **Subject:** Final interview — {{positionTitle}}
>
> Hi {{candidateName}},
>
> You've been invited to a final interview for **{{positionTitle}}**. {{recruiterName}} will coordinate the schedule and share the meeting details.

### `offer-letter` (status → Offered)
> **Subject:** Offer — {{positionTitle}}
>
> Hi {{candidateName}},
>
> We're pleased to extend an offer for the **{{positionTitle}}** role. {{recruiterName}} will follow up with the formal offer letter and next steps shortly. Congratulations.

### `congratulations` (status → Hired)
> **Subject:** Welcome to Romega Solutions
>
> Hi {{candidateName}},
>
> Welcome aboard. Our HR team will be in touch this week to walk you through onboarding for the **{{positionTitle}}** role.

### `rejection-polite` (status → Failed)
> **Subject:** Update on your application — {{positionTitle}}
>
> Hi {{candidateName}},
>
> Thank you for the time you spent with us for the **{{positionTitle}}** role. After careful review, we've decided to move forward with other candidates whose experience more closely matches this role.
>
> We appreciate your interest in Romega Solutions and wish you the best.

### `nudge-followup` (cron, after 7 days in Pending Response)
> **Subject:** Still interested in {{positionTitle}}?
>
> Hi {{candidateName}},
>
> Following up on your application for **{{positionTitle}}** ({{applicationCode}}). If you're still interested, please reply to this email so we can move things forward. Otherwise we'll close out the application after 7 more days.

### `acknowledgment-of-withdrawal` (status → Candidate Declined / Withdrew)
> **Subject:** Application closed — {{positionTitle}}
>
> Hi {{candidateName}},
>
> Confirming we've closed your application for **{{positionTitle}}** at your request. We'll keep your profile on file in case future roles open up. Thanks for considering Romega Solutions.

**HR sign-off needed** on the wording before deploy.

---

## 10. Future Automation (Out of Scope for v1)

Logged here so the roadmap is visible, but not built now.

- **Slack ping** to `#hiring` on `hired` — single n8n branch added to the Communication workflow.
- **Google Calendar invite** when status flips to `interview_romega` or `final_interview`. Requires an interview-datetime field on the candidate; add to the edit dialog first.
- **Weekly pipeline digest** to HR lead every Monday 08:00 PHT — counts per stage, time-in-stage averages, candidates with no movement >14d. Pure n8n + Supabase, no app changes.
- **"Consider for other positions" rematching** — when a new Position is created, query candidates in `consider_other` whose past `position` text matches, and email the recruiter a shortlist.
- **Onboarding kickoff** on `hired` — n8n creates a `users` row (inactive), notifies IT for laptop/account provisioning, and sends HR forms via Gmail.
- **LinkedIn job posting** when a Position is added. LinkedIn's API for posting is gated (developer review). Document the manual fallback for now.
- **Inbound email ingest** — a recruitment@romega.solutions inbox watched by n8n; resumes attached to emails get parsed and turned into candidates automatically. Useful for referrals.
- **AI candidate scoring** — Gemini summarization of fit per Position. Stores a 1-line "Why this candidate" on the candidate row.

---

## 11. Verification Checklist

Run end-to-end on staging, with a real recruiter:

1. **Public apply** — `/apply/{positionId}` submission produces a `pending_response` candidate with an `application_code`, parsed resume fields, a PDF in Supabase Storage, and an acknowledgment email in the candidate's inbox within ~30 seconds.
2. **Stage transitions** — flip `pending_response` → `interview_romega` → `endorsed_client` → `final_interview` → `offered` → `hired`. Each transition fires the right email and updates `last_email_template` + `last_email_sent_at`, with a matching history row.
3. **Terminal states** — `failed` sends `rejection-polite`; `withdrew` sends `acknowledgment-of-withdrawal`; `no_show` sends nothing. `consider_other` sends nothing.
4. **Unresponsive sweep** — set cron threshold to 1 minute, create a `pending_response` row, wait. The candidate flips to `unresponsive` and exactly one `nudge-followup` is sent. Running the cron again does not re-send.
5. **Email failure path** — temporarily break `N8N_COMMUNICATION_WEBHOOK_URL`. Change a status. The status still saves. A history row `email_failed: <reason>` appears. Restoring the URL and clicking "Resend last email" successfully sends.
6. **Migration regression** — pre-existing rows (created before this build) show under the remapped slugs; no row still has `applied`/`screening`/`interview`/`offer`/`rejected`.
7. **Storage regression** — uploading a new resume to an existing candidate uploads to Supabase Storage and updates `resume_url`. The previous file is overwritten (upsert).
8. **Auth boundary** — `/apply/123` opened in incognito loads without redirecting to `/login`. `/recruiting/candidates` opened in incognito redirects to `/login`.

---

## 12. Rollout

1. **Apply migration** in Supabase SQL Editor: `docs/migrations/add-recruitment-agent-fields.sql`. Verify with `SELECT application_code, status FROM candidates ORDER BY id;` — every row has a code, no legacy slugs.
2. **Create Supabase Storage bucket** `candidate-resumes` (private). Add a RLS policy that allows `service_role` read/write only — the app uses the admin client.
3. **Import n8n workflows** — open the self-hosted n8n, Import from File, drop in both JSON files. Activate. Copy the webhook URL from the Communication workflow.
4. **Set env vars** in production:
   - `N8N_COMMUNICATION_WEBHOOK_URL=…`
   - `SUPABASE_RESUMES_BUCKET=candidate-resumes` (only set if changing default)
   - Confirm `N8N_RESUME_PARSER_URL` is already set (existing).
5. **Deploy app** with the new code and migration applied.
6. **HR sign-off pass** — recruiter walks the Verification checklist on staging, confirms email copy reads naturally, confirms statuses match their mental model.
7. **Cut over** — share the public apply link for the first active Position. Stop new entries to the Google Sheet. Archive the sheet read-only after 30 days.

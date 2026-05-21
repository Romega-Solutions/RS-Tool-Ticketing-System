# Internal Onboarding — MVP Setup

> Step-by-step setup to ship the MVP of the Internal Onboarding module. Companion to `INTERNAL_ONBOARDING_BUILD_PLAN.md` (the full spec).
>
> **MVP goal:** retire the manual Onboarding Tracker Sheet. HR records onboarders in this app and clicks buttons to send the SOP emails. Everything else (auto-promotion from the ATS, sweeps, checklists, etc.) ships *after* the MVP is stable.
>
> **Owners while building MVP:** Engineering executes; Onboarding Lead validates each phase before the next is started.

---

## What's in the MVP — and what's not

| Included in MVP | Deferred (post-MVP) |
|---|---|
| `onboarders` table + 4 child tables (migration §3 of build plan) | ATS auto-promotion on `candidates.status='hired'` |
| Storage bucket `onboarder-docs` (private) | Day-1 checklist auto-advance |
| `/onboarders` list view (kanban) | Pre-onboarding "derived" checklist |
| `/onboarders/[id]` detail with Overview + Background check + Documents tabs | Welcome banner on `/my-tasks` |
| `/onboarders/new` manual create form | `/my-tasks/onboarding-intake` + `…intern-intake` forms |
| Server actions: status change, mark SOW signed, upload doc, add/send reference, add/send employment verification, send welcome, send Gmail nudge, send BG-check ask | 30-day / 90-day workflows |
| `onboarder_history` audit log on every action | Daily sweep cron (SOW unsigned, referee non-response) |
| 4 n8n workflows: `bg-check-initiate`, `reference-request`, `employment-verification`, `welcome` (forks contractor/intern) | `gmail-signature-nudge`, `group-chat-announce`, `sow-reminder` |
| Sidebar gating reuses existing `canAccessLeadTool('onboarding')` | `users.is_onboarding` flag |

The MVP **does not** automate Day 1 or 30/90-day reviews. The Onboarding Lead still uses Google Calendar / Jibble / Wise outside the app, but records progress on the onboarder row.

---

## Phase 0 — Pre-flight (1 hour)

Do these once before any code lands.

**0.1 Verify Supabase access.** Confirm you can hit Supabase via the SQL Editor for this project and that `candidates`, `users`, `orgchart_teams`, and `candidate_history` tables already exist (they do — see `docs/migrations/add-candidates-table.sql`, `add-ats-history-and-positions.sql`).

**0.2 Pick the default Onboarding Lead.** Decide who that is for now (likely the current HR Onboarding Lead). Get their `users.id` from Supabase. We'll hard-code it as an env var:

```bash
DEFAULT_ONBOARDING_LEAD_USER_ID=<id>
```

Add to `.env.local` and to Vercel (preview + production).

**0.3 Decide the sender Gmail.** All MVP emails go from one Gmail account. Confirm with HR which one:
- `onboarding@romega-solutions.com` (preferred — workspace account)
- A specific lead's Romega Gmail

Whatever it is, that account needs to be linked in n8n's Gmail OAuth credential. If it isn't yet, do that in n8n's Credentials UI before Phase 3.

**0.4 No new env vars yet at this stage.** The n8n webhook URLs come in Phase 3.

---

## Phase 1 — Database migration (30 min)

**1.1 Create the migration file.**

`docs/migrations/add-onboarders-tables.sql` — copy the SQL block from `INTERNAL_ONBOARDING_BUILD_PLAN.md` §3 verbatim. **Omit** the `ALTER TABLE users ADD COLUMN is_onboarding` line — that's post-MVP.

**1.2 Apply via Supabase SQL Editor.**

Open the SQL Editor for the project, paste the migration, hit *Run*. Verify in the Table Editor that these now exist:

- `onboarders`
- `onboarder_references`
- `onboarder_employment_verifications`
- `onboarder_documents`
- `onboarder_history`

**1.3 Seed one test onboarder** (so the empty-state isn't the first thing engineers test against):

```sql
INSERT INTO onboarders (
  full_name, personal_email, onboarder_type, role_title, team, status, created_by
) VALUES (
  'Test Onboarder', 'test+onboarder@example.com', 'contractor',
  'Frontend Engineer', 'Engineering', 'offer_signed', 1
);
```

Delete the row before going to production.

---

## Phase 2 — Storage bucket (10 min)

**2.1 In the Supabase dashboard → Storage**, create a bucket:

- Name: `onboarder-docs`
- Public: **off**

**2.2 RLS** — leave default (only the service-role key can write). The app uses the admin client (`src/lib/supabase/admin.ts`) for uploads, same pattern as `candidate-resumes`.

**2.3 No additional env var** — the bucket name is hard-coded in `src/lib/storage.ts`, or read from a single optional env var with a default (mirror the `SUPABASE_RESUMES_BUCKET` pattern in `RECRUITMENT_AI_AGENT_BUILD_PLAN.md:122`):

```ts
const ONBOARDER_BUCKET = process.env.SUPABASE_ONBOARDER_BUCKET ?? 'onboarder-docs';
```

---

## Phase 3 — Code: read-only list + detail (1–2 days)

Ship this as **one PR**. Everything is read-only — no write paths yet — so it's safe even if HR pokes at it.

**3.1 Refactor `src/app/(app)/onboarders/page.tsx`.**

- Keep the stat cards but wire them to `count()` aggregates on `onboarders` (Active = not in `regularized | failed_probation | withdrew`; Awaiting BG check = `status = 'background_check'`; Day-1 this week = `status = 'day_one' AND start_date BETWEEN this_monday AND this_friday`).
- Replace the static `STAGES` and `WORKFLOWS` sections with a kanban-style list grouped by `status`.
- Move the **setup-required / workflow registry / open-questions** cards to a new admin-only page `src/app/(app)/onboarders/setup/page.tsx`. Same content, just relocated — it's reference material, not operational.

**3.2 Create `src/app/(app)/onboarders/[id]/page.tsx`.**

Tabs: **Overview**, **Background check**, **Documents**. (No "Day-1 checklist" or "Notes" tab yet — those are post-MVP.)

- Overview: name, status pill, role/team, key dates, supervisor/lead/HRBP, history timeline on the right rail. Action buttons render as **disabled placeholders** in this phase ("Coming in Phase 4").
- Background check: tables of references + employment verifications. Read-only.
- Documents: list of `onboarder_documents` rows; download links via signed URLs.

**3.3 Sidebar.**

`src/components/app-sidebar.tsx` already shows `/onboarders` for `lead | admin | ceo` (see `src/lib/rbac.ts`'s `canAccessLeadTool`). No change.

**3.4 Verify.**

`npm run verify` passes. Manually: log in as a lead, navigate to `/onboarders`, see the kanban with the seeded test row. Click in → see the detail page. Reference / verification / documents tables all render their empty states.

---

## Phase 4 — Code: actions + audit log (2–3 days)

Ship as **one PR**. This is the largest phase but each action is small.

**4.1 Create `src/app/(app)/onboarders/[id]/actions.ts`.**

Server actions, in this order (each writes an `onboarder_history` row before returning):

1. `updateOnboarderStatus(id, status)` — guards against invalid slugs.
2. `markSowSigned(id)` — sets `sow_signed_at = now()`.
3. `markSowSent(id)` — sets `sow_sent_at = now()` (Onboarding Lead clicks this when they email the SOW out manually).
4. `addReference(id, formData)` — inserts into `onboarder_references`.
5. `addEmploymentVerification(id, formData)` — inserts into `onboarder_employment_verifications`.
6. `uploadDocument(id, formData)` — calls a new `uploadOnboarderDocument` helper in `src/lib/storage.ts`, inserts into `onboarder_documents`.

Auth check at the top of every action — pattern from `src/app/api/onboarding/route.ts:7-10` plus a role check (`role IN ('lead','admin','ceo')` or `is_onboarding_lead = true` on the user row, once we add that flag).

**4.2 Extend `src/lib/storage.ts`** with `uploadOnboarderDocument({ onboarderId, kind, file, label? })`. Mirror `uploadResumeToStorage` (signature in `RECRUITMENT_AI_AGENT_BUILD_PLAN.md:117-150`); path scheme is `onboarders/{id}/{kind}/{slug}.{ext}`.

**4.3 Create `src/app/(app)/onboarders/new/page.tsx`.**

Form fields: full name, personal email, phone, type (contractor / intern), role title, team (orgchart dropdown), direct supervisor, start date. Submits to a `createOnboarder` server action. No ATS promotion yet — the Onboarding Lead manually creates rows for MVP.

**4.4 Wire the buttons on `[id]/page.tsx`.**

- Overview: enable "Mark SOW sent", "Mark SOW signed", "Advance stage" (Combobox → calls `updateOnboarderStatus`).
- Background check: "Add reference", "Add employment verification" forms in modals. "Upload response" per row (PDF only).
- Documents: "Upload document" with kind selector.

**4.5 Verify.**

Manual checklist with the test onboarder:
- Status: `offer_signed → background_check`. History shows the transition.
- Add 3 references, 2 employment verifications. History shows each insert.
- Upload a W-8 PDF. Bucket has it. History shows it.
- Click "Mark SOW signed". Field updates. History shows it.

---

## Phase 5 — Code + n8n: the four MVP emails (2 days)

Ship as **one PR** alongside the n8n workflow imports.

**5.1 n8n workflows.**

Build and export four workflows under `n8n/`:

1. `Romega Onboarding — BG Check Initiate.json` → email body from `INTERNAL_ONBOARDING_BUILD_PLAN.md` §10.1.
2. `Romega Onboarding — Reference Request.json` → §10.2.
3. `Romega Onboarding — Employment Verification.json` → §10.3.
4. `Romega Onboarding — Welcome.json` → branches on `context.onboarder_type` → §10.4 (contractor) or §10.5 (intern).

All four end with:
- Gmail send (from the account chosen in 0.3).
- Supabase insert into `onboarder_history` (`field='email_sent'`, `summary='Sent <template> to <recipient>'`).
- HTTP response `{ success: true, template }`.

Import each into self-hosted n8n. Copy the webhook URL of each.

**5.2 Env vars.** Add to `.env.local` and to Vercel (preview + production):

```bash
N8N_BG_CHECK_INITIATE_URL=https://n8n.romega.../webhook/...
N8N_REFERENCE_REQUEST_URL=https://n8n.romega.../webhook/...
N8N_EMPLOYMENT_VERIFICATION_URL=https://n8n.romega.../webhook/...
N8N_ONBOARDING_WELCOME_URL=https://n8n.romega.../webhook/...
```

**5.3 Extend `src/lib/n8n.ts`.**

Add `notifyOnboardingWebhook(event)` and the template→env-key map for the four MVP templates only:

```ts
const ONBOARDING_TEMPLATE_TO_ENV: Record<string, string> = {
  'bg-check-initiate':       'N8N_BG_CHECK_INITIATE_URL',
  'reference-request':       'N8N_REFERENCE_REQUEST_URL',
  'employment-verification': 'N8N_EMPLOYMENT_VERIFICATION_URL',
  'welcome':                 'N8N_ONBOARDING_WELCOME_URL',
};
```

Network failures get caught and written to `onboarder_history` (`field='email_failed'`). Same fire-and-forget-but-record pattern as the ATS plan (`RECRUITMENT_AI_AGENT_BUILD_PLAN.md:223-232`).

**5.4 Wire send buttons.**

- Overview: "Send BG-check email" → fires `bg-check-initiate`. Disabled if `status !== 'background_check'` (or auto-fires on status transition into `background_check` — pick one; the auto-fire path is cleaner, no extra button).
- Overview: "Send welcome email" → fires `welcome` with `context.onboarder_type`. Disabled if `status !== 'pre_onboarding'`. Same choice: auto-fire on transition vs. manual button. **For MVP, recommend manual buttons** — easier to debug, and HR doesn't lose agency.
- Background check tab: per-row "Send" button on references → fires `reference-request`; same on employment verifications → fires `employment-verification`. Marks `request_sent_at`.

**5.5 Verify.**

End-to-end test with a real personal email address (not the test row):
1. Create onboarder → manually advance to `background_check`.
2. Click "Send BG-check email". Email lands in your inbox with the SOP body. `onboarder_history` shows it.
3. Add a reference (point it at another personal address you control). Click "Send". Email lands.
4. Manually advance to `pre_onboarding`. Click "Send welcome email" — choose contractor first, then create a second onboarder as intern and verify the body forks correctly.

Network-failure path: temporarily break one env var (rename it), click send, confirm the action records `field='email_failed'` in history and surfaces the error in the UI.

---

## Phase 6 — Handoff to HR (half day)

**6.1 Walk-through.** Screen-share with the Onboarding Lead and HRBP. Walk through:
- Creating an onboarder.
- Marking SOW sent / signed.
- Advancing through the stages.
- Sending each of the four emails.
- Uploading documents and responses.

**6.2 Migrate the Sheet.** Manually copy the **currently in-flight** onboarders from the Sheet into the app (~5–15 rows likely). For each row, set `status` to wherever they are today and upload any already-collected documents.

**6.3 Mark the Sheet read-only.** Rename it `Onboarding Tracker (ARCHIVED — see app)` and lock editing in Drive. Don't delete it for at least 30 days in case HR needs to reference historical rows.

**6.4 Sign-off.** Onboarding Lead confirms they no longer touch the Sheet for new hires.

---

## Phase 7 — Stabilization buffer (1 week, no new features)

Run the MVP in production for one full week. Watch:

- `onboarder_history` for `email_failed` rows → fix any n8n or env-var issues.
- Onboarding Lead's questions in Teams → record them and decide what's a bug vs. a future feature.
- Email deliverability (Gmail send count) — if HR is hiring 5+ people that week, the single sender may hit a soft limit.

**Do not start the post-MVP backlog (§ below) until the stabilization week passes clean.**

---

## Post-MVP — in this order

These are the items consciously deferred from the MVP. Tackle them in this order; each builds on the prior.

### A. ATS auto-promotion

Implement `createOnboarderFromCandidate(candidateId)` and call it from `src/app/(app)/recruiting/candidates/actions.ts` when status flips to `hired`. Removes the manual `/onboarders/new` step for ATS-sourced hires. Spec is in `INTERNAL_ONBOARDING_BUILD_PLAN.md` §9.

### B. Day-1 checklist + auto-advance

Add the seven `*_at` columns to the detail page as toggleable checkboxes. When all seven are set, auto-advance status to `thirty_day`. Reuses the existing migration columns. Spec: build plan §8b, item 4.

### C. Two extra MVP-adjacent emails

Ship `gmail-signature-nudge` (contractor + intern variants) and `group-chat-announce`. These were left out of MVP because they're nice-to-have, not blockers. Bodies in build plan §10.6, §10.7, §10.8.

### D. Onboarder-facing surfaces

Add `users.is_onboarding` (deferred ALTER from Phase 1). Build the welcome banner on `/my-tasks` and the two in-app intake forms (`/my-tasks/onboarding-intake`, `…onboarding-intern-intake`) — replaces the Google Forms. Spec: build plan §7.

### E. 30-day / 90-day workflows

Ship the two existing-scaffold env keys (`N8N_30DAY_CHECKIN_URL`, `N8N_90DAY_REVIEW_URL`) as real n8n workflows. Probation review UI on the detail page.

### F. Sweeps cron

`Romega Onboarding — Sweeps.json` daily at 08:00 PHT: SOW unsigned >48h, referee non-response >48h. Spec: build plan §5b.

### G. Open questions to resolve **after** A–F are live

Only attempt these once everything above is in production and stable. None of these block the MVP — they're either policy questions (HR + CoS need to decide) or scope choices that are easier to make once we have real usage data.

1. **Default Onboarding Lead resolution.** MVP hard-codes `DEFAULT_ONBOARDING_LEAD_USER_ID` env var. Replace with a per-team lookup or a `users.is_onboarding_lead` flag once HR confirms whether there's one Lead or one per team.

2. **Group-chat announcement delivery.** Today `group-chat-announce` returns text the Lead pastes manually. Decide whether to invest in Teams API integration or accept the paste-step as permanent.

3. **W-8 attachments.** Today the welcome email includes a link or text reference to the W-8 sample. Decide whether to:
   - Attach blank + filled W-8 PDFs to every contractor welcome email (n8n Gmail node attachment), or
   - Host the PDFs in a public Supabase Storage bucket and link from the email body.
   The link route is simpler; the attachment route is more reliable. Pick one based on observed bounce / "where do I get the form?" replies.

4. **SOW e-signature integration.** MVP records `sow_signed_at` on a manual button click. When HR adopts a real e-signature provider (DocuSign, Google Workspace), build a webhook back into this app to set the timestamp automatically. Pre-write the inbound webhook endpoint shape now (provider-agnostic) so the switch is one-click later.

5. **Failed probation vs PIP first.** Same question that's in the original scaffold (`src/app/(app)/onboarders/page.tsx:319`). For MVP, "Failed probation" is terminal — no PIP workflow. Revisit once HR has used the system for ~6 months and we have real data on probation outcomes.

6. **Intern Romega Gmail format.** SOP says `jsmith.romegasolutions@gmail.com` (personal Gmail). Confirm with Chief of Staff in 2026 whether this is still policy or whether interns now get `firstName@romega-solutions.com`. If unified, collapse §10.6 and §10.7 into one template.

7. **Sender Gmail throttling.** If post-MVP usage shows the single sender hitting daily send limits during hiring sprees, evaluate either rotating senders or moving transactional onboarding email to a dedicated service (Resend, SendGrid).

---

## Rollback

If anything in the MVP misbehaves badly:

- **Phase 5 (emails) breaking** → unset the four n8n env vars in Vercel. Send actions still record the request in `onboarder_history` as `email_failed`. HR falls back to Gmail; nothing else stops working.
- **Phase 4 (actions) breaking** → the kanban + detail are still read-only, so HR can still see state. They go back to the Sheet for that day; engineering fixes; redeploys.
- **Phase 1 (schema) breaking** → tables are additive only; nothing else in the app depends on them. Drop the tables, revert the migration, no data loss anywhere outside `onboarders`.

There is no point at which the MVP rollback affects `candidates`, `users`, or any existing feature.

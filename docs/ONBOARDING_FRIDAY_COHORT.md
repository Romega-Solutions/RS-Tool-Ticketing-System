# Friday onboarding cohorts

Recruitment creates a `pre_onboarding` record when a candidate is hired. After
the Onboarding Lead and Direct Supervisor are assigned, the onboarding team
uses **Confirm & send welcome** to assign the next open Friday cohort. The
meeting is always at **6:00 PM PHT** and its cutoff is **1:00 PM PHT** on the
same Friday.

## Deploy once

1. Run `docs/migrations/reconcile-candidate-pre-employment.sql` in Supabase SQL
   Editor. It includes the onboarding-session reconciliation, so this remains
   the single SQL query to run.
2. Set `JOTFORM_ONBOARDING_FORM_URL` and a long random `N8N_ONBOARDING_SECRET`
   in the app environment.
3. In Jotform, add hidden `onboarding_form_token`, `onboarder_type`, and
   `onboarding_session_date` fields. Use `onboarder_type` to conditionally show
   contractor-only or intern-only questions. Add required radio field
   `meeting_availability` with exact values `yes` and `no`.
4. Build the n8n workflows using the app contracts below. Set the n8n container
   timezone to `Asia/Manila`.

## Data for n8n

When the onboarding team confirms the handoff and sends the existing `welcome`
webhook, its `context` includes:

- `onboarding_lead` and `onboarding_lead_email`
- `direct_supervisor` and `direct_supervisor_email`
- `onboarding_session_date` - human-readable Friday date
- `onboarding_session_starts_at` - ISO timestamp for Friday 6:00 PM PHT
- `onboarding_form_url` - the configured Jotform URL with an opaque
  `onboarding_form_token`, `onboarder_type`, and `onboarding_session_date`
  prefilled

For attendance only, your form-submission workflow can call:

```http
POST /api/automations/onboarding/availability
Authorization: Bearer <N8N_ONBOARDING_SECRET>
Content-Type: application/json

{
  "formToken": "the-onboarding_form_token-hidden-field",
  "availability": "yes",
  "submittedAt": "2026-08-21T04:20:00.000Z",
  "providerSubmissionId": "optional-jotform-submission-id"
}
```

The POST endpoint verifies the opaque form token against its server-side hash,
then derives the onboarder and session itself. It intentionally ignores any
submitted onboarder ID, worker type, or session date. Its response includes
the verified `onboarderId` and `onboarderType`; use that type, rather than the
Jotform hidden field, for any contractor-only document checks in n8n.

For the welcome form with uploaded files, n8n must first download each Jotform
file and call:

```http
POST /api/automations/onboarding/submissions
Authorization: Bearer <N8N_ONBOARDING_SECRET>
Content-Type: application/json
```

Send the opaque form token, `yes`/`no` attendance, a Jotform submission ID, and
up to four base64 documents. The allowed kinds are `sow`, `gov_id`, and
`other`. Do not forward the complete Jotform payload, banking details, or the
raw token inside another field. The app verifies the token, stores each file in
private Supabase Storage, and skips documents already saved for that Jotform
submission ID when n8n retries.

At **Friday 1:00 PM PHT**, your scheduled n8n workflow should call:

```http
GET /api/cron/onboarding-session-finalizer
Authorization: Bearer <CRON_SECRET>
```

The response contains `sessions`, with `confirmed`, `deferred`, and
`nextSession` lists for your invitation and reschedule emails. The finalizer is
idempotent: a finalized Friday session is not processed again.

## Weekly behavior

- Before Friday 1 PM PHT, a completed form marked `yes` keeps the person in
  that Friday's cohort.
- A `no`, no response, incomplete form, or a response after the cutoff moves
  the person to the next open Friday and resets their answer to `pending`.
- At Friday 1 PM PHT, n8n calls the finalizer endpoint. It atomically locks the
  cohort, then n8n emails confirmed attendees and deferred people.
- The session proceeds if at least one person is confirmed. If none are
  confirmed, the session is marked cancelled and everyone is deferred.

The app records each form response and deferral in `onboarder_history` as
`Onboarding Bot`.

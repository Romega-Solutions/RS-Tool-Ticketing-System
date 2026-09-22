# Recruitment Pre-Employment setup

Use this document as the single setup checklist for Recruitment Pre-Employment.
It covers the candidate Background Check form, character references, employment
verification, and the four-document package (SOW, Job Description, AI Policy,
and NDA).

## Database: apply one reconciliation migration

In the Supabase SQL editor, run:

```text
docs/migrations/reconcile-candidate-pre-employment.sql
```

It is safe to run more than once. It only creates missing objects or reconciles
the current definitions; it does not delete or rewrite existing submissions,
reference responses, employment-verification responses, documents, or legacy
onboarding data. In particular, it fixes older environments that are missing
`candidate_pre_employment_documents.signed_at`.

For a new environment, do **not** run the old `add-candidate-*.sql` files one
by one. Those files remain in `docs/migrations/` only as the historical record
of how this feature was introduced.

The migration creates the required tables, indexes, RLS protection, RPCs,
employment-verification trigger, and the private
`candidate-pre-employment-docs` storage bucket. It permits PDF and DOCX files
up to 10 MB.

## Environment variables

Set the values that apply to the forms/workflows you have enabled, then restart
or redeploy the Next.js app so server actions and route handlers receive them.

```text
JOTFORM_BG_CHECK_FORM_URL=https://form.jotform.com/YOUR_BACKGROUND_CHECK_FORM_ID
JOTFORM_REFERENCE_CHECK_FORM_URL=https://form.jotform.com/YOUR_REFERENCE_FORM_ID
JOTFORM_EMPLOYMENT_VERIFICATION_FORM_URL=https://form.jotform.com/YOUR_EMPLOYMENT_VERIFICATION_FORM_ID

N8N_PRE_EMPLOYMENT_SECRET=<long-random-secret>
N8N_BG_CHECK_INITIATE_URL=https://YOUR_N8N/webhook/...
N8N_REFERENCE_REQUEST_URL=https://YOUR_N8N/webhook/...
N8N_EMPLOYMENT_VERIFICATION_URL=https://YOUR_N8N/webhook/...
N8N_PRE_EMPLOYMENT_DOCUMENTS_SEND_URL=https://YOUR_N8N/webhook/...

SUPABASE_CANDIDATE_PREEMPLOYMENT_BUCKET=candidate-pre-employment-docs
```

The N8N secret is an HTTP `Authorization` bearer value for n8n's post-back to
the app:

```text
Authorization: Bearer <N8N_PRE_EMPLOYMENT_SECRET>
```

Keep this variable only in n8n and the application server. Do not put the
Supabase service-role key or the n8n secret in a Jotform URL or browser code.

## Jotform capability links

Jotform's **Unique Name** values used in the prefilled links are separate from
the field keys Jotform returns after a submission.

Candidate Background Check:

```text
request_token
candidate_name
candidate_email
```

Character Reference:

```text
request_token
candidate_name
candidate_position
referee_name
referee_position
referee_company
```

Employment Verification:

```text
request_token
candidate_name
candidate_position
employer_company
```

`request_token` is an opaque, single-use, expiring capability token. It is the
only value used to match and authorize a submission; names, email addresses,
and IDs in a form are display data only.

## n8n post-backs

The candidate Background Check workflow posts to:

```text
POST /api/automations/pre-employment/submissions
```

The character-reference workflow posts to:

```text
POST /api/automations/pre-employment/reference-submissions
```

The employment-verification workflow posts to:

```text
POST /api/automations/pre-employment/employment-verification-submissions
```

Every post-back sends this normalized envelope. Remove `request_token` from
`data`; place it only in the top-level `token` property.

```json
{
  "token": "<request_token>",
  "provider": "jotform",
  "submissionId": "<Jotform event_id>",
  "submittedAt": "<ISO-8601 timestamp>",
  "data": { "...": "the returned Jotform answers" }
}
```

The candidate endpoint also requires:

```json
"formKey": "background_check"
```

A `200` response means the app saved the submission. A `409` means the link
was expired, used, replaced, or the provider submission was already processed;
stop that n8n run rather than retrying it.

The document-package workflow receives `context.documents`, an array of four
temporary signed URLs. In n8n, download each URL as a file and attach the
binary files to the outgoing email; do not present the raw URLs to the
candidate.

## RLS and access

RLS is intentionally enabled with no browser policies on all Pre-Employment
tables. Recruitment pages, uploads, and n8n intake use server-side service-role
clients. Do not add an `anon` or `authenticated` policy merely to make a
browser request work; route it through the application server instead.

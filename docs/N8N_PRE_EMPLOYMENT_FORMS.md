# Pre-Employment Jotform Integration

This integration sends a candidate a one-time, expiring form link. The Jotform
submission is accepted only when n8n sends the token back to the application,
which resolves it to the candidate server-side.

## One-time setup

1. Run [reconcile-candidate-pre-employment.sql](migrations/reconcile-candidate-pre-employment.sql) in the Supabase SQL editor. It is the idempotent canonical migration for all Recruitment Pre-Employment tables, functions, storage, and document columns. Do not run the old incremental migration chain on a new environment.
2. Set the following production environment variables and redeploy:

   ```text
   JOTFORM_BG_CHECK_FORM_URL=https://form.jotform.com/YOUR_FORM_ID
   JOTFORM_REFERENCE_CHECK_FORM_URL=https://form.jotform.com/YOUR_REFERENCE_FORM_ID
   JOTFORM_EMPLOYMENT_VERIFICATION_FORM_URL=https://form.jotform.com/YOUR_EMPLOYMENT_VERIFICATION_FORM_ID
   N8N_PRE_EMPLOYMENT_SECRET=<long random secret>
   N8N_BG_CHECK_INITIATE_URL=https://YOUR_N8N/webhook/onb-bg-check-initiate
   ```

3. In Jotform, add fields with these **Unique Name** values:

   ```text
   request_token      hidden; required for matching, never trust a candidate ID
   candidate_name     optional; hidden or read-only convenience prefill
   candidate_email    optional; hidden or read-only convenience prefill
   ```

   The application appends these as URL parameters. Jotform receives the values
   when the field unique names match exactly.

4. Configure your self-hosted n8n workflows separately, then set their webhook URLs in `N8N_BG_CHECK_INITIATE_URL` and `N8N_REFERENCE_REQUEST_URL`. The application sends the candidate/referee context to those URLs but does not manage n8n workflow definitions.

## Jotform submission workflow in n8n

Your existing Jotform trigger should feed a Code node that produces this
normalized object. Replace the right-hand expressions with the actual field
names from your Jotform trigger output.

```js
return [{
  json: {
    formKey: 'background_check',
    token: $json.request_token,
    provider: 'jotform',
    submissionId: String($json.id),
    submittedAt: new Date($json.created_at).toISOString(),
    // Remove the capability token from the stored raw payload. The app only
    // needs it in `token` to validate this submission.
    data: Object.fromEntries(Object.entries($json).filter(([key]) => key !== 'request_token')),
  },
}];
```

Follow it with an HTTP Request node:

```text
POST https://YOUR_APP/api/automations/pre-employment/submissions
Authorization: Bearer {{ $env.N8N_PRE_EMPLOYMENT_SECRET }}
Content-Type: application/json
Body: {{ $json }}
```

A `200` response contains `candidateId` and `requestId`. A `409` response
means the link was invalid, expired, replaced by a resend, already processed,
or the provider submission was duplicated. Stop the workflow for a `409`; do
not write any feature-specific records.

## Adding a future form

1. Add its form definition to `src/lib/pre-employment-forms.ts` with a new
   `formKey` and its Jotform URL environment key.
2. Add its sending action/UI; call the same token helper and request table.
3. Set up its Jotform fields with `request_token`, `candidate_name`, and
   `candidate_email` (or adjust the definition's field names).
4. Use the same n8n submission intake endpoint with the new `formKey`.
5. Parse the generic raw submission into that form's specific tables only after
   the endpoint returns `200`.

Never identify a candidate from a submitted `candidate_id`, name, or email.
Only the server-resolved request token is authoritative.

## Employment verification

The candidate's Background Check form supplies prior-employer contacts. The
Recruitment profile can then send each contact a separate, expiring employer
verification link through the existing `employment-verification` n8n webhook.
The employer Jotform must have these **prefill URL field names** (these are not
its returned submission keys):

```text
request_token
candidate_name
candidate_position
employer_company
```

Use `context.form_url` in the n8n email. When that form is submitted, n8n must
POST its normalized response to:

```text
POST /api/automations/pre-employment/employment-verification-submissions
Authorization: Bearer <N8N_PRE_EMPLOYMENT_SECRET>
```

with the same `{ token, provider, submissionId, submittedAt, data }` shape as
the referee endpoint. Keep the request token at top-level `token`, not in
`data`.

## Character reference emails

When a Background Check submission has all three reference names and email
addresses, the Recruitment candidate profile shows **Send reference emails**.
It sends the reference-request workflow once per unsent `candidate_references`
row, records the sent timestamp, and writes candidate history. It is available
only while the candidate remains in `offered`.

Each referee receives a distinct Jotform link with these prefilled unique-name
fields:

```text
request_token
candidate_name
candidate_position
referee_name
referee_position
referee_company
```

Your self-hosted n8n reference-email workflow receives the completed URL as
`context.form_url`; include that value in the referee email body. When the
referee submits their form, post the payload to:

```text
POST /api/automations/pre-employment/reference-submissions
Authorization: Bearer <N8N_PRE_EMPLOYMENT_SECRET>
```

The body is the same shape as the candidate form intake except it does not need
`formKey`:

```json
{
  "token": "<request_token>",
  "provider": "jotform",
  "submissionId": "<Jotform submission ID>",
  "submittedAt": "<ISO timestamp>",
  "data": { "...": "all referee form answers except request_token" }
}
```

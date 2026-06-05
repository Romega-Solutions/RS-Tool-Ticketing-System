# n8n — Talent Pool consent email

When an HR user clicks **Send consent email** on a candidate (Talent Pool panel),
the app fires the existing **"Romega ATS — Candidate Communication"** webhook
(`N8N_COMMUNICATION_WEBHOOK_URL`) with a new event `kind`. The n8n workflow needs
**one new branch** that emails the candidate a one-click consent link.

No new env vars are required on the ticketing side — this reuses
`N8N_COMMUNICATION_WEBHOOK_URL` and `APP_BASE_URL` (the latter must be the public
URL of the ticketing app so the confirm link resolves).

## Webhook payload

The app POSTs JSON to `N8N_COMMUNICATION_WEBHOOK_URL`:

```json
{
  "kind": "talent_consent_request",
  "candidateId": 123,
  "candidateName": "Britni K. Buiwitt",
  "candidateEmail": "britni@example.com",
  "confirmUrl": "https://<ticketing-app>/api/public/talents/confirm/<token>"
}
```

(The existing kinds — `created`, `status_changed`, `resend` — are unchanged.
Branch on `{{$json.kind}}`.)

## n8n branch

1. After the Webhook node, add a **Switch** (or IF) on `{{$json.body.kind}}`
   (the workflow already unwraps `.body`; match how the other kinds are read).
2. For `talent_consent_request`, add a **Gmail / Send Email** node:
   - **To:** `{{$json.body.candidateEmail}}`
   - **Subject:** `Can we feature your profile? — Romega Solutions`
   - **HTML body:** the template below (the only required dynamic value is
     `confirmUrl`; `candidateName` is optional nicety).
3. Optionally return `{ "template": "talent_consent_request" }` so the app logs a
   clean template name in `candidate_history`.

## Paste-ready email template

```html
<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:520px;margin:0 auto;color:#0f172a">
  <p>Hi {{$json.body.candidateName}},</p>
  <p>
    We'd like to feature your profile in the Romega Solutions talent pool so
    potential clients can discover you. We would only show an
    <strong>anonymized</strong> profile — your <strong>first name + last
    initial, role, key skills, and general location</strong>. We never publish
    your email, phone number, or résumé.
  </p>
  <p>If you're happy for us to do this, just confirm:</p>
  <p style="text-align:center;margin:28px 0">
    <a href="{{$json.body.confirmUrl}}"
       style="background:#0a84d6;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;display:inline-block">
      Yes, feature my profile
    </a>
  </p>
  <p style="font-size:13px;color:#64748b">
    You can withdraw your consent at any time — the confirmation page has a
    one-click withdraw link, or simply reply to this email.
  </p>
  <p style="font-size:13px;color:#64748b">Thanks,<br/>The Romega Solutions team</p>
</div>
```

## What the link does

- `GET /api/public/talents/confirm/<token>` — records consent
  (`consent_status='agreed'`, `consent_method='link'`, captures click IP +
  timestamp) and shows a branded thank-you page with a withdraw link. Idempotent.
- `GET /api/public/talents/revoke/<token>` — withdraws consent, unpublishes the
  candidate, clears the token (GDPR right-to-withdraw). Idempotent.

Only after consent is `agreed` can HR flip **Publish to Talent Pool**. The public
`/api/public/talents` feed filters on `is_public_talent = true AND
consent_status = 'agreed'`.

## Deployment checklist (the "works in prod" part)

**Ticketing (Vercel):**
- `APP_BASE_URL` = public ticketing URL (so the confirm link is absolute & reachable)
- `N8N_COMMUNICATION_WEBHOOK_URL` = the Candidate Communication webhook
- `PUBLIC_APPLICATIONS_TOKEN` = shared bearer (must equal web-digital's)

**RS_Web-Digital (Vercel):**
- `TICKETING_APP_URL` = public ticketing URL (NOT localhost)
- `PUBLIC_APPLICATIONS_TOKEN` = same shared bearer as ticketing

**Local dev port collision:** both Next.js apps default to `:3000`. Run the
ticketing app on `:3000` and web-digital on another port, and point
web-digital's `TICKETING_APP_URL` at `http://localhost:3000`, e.g.:

```bash
# terminal 1 — ticketing
npm run dev                       # :3000
# terminal 2 — web-digital
PORT=3100 pnpm dev                # :3100, TICKETING_APP_URL=http://localhost:3000
```

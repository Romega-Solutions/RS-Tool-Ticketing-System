# GDPR-Consented Talent Pool — Design Spec

- **Date:** 2026-06-06
- **Status:** Implemented 2026-06-06 (end-to-end verified against live DB). n8n consent-email branch still to be wired in n8n itself — see `docs/N8N_TALENT_CONSENT.md`.
- **Repos touched:** `RS-Tool-Ticketing-System` (primary), `RS_Web-Digital` (consumer)
- **Note:** consent timestamps stored as `text` (ISO strings) to match the existing `created_at`/`updated_at` columns, not `timestamptz`.

## Context

The public Talent Pool is **already built end-to-end** and works:

- **Ticketing:** `candidates.is_public_talent` column (migration `docs/migrations/add-candidates-public-talent.sql`, applied to the live DB), a "Publish to Talent Pool" toggle on the candidate detail page, and a bearer-gated `GET /api/public/talents` that returns only showcase-safe fields (name, position, location, summary, skills, LinkedIn, rough experience years — email/phone/resume/rating/notes stripped).
- **Web-digital:** `/talent` page → `fetchPublishedTalent()` → `TalentHero` + `TalentPool` + `TalentCard` + `TalentCTA`, anonymizing the name to "First L." before render, with SEO/JSON-LD and 5-minute revalidate.

A live DB probe on 2026-06-06 found **3 candidates, 0 with `is_public_talent = true`**. So the page is empty only because nothing has been published — not because of a bug.

The gap: publishing today is a pure HR toggle with **no recorded candidate consent**. For publishing a real person's (even anonymized) profile, GDPR wants a lawful basis — consent — that is recorded and revocable.

## Goals

1. Insert a **consent gate** before publishing: a candidate can only be published once consent is recorded.
2. Consent is obtained via an **n8n email with a one-click confirm link**; clicking it records consent (timestamp + IP) — the email + click is the proof.
3. Allow an **HR manual-override** path to mark consent agreed when HR holds written proof (e.g. an email reply), recorded distinctly from a link-click for audit purposes.
4. Provide **right-to-withdraw** (erasure): a revoke link that unpublishes and clears consent.
5. Make the HR flow **simple** — one panel, state-driven primary action.
6. **Verify the full chain** to the public site and fix the "broken even when published" symptom (prod env wiring + local dev port collision).
7. Keep the public `/talent` display **unchanged** (anonymized fields only).

## Non-Goals

- No change to the public talent card layout/fields (confirmed: keep current).
- No candidate self-service portal/login.
- No authoring of the n8n workflow inside this repo — we fire the webhook and document the required n8n branch + email template.

## Data Model

Add to the `candidates` table (Drizzle `src/db/schema.ts` + a hand-written SQL migration in `docs/migrations/`):

| Column | Type | Purpose |
|--------|------|---------|
| `consent_status` | `text` not null default `'none'` | `none` \| `requested` \| `agreed` \| `revoked` |
| `consent_token` | `text` unique nullable | unguessable token (e.g. 32-byte base64url) for the confirm/revoke links |
| `consent_requested_at` | `timestamptz` nullable | when the consent email was sent |
| `consent_agreed_at` | `timestamptz` nullable | when consent was recorded |
| `consent_agreed_ip` | `text` nullable | IP captured at link click (null for manual override) |
| `consent_method` | `text` nullable | `link` (candidate click) \| `manual` (HR attestation) |

`is_public_talent` is retained. **Invariant:** `is_public_talent = true` requires `consent_status = 'agreed'`. Enforced in the publish action (and defensively in the public read endpoint).

Every consent transition is also written to the existing `candidate_history` audit log (actor, field, old → new, human note) — consistent with how `updateCandidatePublicTalent` already logs.

## Consent Flow

```
none ──(HR: Send consent email)──▶ requested ──(candidate clicks link)──▶ agreed ──(HR: Publish toggle)──▶ public
  │                                    │                                    ▲
  └────────(HR manual override: "Mark agreed")───────────────────────────┘
                                                                  agreed/public ──(candidate clicks withdraw / HR revoke)──▶ revoked (is_public_talent=false)
```

1. **HR requests consent** — candidate detail → "Talent Pool" panel → **Send consent email**:
   - generate `consent_token`, set `consent_status='requested'`, `consent_requested_at=now()`
   - fire `notifyCommunicationWebhook({ kind: 'talent_consent_request', candidateId, confirmUrl })` where `confirmUrl = ${APP_BASE_URL}/api/public/talents/confirm/<token>`
   - failure is non-fatal (status still moves to `requested`; HR sees a retry/“resend” affordance), matching existing comms behavior.
2. **Candidate confirms** — `GET /api/public/talents/confirm/<token>`:
   - validate token; set `consent_status='agreed'`, `consent_agreed_at=now()`, `consent_agreed_ip=<request ip>`, `consent_method='link'`
   - render a friendly HTML thank-you page including a "withdraw consent" link
   - idempotent: re-clicking an already-agreed token shows the same confirmation; an unknown/revoked token shows a neutral "link no longer valid" page
   - public + unauthenticated (lives under `/api`, which the proxy matcher already excludes)
3. **HR manual override** — panel button **Mark agreed (I have written consent)** behind a confirm dialog:
   - set `consent_status='agreed'`, `consent_agreed_at=now()`, `consent_method='manual'`, `consent_agreed_ip=null`
   - audit note records the HR user as attester.
4. **HR publishes** — the existing **Publish to Talent Pool** toggle is enabled **only when `consent_status='agreed'`**; flipping on sets `is_public_talent=true`.
5. **Withdraw / erasure** — `GET /api/public/talents/revoke/<token>` (or HR "Revoke" button): set `consent_status='revoked'`, `is_public_talent=false`, clear `consent_token`. Profile disappears from `/talent` on next revalidate (≤5 min).

## API Surface (ticketing)

- **New:** `GET /api/public/talents/confirm/[token]` — records link consent, returns HTML page. Public.
- **New:** `GET /api/public/talents/revoke/[token]` — records withdrawal, returns HTML page. Public.
- **Changed:** `GET /api/public/talents` — add defensive `consent_status='agreed'` filter alongside `is_public_talent=true`.
- **Server actions** (in `recruiting/candidates/actions.ts`): `requestTalentConsent(id)`, `markTalentConsentAgreed(id)` (manual), `revokeTalentConsent(id)`; `updateCandidatePublicTalent` gains the `agreed` precondition.

## n8n Integration

- Extend `CommunicationEvent` in `src/lib/n8n.ts` with `{ kind: 'talent_consent_request'; candidateId: number; confirmUrl: string }`.
- The n8n "Romega ATS — Candidate Communication" workflow needs **one new branch** keyed on `kind === 'talent_consent_request'` that emails the candidate the consent request containing `confirmUrl`. Workflow lives in n8n, not this repo; we ship the payload contract + a paste-ready email template in `docs/`.
- Env: reuses existing `N8N_COMMUNICATION_WEBHOOK_URL` and `APP_BASE_URL`. No new env vars on the ticketing side.

## HR UX (must be easy)

One "Talent Pool" panel on the candidate detail page, state-driven:

- **none** → primary: *Send consent email*; secondary: *Mark agreed (have written consent)*
- **requested** → status chip "Consent requested · {date}"; primary: *Resend consent email*; secondary: *Mark agreed*
- **agreed** → status chip "Consent agreed · {date} · {link|manual}"; primary: *Publish to Talent Pool* toggle; secondary: *Revoke*
- **revoked** → status chip "Consent withdrawn · {date}"; primary: *Send consent email* (re-request)

The existing confirm dialog copy is updated to reflect consent-based publishing.

## Public Site (web-digital) + Verification

- Display unchanged. The only code change is confirming `fetchPublishedTalent()` maps correctly against the (unchanged) public payload.
- **Verification (the "broken when published" item):**
  1. Publish one test candidate through the full flow and confirm it renders on `/talent`.
  2. Audit **prod Vercel env** on both projects:
     - ticketing: `PUBLIC_APPLICATIONS_TOKEN`, `N8N_COMMUNICATION_WEBHOOK_URL`, `APP_BASE_URL`
     - web-digital: `TICKETING_APP_URL` (must point at the deployed ticketing app), `PUBLIC_APPLICATIONS_TOKEN` (must equal ticketing's)
  3. Fix local dev port collision: both apps default to :3000. Document running web-digital on an alternate port and setting `TICKETING_APP_URL` to the ticketing dev URL so HR can test locally.

## Analytics (done in this branch)

`@vercel/analytics` and `@vercel/speed-insights` installed in web-digital; `<Analytics />` + `<SpeedInsights />` added to `src/app/layout.tsx`; build verified. Cookieless/privacy-friendly — consistent with the GDPR posture. Data populates after prod deploy.

## GDPR Considerations

- Lawful basis = **consent**, recorded with timestamp + (for link) IP, and method (link vs manual).
- **Data minimization**: only showcase-safe, anonymized fields ever reach the public site.
- **Right to withdraw / erasure**: one-click revoke unpublishes and clears the token.
- **Right to be informed**: the consent email states exactly what will be shown ("first name + last initial, role, skills, location") and where.
- Audit trail in `candidate_history` for every transition.

## Parallel-Agent Execution Plan (as requested)

Shared dependency first, then fan out:

- **Step 0 (sequential, blocking):** data model + API contract — schema columns, migration, the `CommunicationEvent` shape, and the confirm/revoke route signatures. Everything else depends on this.
- **Stream A — ticketing backend:** migration apply, server actions, confirm/revoke API routes, public endpoint gating, n8n event.
- **Stream B — ticketing HR UI:** Talent Pool panel, gated publish toggle, status chips, dialog copy.
- **Stream C — web-digital + verification:** fetch-mapping check, confirm/withdraw page polish, env/prod audit, local-port doc, n8n payload + email-template doc.

B and C depend on Step 0's contract but not on each other, so they can run in parallel. **Honest assessment:** the total size is modest; sequential A→B→C is fine and lower-overhead. Parallelize only if we want wall-clock speed.

## Rejected Alternatives

1. **HR-only attestation, no candidate involvement** — weakest proof; rejected (we keep manual override only as a *secondary* path with explicit attestation).
2. **Candidate self-service portal** — overkill for the use case.
3. **Auto-publish all candidates** — GDPR-noncompliant; rejected outright.

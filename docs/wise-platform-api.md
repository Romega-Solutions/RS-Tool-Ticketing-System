# Wise Platform API — Reference

> Compiled from the Wise Platform docs (`docs.wise.com/guides` and
> `/api-docs`). Endpoints and behavior reflect the docs as of May 2026 —
> always confirm against the live API Reference before building.
> Source links are listed at the bottom.

---

## 1. What Wise Platform Is

Wise Platform's API lets banks, financial institutions, and enterprise
businesses embed international transfers, card issuing, multi-currency
accounts, and incoming-payment collection into their own products.

Integration requires a **direct partnership** with Wise (no self-serve
signup). An implementation team helps define the integration model and
scope. Partner accounts are scoped to specific functions — not every
partner gets every capability.

### Core functions

| Function | Covers |
|----------|--------|
| **Send money** | Quotes → recipients → transfers → funding (payout / remittance). |
| **Manage balances** | Multi-currency accounts; hold, transfer, and convert balances. |
| **Issue cards** | Physical and digital card issuing and management. |
| **Receive money** | Inbound SWIFT payments into a Wise balance; local collection without intl. fees. |

---

## 2. Integration Models

The model determines onboarding, authorization, and how transfers are
created. A partner can implement more than one.

| Model | For whom | Account ownership | Transfer endpoint used |
|-------|----------|-------------------|------------------------|
| **Embedded** | Regulated FIs / fintechs offering Wise inside their own UI. | Partner's customers each have a linked Wise account. | Standard transfers |
| **Enterprise** | Large businesses moving **their own funds** (payroll, vendors). | Single partner-owned Wise business account. | Standard transfers (`POST /v1/transfers`) |
| **Correspondent** | Regulated FIs processing cross-border payments for their customers. | Partner holds the account; customers are "originators" with no Wise account. | Third-party transfers (`POST /v2/profiles/{profileId}/third-party-transfers`) |

---

## 3. Authentication & Security

Wise Platform uses **OAuth 2.0** for all partner accounts. During
onboarding Wise provides a **Client ID**, **Client secret**, Developer Hub
access, and a registered **redirect URL**.

### Token types

| Token | Use | Scope |
|-------|-----|-------|
| **Client credentials token** | Application-level requests — unauthenticated quotes, application webhooks. | App |
| **User access token** | Profile-level requests — creating recipients, submitting transfers, tracking status. | Profile |
| **Refresh token** | Obtain new user access tokens without re-authenticating the user. | — |

All grant types use `POST /oauth/token` with HTTP Basic auth
(`client_id` : `client_secret`).

### Security requirements (mandatory practices)

- Never expose credentials/tokens in client-side code, logs, or URLs.
- Store credentials in a secrets manager.
- Keep **separate sandbox and production credentials**.
- Encrypt refresh tokens at rest.
- Rotate client secrets periodically.
- Request **minimal required scopes**.
- Revoke credentials immediately on breach.

### Optional hardening

- **mTLS** — stronger security for API calls and webhooks.
- **JOSE** — signing/encryption keys for tamper-proof calls.
- **SCA & 2FA** — strong customer auth and two-factor.

---

## 4. Environments

Two environments, with separate credentials each:

| Environment | Purpose | OAuth base URL |
|-------------|---------|----------------|
| **Sandbox** | Build & test without affecting production. Non-live but realistic rates. | `https://api.wise-sandbox.com/oauth/token` |
| **Production** | Live, real-money requests. Final deployment stage. | `https://api.wise.com/oauth/token` |

- **mTLS (Sandbox)** endpoint base: `https://api-mtls.wise-sandbox.com`
- Sandbox caveat: the `FLOATING` quote `rateType` cannot be tested in
  Sandbox; full bank validation of recipients only happens in Production.

---

## 5. Send Money — The Core Flow

Four logical stages (an optional unauthenticated quote precedes them for
display purposes). Step 4's endpoint differs by integration model.

```
(0) Unauthenticated quote   POST /v3/quotes                         [optional, display only]
 1. Authenticated quote     POST /v3/profiles/{profileId}/quotes     → quoteId
 2. Recipient               POST /v1/accounts                        → recipientId
 3. Transfer                POST /v1/transfers                       → transferId
                            (correspondent: POST /v2/profiles/{profileId}/third-party-transfers)
 4. Fund transfer           POST /v3/profiles/{profileId}/transfers/{transferId}/payments
```

> Before step 3, **update the quote** with the recipient so fees, delivery
> estimate, and payout network are accurate.

### 5.1 Quotes

A quote defines the currency pair, amount (send or receive), and parties;
it returns exchange rate, fees, delivery estimate, and funding methods.

| Aspect | Unauthenticated (`POST /v3/quotes`) | Authenticated (`POST /v3/profiles/{profileId}/quotes`) |
|--------|-------------------------------------|--------------------------------------------------------|
| Auth | Optional, no profileId | Required (OAuth 2.0), tied to a profile |
| Creates transfers | No | Yes (returns quoteId) |
| Rate locking | No | Yes |
| Rate limits | Higher | More restrictive |
| Purpose | Marketing / illustration | Real transactions |

- Mid-market rate is **locked on authenticated quote creation, valid ~30
  minutes**.
- `fee` object = summarized charges (Wise fees, taxes, discounts, partner
  fees); `price` object = itemized line items.

### 5.2 Recipients

The recipient (beneficiary) receives the funds. Either reuse an existing
recipient (List Recipients, filter by currency) or create a new one.

- **Account Requirements Dynamic Forms API** is a **must** for all
  integrations — required fields change by currency pair, account
  location, and amount. Fetch the form for the specific quote, collect
  fields, then submit via `POST /v1/accounts` → `recipientId`.

**Two-tier checking:**

- **Validation** — immediate schema/format check on `POST /v1/accounts`.
- **Verification** — confirms the account exists and details match the
  destination bank. Supported for: **CNY, EUR** (Enterprise/Embedded SEPA
  payouts), **IDR, INR, KRW**.

Outcomes in `confirmations.outcomes[]`:

| Status | Meaning |
|--------|---------|
| `SUCCESS` | Recipient created, ready to use. |
| `FAILURE` / `PARTIAL_FAILURE` | Blocking — creation prevented. |
| `COULD_NOT_CHECK` | Non-blocking. |

For non-blocking outcomes with `requiresCustomerAcceptance: true`, call the
confirmation `PATCH` endpoint after customer approval to unblock.

### 5.3 Transfers

Before creating:

1. **Validate transfer requirements** via the transfer-requirements
   endpoint — mandatory fields are dynamic per currency/region and have
   embedded validation rules. There is **no fixed field list** outside the
   endpoint response.
2. **Update the quote** with final payment + recipient details.

Three creation types (only one applies per integration; unavailable types
return **403 Unauthorized**):

| Type | Description | Endpoint |
|------|-------------|----------|
| **Standard API transfer** | From your account or on behalf of customers. | `POST /v1/transfers` |
| **Third-party API transfer** | Customer transfers under your financial license (correspondent). | `POST /v2/profiles/{profileId}/third-party-transfers` |
| **SWIFT network transfer** | Bank-to-bank via SWIFT/BIC. | (SWIFT-specific) |

### 5.4 Funding

`POST /v3/profiles/{profileId}/transfers/{transferId}/payments` — initiates
the actual payment. All requests require the initiating account's
`profileId`.

### 5.5 Correspondent variation

Step 3 becomes a **third-party transfer including originator details**:
`POST /v2/profiles/{profileId}/third-party-transfers` (the customer is the
originator with no Wise account).

---

## 6. Status & Webhooks

Asynchronous status via webhooks (Enterprise example events):

| Event | Tracks |
|-------|--------|
| `payment-instruments#status-change` | Payment instrument lifecycle. |
| `payment-instruments-payins#status-change` | Payin: `PROCESSING` → `CONFIRMED` → `SETTLED` / `FAILED`. |
| Payment reversal | Chargebacks requiring customer dispute resolution. |

---

## 7. KYC / KYB

- **Partners** verified by Wise during contracting/onboarding.
- **Partner's customers** must be verified before Wise processes
  transactions for them.
- Responsibility split: **Wise-performed KYC** (Wise verifies) vs.
  **Partner-performed KYC** (regulated partner verifies). Decided with the
  implementation team.

---

## 8. Integration Support

- Wise technical support for API integration & troubleshooting (partner +
  business accounts).
- Enterprise support team for operational assistance with customer
  transactions.
- See the Wise Platform support guide for contact methods & FAQs.

---

## Open Items / Not Yet Documented Here

- **Receive money**, **Issue cards**, **Manage balances** detailed flows —
  overview only above; pull dedicated guides when needed.
- **Open Banking** endpoints.
- **Versioning** / **Errors** / **Language Support (SDKs)** — not yet
  captured.
- The original ask mentioned an **"MCP setup"** — nothing in the Wise docs
  references MCP. Likely a misnomer; confirm what was intended before
  documenting it.

---

## Sources

- [Welcome / API portal](https://docs.wise.com/) ·
  [Guides](https://docs.wise.com/guides)
- [Send Money flow](https://docs.wise.com/api-docs/guides/send-money)
- [Quotes](https://docs.wise.com/guides/product/send-money/quotes) ·
  [Recipients](https://docs.wise.com/guides/product/send-money/recipients) ·
  [Transfers](https://docs.wise.com/guides/product/send-money/transfers)
- [Enterprise send money](https://docs.wise.com/guides/product/send-money/use-cases/enterprise/send-money) ·
  [Correspondent send money](https://docs.wise.com/guides/product/send-money/use-cases/correspondent/send-money)
- [Auth & security](https://docs.wise.com/guides/developer/auth-and-security) ·
  [Sandbox & production](https://docs.wise.com/guides/developer/sandbox-and-production)
- [Partner accounts / KYC](https://docs.wise.com/guides/product/kyc/partner-accounts)

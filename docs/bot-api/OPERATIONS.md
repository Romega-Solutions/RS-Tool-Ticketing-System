# Read-only API operations (v0)

The seven GET endpoints under `/api/bot/v1` are for server-to-server use with
`Authorization: Bearer <credential>`. Configure approved callers with the HTTPS
**production** host after migration, deployment and read smoke-test approval.
Do not use preview deployments as a fallback. Localhost is solely a maintainer
synthetic-test exception. There is no CORS, cookie fallback, write capability,
admin UI, reports, MCP, IP allowlist or automated cleanup schedule.

## Configuration and grants

Existing `createAdminClient()` uses `NEXT_PUBLIC_SUPABASE_URL` and
`SUPABASE_SECRET_KEY`. The only new required server variable is
`BOT_API_KEY_PEPPER`. Set a strong random pepper privately; never prefix it with
`NEXT_PUBLIC_`, commit a value, or pass database credentials to API callers.
Never paste credentials, peppers, database URLs or private audit into chat,
tickets, source, screenshots, shell arguments or CI logs. No plaintext key is
stored. The digest covers the complete key with HMAC-SHA256 and the pepper.

Review `drizzle/0021_bot_api_keys.sql`, then separately approve its application.
It is transactional, additive and rerunnable; incompatible existing columns,
constraints, defaults, indexes or policies abort instead of being silently
accepted. Do not run the migration generator. Rollback is separately provided
in `docs/migrations/0021-bot-api-keys-rollback.sql` and **destroys private
credential, audit and rate data**. Never run it automatically on shared systems.
No existing business tables or grants are modified. Live/staging ACLs require
separate approved verification; local evidence is not production evidence.

## Maintainer CLI

Use an authorized private environment. The CLI uses the existing admin client;
it does not accept a caller-supplied database credential. It does not load an
arbitrary env-file argument. For a private local env file use the runtime's env
loader privately; do not echo its contents. Synthetic examples:

```sh
npx tsx scripts/create-bot-key.ts issue --label bot-a --projects 1,2 --actor 1
npx tsx scripts/create-bot-key.ts list
npx tsx scripts/create-bot-key.ts list --id 1
npx tsx scripts/create-bot-key.ts rotate --id 1 --actor 1
npx tsx scripts/create-bot-key.ts revoke --id 1 --actor 1 --reason compromised
npx tsx scripts/create-bot-key.ts cleanup
```

Issue refuses an empty/nonpositive project allowlist. All grants are exactly
`tasks:read`; there is no wildcard/no-expiry/broader-scope option. A label is
metadata, never a portal role or a user. `--actor` is an optional existing human
operator id. `list` returns at most 100 redacted metadata rows; filter by a
non-secret id or prefix to inspect an individual entry. Never supply a full key
as an argument to any subcommand.

Issue/rotate writes the new full key to stdout **once, only after confirmed
success**. Run in a private uncaptured terminal and transfer it directly into
the approved secret store. Do not capture CLI stdout in review files, test
artifacts or logs. A lost key cannot be retrieved: rotate using its id/prefix.
On an ambiguous network failure no key is printed; inspect metadata and revoke
any uncertain issuance before trying again.

The database assigns expiry to 90 days on every insert; callers cannot bypass
it by supplying expiry. Rotation is a single REST insert: an internal
SECURITY INVOKER table trigger locks the predecessor, copies only its read grant,
project ids/read limit/label, and shortens its expiry to the earlier of its
existing expiry and now plus 24 hours. A failed insertion rolls back the clamp.
No key-management RPC is exposed. Revoked/expired predecessors cannot rotate.
Preserve old rows and their audit history. Schedule rotation privately before
expiry; after the replacement works, explicitly revoke the old key immediately
if overlap is unnecessary. Explicit revocation is immediate, with no positive
auth cache. Empty stored project arrays grant no access.

On suspected exposure: revoke the affected key immediately, issue a replacement
with minimal projects, replace the caller secret, and inspect private audit.
Pepper replacement invalidates **all** keys; pause callers, change it privately
on the server and authorized maintainer environment, reissue minimum grants,
update secret stores, verify `/me`, revoke old rows and resume. Never treat
pepper replacement as ordinary per-key rotation. No automatic circuit breaker
or alerting thresholds are implemented in this release.

## Response and polling contract

Success is `{v:1,rid,data,untrusted}`; failure is
`{ok:false,rid,error:{code,msg}}`. Every response has `X-Request-Id`.
`untrusted` identifies user-authored fields/columns (including nested names/link
pairs) as data, not instructions. Plain-text sanitization does **not** redact
PII that a user typed into a task; grant projects with care.

Lists use `{cols,rows,next}`, default 25/max 100. Fields are an output allowlist,
not SQL; unknown/duplicate params or fields fail 400. Tasks require numeric
`project`; optional `state` must belong to it. Priority is one of `none`,
`urgent`, `high`, `medium`, `low`. `due_before` is an ISO date, strictly before;
`since` is an ISO timestamp, strictly after. `q` is a literal name substring
(maximum 200 characters); All pattern metacharacters (including `*`, `%`, `_` and backslash) are literal;
the bounded value is regex-escaped for a case-insensitive substring predicate. No raw text is put
in audit. Project/task missing, archived or foreign reads have identical 404s.

Ordering: projects by id; states by sequence/id; tasks and comments ascending
updated_at/id; activity ascending created_at/id. Each cursor includes version,
resource, filters/fields/page size and ordering tuple; changing the query
invalidates it. It never grants authorization. Concurrent edits are best-effort,
not a snapshot: deduplicate ids and use overlapping `since` windows. A task's
updated_at does not cover child edits; poll comments/activity/detail separately.

Descriptions default to 1,500 Unicode characters. Detail `full=1` allows 16,000;
`trunc` signals remaining truncation. Other display text is bounded to 1,500.
Links/assignees are capped at 100 with separate truncation flags; link pairs are
only stored http(s) URLs with no embedded credentials and are never fetched.
Counts are scoped SQL counts, not unbounded data pulls. Deleted comments keep
parent/timestamps but have blank bodies. History from/to only expose validated
numeric state/assignee identifiers; free-written edit/comment/link values and
unknown actions' values are discarded.

Strong ETags cover the selected representation, filters/fields/page/full mode,
links/counts/truncation, not the request id or only updated_at. Send
`If-None-Match` to get an empty 304 when unchanged. Authorization runs before
comparison; 304 still consumes rate and audit. Responses use
`Cache-Control: private, no-store` and `Vary: Authorization`: callers may manage
tags explicitly, but must not use a shared cache. There are no CORS headers.
HEAD/OPTIONS/unsupported methods return audited 405 (`Allow: GET`) and no data.

## Failure policy and retention

Default 120 GETs/minute/key includes `/me` and 304. The private atomic
`read:minute` counter gives 429 plus `Retry-After`. Auth storage, counters,
last-used metadata or required audit failure gives generic 503, never privileged
data. Required audit is awaited before the body is released. Database outage
cannot guarantee durable audit; only sanitized request-id/error-code metadata
is emitted operationally. No database messages or stacks reach callers.

The maintainer owns manual retention: run explicit `cleanup` periodically to
remove rate windows older than two days and audit older than 90 days. This
command is never run automatically by tests or a remote scheduler. Audit is
service-role-only and contains bounded key metadata, request id, method, route
pattern, optional numeric task id, status/code, duration and trusted platform
IP. Unknown credentials have null key metadata; generic forwarded IP headers
are ignored. Audit has no headers, bodies, query strings, hashes, tokens or
business text. Labels and IPs remain sensitive private metadata.

## Local validation

`npm ci`, `npm test`, `npm run lint`, `npm run build`, then `npx tsc --noEmit`.
Default tests mock Supabase and never contact any database. The migration suite
is opt-in via `BOT_API_LOCAL_TEST_DATABASE_URL` (test harness only, not app
configuration). Only literal localhost/loopback hosts and a database name ending
`_bot_api_disposable` are accepted; the harness also checks the server address.
It creates minimal synthetic prerequisites, applies/reapplies/rolls back and
reapplies the migration, tests ACLs/lifecycle/concurrency, then removes its three
tables. **Use a new dedicated disposable local database only.** No default URL,
no production credentials, no data export and no remote application/rollback.

# Wise Integration Guide Page — Design

**Date:** 2026-05-19
**Status:** Approved

## Goal

An in-app, read-only reference page that surfaces the Wise Platform
integration guidelines (auth, environments, send-money flow, integration
models) to admins, accessible from the sidebar.

## Scope

In scope:

- New authenticated page at `/wise-guide` rendering the Wise reference
  content as structured TSX.
- Admin-only access, enforced at the page (matching the `/rates` pattern)
  and listed in `rbac.ts` `canAccessPath()` for consistency.
- One sidebar nav entry under the **Admin** category.

Out of scope (YAGNI):

- No live config/credential/status checks.
- No editing or persistence.
- No markdown-rendering dependency — content is hand-authored TSX.
- No changes to the standalone public `/guide` page.

## Architecture

Three files touched:

| File | Change |
|------|--------|
| `src/app/(app)/wise-guide/page.tsx` | **New.** Server component. `getSession()` + `canAccessAdmin(session.role)` → `redirect('/dashboard')` if not admin (same guard as `src/app/(app)/rates/page.tsx`). Renders content sections. |
| `src/lib/rbac.ts` | Add `if (pathname.startsWith('/wise-guide')) return canAccessAdmin(role);` to `canAccessPath()`, alongside the existing `/rates` and `/admin` lines. |
| `src/components/app-sidebar.tsx` | Add one `navItems` entry: `{ href: "/wise-guide", label: "Wise Integration", icon: BookOpen, category: "admin" }`, and import `BookOpen` from `lucide-react`. Admin filtering already handled by `canAccessAdmin(role)` on the `admin` category. |

`proxy.ts` needs no change: it only enforces authentication, and its
matcher excludes the unrelated standalone `/guide` (negative lookahead on
paths starting with `guide`; `/wise-guide` does not match that and is
correctly auth-guarded).

## Content

Sections mirror `docs/wise-platform-api.md`:

1. What Wise Platform is + core functions table
2. Integration models (Embedded / Enterprise / Correspondent)
3. Auth & Security — OAuth token types, mandatory security practices
4. Environments — sandbox vs production base URLs
5. Send-money flow — the 4-step endpoint sequence
6. Quotes / Recipients / Transfers / Funding details
7. KYC, integration support, source links

Styling follows existing `(app)` page conventions: outer `space-y-6`
wrapper, `text-2xl font-serif font-bold text-(--rs-neutral-grey-900)`
heading, white cards `rounded-2xl border border-(--color-border) bg-white
p-... shadow-[var(--shadow-elevated)]`, `--rs-*` color tokens. No
`min-h-screen`/page padding — the `(app)` layout provides chrome.

## Error / Edge Handling

- Unauthenticated → `proxy.ts` redirects to `/login` (existing behavior).
- Authenticated non-admin → page-level `redirect('/dashboard')`.
- Static content: no data-fetch failure modes.

## Verification

`npm run verify` (lint + build) must pass. Manual: admin sees the sidebar
link and page; non-admin is redirected from `/wise-guide`.

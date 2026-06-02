# In-App Help & Guide Page — Design

**Date:** 2026-06-03
**Status:** Approved (pending spec review)

## Problem

The only guide today is the **public, pre-login** `/guide` ("Getting Started" — how
to sign up, roles, features). Signed-in users have no in-app, do-this-then-that
reference. New users (and admins) need a step-by-step guide they can open from
inside the app that explains how to actually *use* and *set up* each area.

## Decisions (confirmed)

- **Scope:** the whole app, two audiences in one page — regular-user how-tos plus a
  separate **Admin** section that renders only for admins.
- **Placement:** a new in-app page at **`/help`** inside the `(app)` route group, with
  a sidebar link visible to all roles. The existing public `/guide` is left as-is.
- **Stack:** server component, role-aware. No client JS. Reuses the RS design system.

## Design language (UI/UX)

Follows the existing `/guide` visual vocabulary so it feels native:

- **Palette:** `--rs-primary-*` (blue), `--rs-accent-*` (orange) for the admin
  accent, `--rs-neutral-grey-*` for surfaces/text. **No** new colors, **no** AI
  purple/pink gradients (anti-pattern).
- **Type:** Merriweather (`font-serif`) headings, Source Sans 3 body — already loaded
  via `next/font` in the root layout; nothing to add.
- **Surfaces:** `rounded-2xl` white cards, soft shadow (`shadow-[var(--shadow-elevated)]`),
  `border-(--color-border)`. Numbered step circles with connectors (reuse the
  `/guide` "How It Works" pattern).
- **Pattern (from FAQ/Documentation):** a prominent **in-page section nav** so users
  jump straight to a topic; scannable, categorized sections; an **escalation path**
  at the end ("still stuck? contact a lead/admin").

### UX rules applied
- **Smooth anchor scrolling**: anchor links to `#section` ids; each section gets
  `scroll-mt-24` so the sticky nav doesn't overlap the heading. `scroll-behavior:
  smooth` (guarded by `prefers-reduced-motion`).
- **Minimal motion**: at most a single subtle entrance (reuse `animate-auth-enter`),
  disabled under `prefers-reduced-motion`.
- **A11y**: body text at `--rs-neutral-grey-600`+ (≥4.5:1), visible `focus-visible`
  rings on every link, `cursor-pointer`, real `<a>`/`next/link` for navigation,
  ordered lists (`<ol>`) for steps (semantic + screen-reader order), section headings
  as `<h2>`/`<h3>`. Responsive at 375 / 768 / 1024 / 1440.

## Page structure

`src/app/(app)/help/page.tsx` — server component.

```
getSession() → { name, role }; isAdmin = canAccessAdmin(role)   // redirect to /login if no session
```

1. **Header** — `Help & Guide` (serif h1), one-line intro, and the viewer's role
   badge (reuse `roleLabel(role)`).
2. **Section nav** — a horizontal row of pill links (sticky on desktop, `top-…`):
   Daily flow · Clock & overtime · My Tasks · My Learning · Weekly reports ·
   *Admin tools* (last pill only when `isAdmin`). Anchor links to section ids.
3. **Your daily flow** — numbered step strip (connectors): Clock in → Work *My
   Tasks* → Continue *Learning* → Submit *Weekly Report* → Clock out.
4. **How-to cards** (one per area; icon header + `<ol>` of concrete steps + a
   `next/link` to the live page):
   - **Clocking in & out + overtime** — clock in/out from the sidebar widget; the
     timer turns amber in overtime; **15h/week cap, no per-day limit**; at the cap
     you're auto-clocked-out and click **Request overtime** for admin approval; once
     approved you can clock back in until end of day.
   - **My Tasks** — where work items live, statuses, updating progress.
   - **My Learning** — open a course → finish each lesson (watch videos to the end)
     → pass any quiz → certificate auto-issues at 100% (see *My Certificates*).
   - **Weekly Reports** — generate/submit the end-of-week report.
5. **Admin tools** *(only if `isAdmin`)* — visually distinct block (accent/Shield
   header), numbered how-tos + links:
   - **Manage users** (`/admin/users`) — invite/edit, set role/team.
   - **Set up a course** (`/admin/learning` → *New course* → set scope/department →
     add text/video lessons → optional quiz → **Publish**; scope auto-assigns by
     role/team).
   - **Approve overtime** (`/admin/overtime`) — review pending requests, Approve/Deny;
     approval grants OT to end of the Manila day.
6. **Escalation footer** — "Still stuck? Message your team lead or an admin," plus
   quick links to the most-used pages.

**Content** lives in typed arrays at the top of the file (same convention as
`/guide`) so sections are easy to edit; the admin array is only mapped when `isAdmin`.

## Sidebar wiring

Add one entry to `navItems` in `src/components/app-sidebar.tsx`, category `"main"`
(shown to all roles, no RBAC change since `canAccessPath` default-allows `/help`):

```ts
{ href: "/help", label: "Help & Guide", icon: LifeBuoy, category: "main" }
```

Placed as the last `main` item (after *Weekly Reports*).

## Out of scope
- Search box / scroll-spy active-section highlighting (would need client JS) — anchor
  links only for now.
- Editable/CMS-driven content (content is in-code).
- Changes to the public pre-login `/guide`.
- Unit tests: the page is static presentational content with a single `isAdmin`
  branch (consistent with the untested existing `/guide`); verified via build + lint
  + a visual pass.

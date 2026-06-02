# Org Chart Photos Everywhere — Design

**Date:** 2026-06-01
**Status:** Approved (Approach A)

## Problem

Org chart photos (`https://tools.romega-solutions.com/org-chart`, 20/26 people have one,
public image files) only render on the user's own **Profile** card. Every other
person-view in the app draws generated colored initials and never queries the org
chart, so "show each person's photo" was never built outside Profile. The local
`users` table has no photo column.

Reconciliation (read-only, 2026-06-01): 19 active app users → **13 matched the org
chart, all 13 have a photo**; 6 unmatched are demo/seed accounts. Duplicate accounts
(Ken ×4, Mark ×2, Eliza ×2) exist but cleanup is **out of scope** (kept separate).

## Approach A (chosen)

A live, server-side **cached photo resolver** merged into the existing list APIs +
one shared avatar component. Mirrors the repo's existing `getCanonicalTeams()`
5-minute in-memory cache pattern. No DB migration, always fresh, degrades to
initials when the org chart is unreachable.

### New code (`src/lib/orgchart.ts`)
- `pickPhoto(active, { name?, email? }) → string | null` — **pure**, exported,
  unit-tested. Matching mirrors `lookupPerson`: email-exact → name-exact →
  first+last token. Returns the resolved absolute photo URL or null.
- `getCachedPeople()` — 5-min in-memory cache of `fetchPeople()` (only caches
  non-empty results so a transient failure doesn't pin an empty list).
- `getPhotoResolver()` — builds indexes once, returns a closure
  `(person) => string | null` for mapping a whole list cheaply.

### Shared component (`src/components/person-avatar.tsx`)
`<PersonAvatar name photoUrl? size className? />` — client component. Renders the
photo; on load error (or no URL) falls back to deterministic colored initials.
Replaces the three copy-pasted initials implementations (attendance, live,
who's-in) with one consistent treatment.

### Data flow / touch points
| Surface | Wiring |
|---|---|
| Attendance / team list | `/api/attendance` selects `email`, adds `photoUrl` to week `users` + month `summary`; `attendance-client` `MemberAvatar` → `PersonAvatar` |
| Who's-In / Live | `photoUrl` added to `PresenceUser`; resolved at clock-in (`clock-in/route`, `presence/route`) and on DB hydration (`presence/stream`, `presence/live`); `live/page` + `who-is-in-panel` render `PersonAvatar` |
| Sidebar (self) | `layout.tsx` resolves session user's photo, passes to `AppSidebar`; footer card gains an avatar |
| Onboarders | detail page avatar resolves by name + `personal_email` (mostly initials — onboarders are pre-employment, not on the org chart yet) |

### Fallbacks
- No match / photoless person / org chart down → colored initials (unchanged UX).
- Caching keeps per-request cost ~0 after warmup; fully graceful if the org chart
  is offline.

### Out of scope
- Duplicate/demo account cleanup (documented list handed off separately).
- Storing a `photo_url` column / sync job (Approach B — rejected: migration +
  staleness for data that rarely changes).

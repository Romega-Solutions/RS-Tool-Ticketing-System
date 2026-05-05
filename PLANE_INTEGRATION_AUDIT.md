# Plane.so Integration — Audit & Masterplan

**Date:** 2026-05-05  
**Auditor:** Claude Code

---

## 1. Current State

### What exists today

| Component | Status | Notes |
|-----------|--------|-------|
| Python report script (`report-script/generate_report.py`) | Working | Fetches Plane data → generates `.xlsx` |
| Python member checker (`report-script/check_members.py`) | Working | Lists workspace members |
| Next.js API routes (`/api/reports/*`) | Working | Shells out to the Python script |
| Dashboard page | Placeholder | 100% hardcoded data |
| My Tasks page | Placeholder | Static text only |
| Projects/[id] page | Placeholder | Static text only |
| Attendance page | Unknown | Not reviewed |

### How data flows right now

```
User clicks "Generate Report"
  → POST /api/reports/generate
  → execFileAsync(python3, generate_report.py, --user [username])
  → Python hits Plane REST API
  → Saves .xlsx to report-script/reports/
  → Next.js returns saved path
```

Everything live in the UI is **fake hardcoded data**. Only report generation hits the real Plane API.

---

## 2. Audit Findings — Problems to Fix

### CRITICAL

#### 2.1 Deprecated `/issues/` endpoint
**File:** `report-script/generate_report.py:123`  
**File:** `report-script/check_members.py:38`

The script calls `/api/v1/workspaces/{slug}/projects/{id}/issues/`. Plane deprecated this endpoint — support ended **March 31, 2026**. The replacement is `/api/v1/workspaces/{slug}/projects/{id}/work-items/`.

```python
# Current (BROKEN in production)
def get_issues(self, project_id: str, params: dict | None = None) -> list[dict]:
    data = self._get(f"/projects/{project_id}/issues/", params=params)

# Must be
def get_issues(self, project_id: str, params: dict | None = None) -> list[dict]:
    data = self._get(f"/projects/{project_id}/work-items/", params=params)
```

#### 2.2 No pagination — data is silently truncated
**File:** `report-script/generate_report.py:123-126`

Plane's API returns max 100 items per page using cursor-based pagination. `get_issues()` makes a single request and returns only the first page. If a project has >100 issues, tasks are **silently missing** from reports.

```python
# Current — stops at page 1
def get_issues(self, project_id: str, params: dict | None = None) -> list[dict]:
    data = self._get(f"/projects/{project_id}/work-items/", params=params)
    return data.get("results", data) if isinstance(data, dict) else data

# Must loop through all pages using next_cursor
```

The pagination response shape is:
```json
{
  "results": [...],
  "next_cursor": "value:offset:0",
  "prev_cursor": "...",
  "next_page_results": true,
  "total_results": 247
}
```

#### 2.3 No Plane API client in Next.js — zero live data in the UI
The Next.js app has no TypeScript Plane client. Every page with live data is stubbed. The only path to Plane data is the subprocess shell-out, which is:
- Slow (Python startup overhead)
- Fragile (depends on venv, python3 path resolution)
- Unusable for interactive page loads (180s timeout on the generate route)

---

### HIGH

#### 2.4 No rate limit handling
**File:** `report-script/generate_report.py:109-113`

Plane limits to **60 requests/minute**. The script hits one endpoint per project (states + issues), so with many projects it can 429. No retry logic exists.

#### 2.5 `PLANE_PROJECT_SLUG` undocumented in `.env.example`
**File:** `report-script/.env.example`

The script supports `PLANE_PROJECT_SLUG` filtering but it's not in `.env.example`, so it's invisible to any new developer.

#### 2.6 `generate_report.py` uses `--user username` but the username may not match Plane display names
**File:** `src/app/api/reports/generate/route.ts:68`

The API passes `--user username` (the DB login name, e.g., `ken`). The script matches by `display_name`, `username`, `name`, or `email`. If no Plane member has `ken` in any of those fields, the report is generated for zero members with no error.

#### 2.7 Report saved to local disk — lost on server restart / not downloadable in production
**File:** `report-script/generate_report.py:599-645`

Reports are saved to `report-script/reports/` on the local filesystem. In any containerized or serverless deployment, this directory won't persist. The download route reads from the same local path.

---

### MEDIUM

#### 2.8 No caching — every page load hits Plane API
When the Next.js Plane client is built, it will need caching. Plane issues don't change every second; polling is wasteful and hits rate limits.

#### 2.9 Status mapping is fragile
**File:** `report-script/generate_report.py:46-64`

`STATUS_MAP` hardcodes Plane status group names. Plane allows custom statuses per project. The `build_state_group_lookup` function handles this partially, but the fallback keys (`"backlog"`, `"todo"`, etc.) assume Plane's default names.

#### 2.10 `filter_completed_this_week` falls back to `updated_at`
**File:** `report-script/generate_report.py:296-309`

If `completed_at` is null, the script uses `updated_at` as a proxy for completion date. A task updated (not completed) this week can incorrectly appear in Key Accomplishments.

---

## 3. Masterplan — How to Fix It Properly

### Phase 1 — Unbreak the existing Python script (1–2 days)

These fixes unblock the current report generation before any new features.

#### 1A. Migrate from `/issues/` to `/work-items/`
Change two lines in `generate_report.py` and one in `check_members.py`. Test with `--debug-issues`.

#### 1B. Add full pagination to `get_issues()`

```python
def get_issues(self, project_id: str, params: dict | None = None) -> list[dict]:
    all_results = []
    cursor = None
    while True:
        page_params = {**(params or {}), "per_page": 100}
        if cursor:
            page_params["cursor"] = cursor
        data = self._get(f"/projects/{project_id}/work-items/", params=page_params)
        results = data.get("results", []) if isinstance(data, dict) else data
        all_results.extend(results)
        next_cursor = data.get("next_cursor") if isinstance(data, dict) else None
        has_more = data.get("next_page_results", False) if isinstance(data, dict) else False
        if not has_more or not next_cursor:
            break
        cursor = next_cursor
    return all_results
```

#### 1C. Add rate-limit retry with exponential backoff

```python
import time

def _get(self, path: str, params: dict | None = None, retries: int = 3) -> dict:
    url = f"{self.base_url}/api/v1/workspaces/{self.workspace_slug}{path}"
    for attempt in range(retries):
        resp = self.session.get(url, params=params, timeout=30)
        if resp.status_code == 429:
            wait = 2 ** attempt
            print(f"Rate limited, waiting {wait}s...")
            time.sleep(wait)
            continue
        resp.raise_for_status()
        return resp.json()
    raise RuntimeError(f"Failed after {retries} retries: {url}")
```

#### 1D. Document `PLANE_PROJECT_SLUG` in `.env.example`

#### 1E. Fix the `filter_completed_this_week` fallback
Only use `completed_at`; drop `updated_at` fallback. A missing `completed_at` means the task isn't actually completed.

---

### Phase 2 — TypeScript Plane client in Next.js (2–3 days)

Build a native TypeScript API client so the web app can load real data without shelling out to Python.

#### File: `src/lib/plane.ts`

```typescript
// Plane.so REST API client (workspace-scoped)
const BASE_URL = process.env.PLANE_BASE_URL?.replace(/\/$/, '') ?? '';
const API_KEY = process.env.PLANE_API_KEY ?? '';
const WORKSPACE = process.env.PLANE_WORKSPACE_SLUG ?? 'romega';

const headers = {
  'X-API-Key': API_KEY,
  'Content-Type': 'application/json',
};

async function planeGet<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${BASE_URL}/api/v1/workspaces/${WORKSPACE}${path}`);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), { headers, next: { revalidate: 60 } });
  if (!res.ok) throw new Error(`Plane API ${res.status}: ${path}`);
  return res.json();
}

async function planeGetAll<T>(path: string, params?: Record<string, string>): Promise<T[]> {
  const all: T[] = [];
  let cursor: string | undefined;
  while (true) {
    const p = { ...params, per_page: '100', ...(cursor ? { cursor } : {}) };
    const data = await planeGet<{ results: T[]; next_cursor?: string; next_page_results?: boolean }>(path, p);
    all.push(...data.results);
    if (!data.next_page_results || !data.next_cursor) break;
    cursor = data.next_cursor;
  }
  return all;
}

export async function getProjects() {
  const data = await planeGet<{ results: PlaneProject[] }>('/projects/');
  return data.results;
}

export async function getWorkItems(projectId: string, assigneeId?: string) {
  const params: Record<string, string> = {};
  if (assigneeId) params.assignee = assigneeId;
  return planeGetAll<PlaneWorkItem>(`/projects/${projectId}/work-items/`, params);
}

export async function getWorkspaceMembers() {
  const data = await planeGet<{ results: PlaneMember[] }>('/members/');
  return data.results;
}

export async function getProjectStates(projectId: string) {
  const data = await planeGet<{ results: PlaneState[] }>(`/projects/${projectId}/states/`);
  return data.results;
}
```

Add environment variables to Next.js `.env`:
```
PLANE_BASE_URL=https://romega-projects-rs-plane.ikuuwb.easypanel.host
PLANE_API_KEY=plane_api_...
PLANE_WORKSPACE_SLUG=romega
```

---

### Phase 3 — Wire up live data to the UI (3–5 days)

#### 3A. Dashboard — real project cards + my tasks

The dashboard currently shows hardcoded `C1–C4` cards. Replace with:

```typescript
// src/app/(app)/dashboard/page.tsx
import { getProjects, getWorkItems } from '@/lib/plane';

export default async function DashboardPage() {
  const projects = await getProjects();
  const allWorkItems = await Promise.all(
    projects.map(p => getWorkItems(p.id))
  );
  // Aggregate stats per project...
}
```

#### 3B. My Tasks page — real tasks for logged-in user

```typescript
// src/app/(app)/my-tasks/page.tsx
// 1. Read session cookie → get user's Plane member ID (stored in DB or looked up)
// 2. getWorkItems(projectId, planeUserId) across all projects
// 3. Render Active / Backlog / Completed tabs
```

The user↔Plane member mapping is the key challenge: store `plane_member_id` in the `users` DB table, or resolve it by matching email at runtime.

#### 3C. Project board page — real kanban per project

```typescript
// src/app/(app)/projects/[id]/page.tsx
// 1. getProjectStates(id) to get columns
// 2. getWorkItems(id) to get cards
// 3. Group cards by state
```

---

### Phase 4 — User ↔ Plane member mapping (1 day)

This is the core identity bridge. Options:

| Approach | Pros | Cons |
|----------|------|------|
| Store `plane_member_id` in `users` DB table | Fast lookups, no API calls | Manual setup required |
| Match by email at runtime | Automatic | Requires Plane to expose email; slow |
| Match by display name | Zero config | Fragile (name changes, typos) |

**Recommendation:** Add `plane_member_id` column to `users` table. Populate it once via the admin UI or seed script. This is the most reliable approach.

Migration:
```sql
ALTER TABLE users ADD COLUMN plane_member_id TEXT;
```

Schema change in `src/db/schema.ts`:
```typescript
planeMemberId: text('plane_member_id'),
```

---

### Phase 5 — Report generation improvement (optional, later)

Once the TypeScript client exists, the report generation endpoint can call Plane directly instead of shelling out to Python. This makes it:
- Deployable anywhere (no Python dependency)
- Faster (no subprocess startup)
- Simpler (one runtime)

The Excel generation can use a JS library (`exceljs`) instead of `openpyxl`.

This is optional — the Python script works fine if Phase 1 fixes are applied.

---

## 4. Plane API Quick Reference

### Authentication
```
Header: X-API-Key: plane_api_...
```

### Base URL (self-hosted)
```
https://romega-projects-rs-plane.ikuuwb.easypanel.host/api/v1/workspaces/romega/
```

### Key endpoints (current, non-deprecated)

| Resource | Method | Path |
|----------|--------|------|
| List projects | GET | `/projects/` |
| List work items | GET | `/projects/{id}/work-items/` |
| Get single work item | GET | `/projects/{id}/work-items/{item_id}/` |
| List states | GET | `/projects/{id}/states/` |
| List workspace members | GET | `/members/` |

### Pagination
All list endpoints return:
```json
{
  "results": [...],
  "next_cursor": "value:offset:0",
  "next_page_results": true,
  "total_results": 247
}
```
Pass `?cursor={next_cursor}&per_page=100` to get next page.

### Rate limits
- 60 requests/minute per API key
- Headers: `X-RateLimit-Remaining`, `X-RateLimit-Reset`

### Work item state resolution
States have a `group` field. Standard groups: `backlog`, `unstarted`, `started`, `completed`, `cancelled`. Each project has its own state list with custom names — always look up `group` via the states endpoint, never assume by name.

---

## 5. Prioritized Action List

| Priority | Task | Effort | Impact |
|----------|------|--------|--------|
| P0 | Migrate `/issues/` → `/work-items/` in Python script | 30 min | Critical — endpoint is dead |
| P0 | Add pagination to `get_issues()` | 1 hr | Critical — data loss |
| P1 | Add retry/backoff for 429 | 1 hr | High — prevents rate-limit failures |
| P1 | Fix `filter_completed_this_week` fallback | 30 min | High — false positives in reports |
| P1 | Build TypeScript Plane client (`src/lib/plane.ts`) | 1 day | High — enables all live UI |
| P1 | Add `plane_member_id` to `users` table | 1 hr | High — identity bridge |
| P2 | Wire real data to Dashboard | 2 days | Medium — eliminates hardcoded data |
| P2 | Wire real data to My Tasks | 1 day | Medium |
| P2 | Wire real data to Projects board | 2 days | Medium |
| P3 | Replace Python shell-out with JS report generation | 3 days | Low — current script works |
| P3 | Webhook support for real-time updates | 3 days | Low — polling is sufficient for now |
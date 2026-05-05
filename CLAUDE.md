# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Next.js version warning**: This project uses Next.js 16, which has breaking changes from prior versions. Read `node_modules/next/dist/docs/` before writing any Next.js-specific code. Heed deprecation notices.

---

## Commands

Run all commands from the project root.

```bash
npm install
npm run dev        # http://localhost:3000
npm run build
npm run lint
npm run verify     # lint + build together (pre-PR check)
```

### Database

```bash
# Generate migration after schema change
npx drizzle-kit generate

# Apply migrations
npx drizzle-kit migrate

# Seed test users (ken/password123, mark/password123)
npx tsx scripts/seed.ts
```

### Report Script (Python)

```bash
cd report-script
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in PLANE_BASE_URL, PLANE_API_KEY, PLANE_WORKSPACE_SLUG

# Usage
python generate_report.py                    # all users, current week
python generate_report.py --user "Ken Garcia"
python generate_report.py --week 2026-05-05  # Monday date of target week
python generate_report.py --bulk             # all users, one workbook
python generate_report.py --dry-run
python check_members.py --show-all           # debug member list
```

---

## Architecture

```
Plane.so (source of truth)
    ↓
Python report script (report-script/)  ←  also callable via Next.js API
    ↓
Excel .xlsx reports + Next.js web app (src/)
```

This is a **reporting and visibility layer** on top of Plane.so — it does not replace it. ICs (individual contributors) only use Plane. This app is for leads and admin.

### Two components

| Component | Path | Purpose |
|-----------|------|---------|
| Next.js web app | `src/` | Dashboard, report generation UI, download history |
| Python report script | `report-script/` | Queries Plane API → generates `.xlsx` weekly reports |

The API route `POST /api/reports/generate` shells out to `generate_report.py` directly. It tries `python3` first, then falls back to `./venv/bin/python` via bash login shell.

---

## Auth & RBAC

**Auth flow**: JWT signed with `jose`, stored as an HTTP-only cookie named `session_token` (7d expiry). The secret comes from `JWT_SECRET` env var.

**Route protection**: `src/proxy.ts` exports a `proxy()` function used as middleware-equivalent logic. It redirects unauthenticated users to `/login` and role-checks restricted paths.

**Three roles** (`src/lib/rbac.ts`):

| Role | Default landing | Can access `/reports`, `/attendance` |
|------|----------------|--------------------------------------|
| `ic` | `/my-tasks` | No |
| `lead` | `/dashboard` | Yes |
| `admin` | `/dashboard` | Yes |

`normalizeRole()` maps DB strings like `"ceo"`, `"tl"`, `"manager"` to the three canonical roles.

---

## Database

- **Engine**: SQLite (`sqlite.db` in project root) via `better-sqlite3`
- **ORM**: Drizzle — schema in `src/db/schema.ts`, client in `src/db/index.ts`
- **Config**: `drizzle.config.ts` — migrations output to `drizzle/`
- **Only table**: `users` (id, username, passwordHash, name, email, role, team, jobTitle, isActive)

Passwords are hashed with `bcryptjs`.

---

## App Structure

```
src/
  app/
    (app)/          ← authenticated route group with shared sidebar layout
      dashboard/
      my-tasks/
      projects/[id]/
      attendance/
      reports/
      profile/
    api/
      auth/         ← login / logout
      reports/      ← generate, download, history, members
      profile/me/
    login/
    globals.css
    styles/         ← styles.css (color system), modals.css
  components/
    app-sidebar.tsx
    ui/             ← shadcn components (button, card, input, label, sheet)
  db/
    schema.ts
    index.ts
  lib/
    auth.ts         ← JWT sign/verify
    rbac.ts         ← role normalization, path access checks
    utils.ts        ← cn() helper
  proxy.ts          ← middleware logic (auth guard + role redirect)
```

The `(app)` route group's `layout.tsx` reads the session cookie server-side and passes `role` and user initials to `AppSidebar`.

---

## Design System

All CSS custom properties use the `--rs-` prefix (defined in `globals.css` and `src/app/styles/styles.css`).

| Palette | Token pattern | Key values |
|---------|--------------|------------|
| Primary blue | `--rs-primary-{50-950}` | `--rs-primary-500` = `hsla(209,100%,45%,1)` (brand blue) |
| Accent orange | `--rs-accent-{50-950}` | `--rs-accent-500` = `hsla(42,94%,45%,1)` |
| Neutral (blue-tinted) | `--rs-neutral-{50-950}` | |
| Neutral grey | `--rs-neutral-grey-{50-950}` | `--rs-neutral-grey-900` = default body text |

Fonts: **Merriweather** (headings, `font-serif`) and **Source Sans 3** (body, `font-sans`), loaded via `next/font/google` in `src/app/layout.tsx`.

Utility convention: `.text-rs-{palette}-{shade}`, `.bg-rs-{palette}-{shade}`, `.border-rs-{palette}-{shade}`.

UI components come from **shadcn/ui** (`components.json` at root). Add new shadcn components with `npx shadcn add <component>`.

---

## Environment Variables

**Next.js app** (`.env` at project root):

| Variable | Purpose |
|----------|---------|
| `JWT_SECRET` | JWT signing key — must be set in production |
| `REPORT_SCRIPT_DIR` | Absolute path to `report-script/` (defaults to `<cwd>/report-script`) |
| `REPORT_SCRIPT_PYTHON` | Absolute path to Python binary (defaults to `python3`) |

**Python report script** (`report-script/.env`):

| Variable | Purpose |
|----------|---------|
| `PLANE_BASE_URL` | Self-hosted Plane URL |
| `PLANE_API_KEY` | Plane API key |
| `PLANE_WORKSPACE_SLUG` | `romega-solutions` |

# Lead-Exclusive Automation & AI Agent Analysis

> **Updated 2026-05-14:** Re-scoped to drop Plane.so. "Tech Lead" role is treated as a **non-technical Project Manager**. Expanded the per-lead tool catalogs and added back self-hosted CRM as an option.
>
> **Stack constraint:** Self-hosted n8n + Supabase/Postgres + Gemini free tier + this Next.js app. No paid SaaS.

---

## Costs & Free-Tier Reality

Everything in this doc runs at **~$0/month** on top of the VPS you already pay for.

| Component | Free tier | Romega's likely volume | Verdict |
|---|---|---|---|
| **Gemini 2.0 Flash** | 1,500 req/day · 1M tok/min · 15 req/min | ~10–20 req/day across all features | ✅ Comfortably free |
| **Gemini Embeddings** (`text-embedding-004`) | 1,500 req/day | ~50/day if you add RAG | ✅ Free |
| **n8n self-hosted** | Open source (Sustainable Use License) | Unlimited workflows on your VPS | ✅ Free |
| **Supabase free tier** | 500 MB DB · 50K MAU · 2 GB bandwidth | Your scale | ✅ Free |
| **Twenty CRM self-hosted** | Open source (AGPL) | Unlimited | ✅ Free, +1 Docker container |
| **Umami / Plausible self-hosted** | Open source | Unlimited | ✅ Free |
| **Hunter.io free tier** | 25 searches/mo, 50 verifications/mo | Small Sales team | ✅ OK |
| **Apollo.io free tier** | 60 emails/mo | Small Sales team | ⚠️ Tight |
| **VPS** | Already paid for | — | Sunk cost |

**Only real watch-out:** Apollo's free tier. If lead enrichment scales beyond ~2 leads/day, queue requests in n8n and batch monthly.

---

## Data already in Supabase (from `src/db/schema.ts`)

| Table | Useful fields |
|---|---|
| `users` | `name`, `email`, `role`, `team`, `jobTitle`, `isActive` |
| `timesheets` | `userId`, `clockedInAt`, `clockedOutAt`, `durationSeconds`, `notes`, `date` |
| `weeklyReports` | `userId`, `weekStart`, `clientEngagements`, `risks`, `ideas`, `submittedAt` |
| `attendance` | `userId`, `weekStart`, per-day status, `notes` |

Plenty to power the features below. New tables can be added per feature.

---

# Per-Lead Tool Catalog

Each lead gets 5–6 candidate tools. The TL;DR at the bottom narrows the whole org down to a final 3.

---

## 1. CEO — Strategic Visibility & Decision Support

| # | Tool | What it does | Build | Cost |
|---|---|---|---|---|
| 1.1 | **Daily Executive Briefing Email** | 7 AM PHT cron. n8n queries Supabase for yesterday's hours + absences + risks added + lead pipeline movement. Gemini drafts 1-page brief. Email. | 2–3 days | Free |
| 1.2 | **AI Decision Memo Generator** | CEO types a question at `/ceo/memo`. Agent gathers relevant Supabase + email context, runs multi-step Gemini reasoning, returns 1-page memo. | 4–5 days | Free |
| 1.3 | **Org KPI Dashboard** (`/ceo/kpi`) | Single Next.js page with `recharts`. Weekly attendance %, avg daily hours per team, engagements count, lead pipeline value, risks count. | 2 days | Free |
| 1.4 | **Weekly Board-Style Report** | Sunday 8 PM cron. Compiles full week: shipped items, risks, financials (from Leads), people updates → polished PDF for board/investors. | 3 days | Free |
| 1.5 | **Strategic Q&A Chatbot** (`/ceo/ask`) | RAG-style chat. Knowledge base = company SOPs, past memos, weekly reports. Gemini answers with citations. | 5–6 days | Free |
| 1.6 | **Email Triage Helper** | Gmail node in n8n. Every morning, Gemini sorts incoming email into action / FYI / delete + drafts replies for "action" bucket. | 3–4 days | Free (uses Gmail API free tier) |

---

## 2. Project Manager — Coordination & Stakeholder Reporting

> Non-technical role. Tools focus on people coordination, status visibility, capacity planning.

| # | Tool | What it does | Build | Cost |
|---|---|---|---|---|
| 2.1 | **AI Weekly Status Report Drafter** ⭐ | Friday 4 PM. Pulls every IC's `weeklyReports` + hours + attendance. Gemini drafts client-facing summary in Romega tone. PM edits → sends. | 3 days | Free |
| 2.2 | **Team Capacity & Workload Digest** | Monday 8 AM. Last week's hours + this week's planned attendance. Gemini flags overload, absences, suggests rebalancing. | 2–3 days | Free |
| 2.3 | **Risk & Blocker Watcher** | Cron every 4h scans `risks` field for keywords (blocked / stuck / delayed). Alerts PM with suggested next action. | 2 days | Free |
| 2.4 | **1-on-1 Question Generator** | PM clicks an IC's profile → "Prep 1-on-1." Gemini reads last 4 weeks of that IC's reports + attendance, returns 5 tailored questions. | 1–2 days | Free |
| 2.5 | **Meeting Prep Agent** | 30 min before any calendar event tagged `[lead]`, n8n drafts agenda, pulls last meeting notes from Supabase, highlights open action items. | 3–4 days | Free (Google Calendar API free) |
| 2.6 | **Deadline Tracker** | Scans `weeklyReports.clientEngagements` + a new `deliverables` table for due dates. Alerts PM 48h + 24h before each. | 2 days | Free |

---

## 3. Sales Lead — Pipeline & Outreach

Two CRM paths — pick one. **3.1 vs 3.2.**

| # | Tool | What it does | Build | Cost |
|---|---|---|---|---|
| 3.1 | **In-App Lightweight CRM** (recommended) | New `leads` table + `/sales/leads` route. Kanban (`@dnd-kit`), pipeline chart (`recharts`), contact form (`react-hook-form` + `zod`). Real RBAC. | 3–4 days | Free |
| 3.2 | **Twenty CRM (self-hosted)** — alternative | Full-featured open-source CRM (AGPL). Docker on the VPS. Use if you outgrow 3.1. n8n syncs contact form submissions in. | 1 day deploy + 2–3 days integration | Free |
| 3.3 | **Lead Enrichment Agent** | Webhook on new lead → Hunter.io + Apollo.io free tiers → augment company, size, LinkedIn, tech stack. Gemini writes 3-line pitch note. | 2–3 days | Free (within Hunter/Apollo caps) |
| 3.4 | **AI Proposal Drafter** | Pick a lead + service template → Gemini drafts proposal → Puppeteer node renders PDF → SMTP node emails client → logs to lead. | 4–5 days | Free |
| 3.5 | **Cold Email Sequencer** | Define a 3-touch sequence per lead segment. n8n schedules sends, tracks opens (via tracking pixel), stops on reply. | 4 days | Free |
| 3.6 | **Meeting Notes → CRM Updater** | Paste call notes at `/sales/notes/{leadId}`. Gemini extracts: stage change, next step, follow-up date → updates lead row. | 2 days | Free |
| 3.7 | **AI Discovery Question Generator** | Before a discovery call, paste lead's website/LinkedIn → Gemini returns 10 tailored questions + likely objections. | 1 day | Free |

---

## 4. Marketing Lead — Content & Funnel

| # | Tool | What it does | Build | Cost |
|---|---|---|---|---|
| 4.1 | **Content Repurposer Agent** | Paste blog/video transcript → Gemini spins out LinkedIn carousel, Twitter thread, newsletter HTML, IG caption. Stored in `content_drafts`. | 3 days | Free |
| 4.2 | **Newsletter Send Agent** | `newsletter_subscribers` table + `/marketing/newsletter` editor. n8n batches SMTP sends, logs delivery. | 3 days | Free |
| 4.3 | **SEO & Competitor Watcher** | Weekly cron. Puppeteer crawls romegasolutions.com + 3 competitors. Gemini summarizes diffs. Stored in `seo_snapshots`. | 3–4 days | Free |
| 4.4 | **AI Blog Draft Generator** | Marketing Lead enters topic + target keyword → Gemini outputs 800–1,200 word draft with H2s, meta, schema. Stored as draft post. | 2 days | Free |
| 4.5 | **Social Scheduler** | Queue posts in Supabase. n8n cron fires to LinkedIn / Twitter / Facebook APIs at scheduled times. | 3–4 days | Free |
| 4.6 | **Brand Voice Reviewer** | Paste copy → Gemini scores it against brand voice rules (stored in Supabase) → returns rewrites. | 1–2 days | Free |
| 4.7 | **Lead Magnet Generator** | Pick a topic + audience → Gemini drafts a 5-page checklist/ebook → Puppeteer renders branded PDF → uploads to Supabase Storage with download link. | 3–4 days | Free |

---

## 5. Recruiting Lead — Applicant Tracking & Hiring Ops

> Replaces / consolidates the standalone `RS_Tool-ATS` project. Same data model (jobs, candidates, applications, pipeline stages, sources) but flattened for a single workspace and a small org. Routes live at `/recruiting/*`.

| # | Tool | What it does | Build | Cost |
|---|---|---|---|---|
| 5.1 | **In-App ATS — Candidates** ⭐ (`/recruiting/candidates`) | Single Supabase `candidates` table. Track applicant → screening → interview → offer → hired/rejected. Star rating, source, notes, LinkedIn URL, resume URL. Polished table view with stats. | 3 days (shipped) | Free |
| 5.2 | **Jobs / Requisitions** (`/recruiting/jobs`) | Separate `jobs` table for open positions with headcount, department, status (draft/open/closed). Candidates link to jobs. | 2–3 days | Free |
| 5.3 | **Resume Parse Agent** | Upload PDF resume → n8n + Gemini Vision extracts name, email, phone, position, skills → pre-fills the new-candidate form. | 3–4 days | Free |
| 5.4 | **AI Candidate Match Score** | When a new candidate is added, n8n compares their notes/resume to the job description → returns a 0–100 fit score + 3-line summary. Stored on the row. | 3 days | Free |
| 5.5 | **Interview Scheduler** | Generate Calendly-style slots from the recruiting lead's calendar, send candidate a link, write the chosen slot back to Supabase. | 4–5 days | Free (Google Calendar API) |
| 5.6 | **Rejection / Offer Email Templates** | Pre-written templates with Gemini variables (candidate name, role, next step). One click to send via n8n SMTP node. | 2 days | Free |

---

## 6. Design / Creative Lead *(optional — only if role exists)*

| # | Tool | What it does | Build | Cost |
|---|---|---|---|---|
| 5.1 | **Asset Request Inbox** | `/design/requests` route + `design_requests` table. Anyone submits, designer owns queue. | 2 days | Free |
| 5.2 | **Brand Voice & Visual Reviewer** | Upload mock → Gemini Vision compares against brand guidelines → flags drift. | 3 days | Free |
| 5.3 | **Component Drift Checker** | n8n cron diffs `src/components/ui/` across 7 RS repos → Slack/email report. | 2 days | Free |
| 5.4 | **Figma Comment Triager** | Pull Figma comments via API → Gemini classifies (bug / question / approval) → routes to right person. | 3 days | Free (Figma API free) |
| 5.5 | **Mood Board Generator** | Enter project brief → Gemini picks color palette + font pairings + reference URLs from a curated library in Supabase. | 2–3 days | Free |

---

# TL;DR — Honest Top 3 for the Whole Org

Same as the prior pass. Wider catalog above doesn't change the ranking — these still win on **(weekly time saved × frequency) ÷ (build cost + maintenance)**.

### 🥇 #1 — AI Weekly Status Report Drafter *(PM exclusive, item 2.1)*
Biggest single time-saver. Replaces 1.5–2 hours of writing every Friday. Uses data already collected. **3 days build, weekly impact.**

### 🥈 #2 — In-App Lightweight CRM *(Sales exclusive, item 3.1)*
Direct revenue lever. Lives in this Next.js app. Reuses already-installed primitives. Real RBAC (no iframe theater). **3–4 days build, daily impact.**
*(If Sales outgrows 3.1 in 6+ months, swap to Twenty CRM — item 3.2.)*

### 🥉 #3 — Daily Executive Briefing Email *(CEO exclusive, item 1.1)*
Smallest scope. Teaches the n8n + Supabase + Gemini + SMTP pattern that every other feature reuses. Build this first — features #1 and #2 above become ~50% cheaper afterward. **2–3 days build, daily impact, reversible.**

---

## Build Order (solo dev pace, 1 evening/day)

| Week | Build | Why this order |
|---|---|---|
| 1 | CEO Daily Briefing v1 (1.1) | Teaches the core pattern. Smallest. Reversible. |
| 2 | PM Weekly Status Drafter (2.1) | Reuses the pattern from week 1 → ~1.5 days of new work. |
| 3 | In-app Leads Module v1 (3.1) | Independent track. Pure Next.js + Supabase. |
| 4 | Lead Enrichment (3.3) | Builds on week 3. Reuses n8n pattern from week 1. |
| 5 | Risk & Blocker Watcher (2.3) | Cheap follow-up for PM. |
| 6+ | Pick by demand. | Whichever lead uses their tool most → build their next one. |

---

## RBAC Sketch (real, server-side exclusivity)

```ts
// src/lib/rbac.ts
export function canAccessLeadFeature(
  pathname: string,
  role: AppRole,
  team: string | null,
): boolean {
  if (role === 'admin') return true;
  if (role !== 'lead') return false;

  if (pathname.startsWith('/ceo/'))       return team === 'Executive';
  if (pathname.startsWith('/pm/'))        return team === 'Operations' || team === 'Project Management';
  if (pathname.startsWith('/sales/'))     return team === 'Sales';
  if (pathname.startsWith('/marketing/')) return team === 'Marketing';
  if (pathname.startsWith('/design/'))    return team === 'Design/PM';

  return false;
}
```

Wire it into `src/proxy.ts` (or `middleware.ts`) before the route renders, and conditionally show sidebar items in `app-sidebar.tsx`.

---

## Developer's Honest Take

The wider catalog above is a menu, **not** a build list. Burnout risk if you try to ship all 25+. Reality:

1. **Verify weekly-report submission rate before building 2.1.** If <80%, fix submissions first — AI on sparse input produces sparse output.
2. **The CEO Briefing (1.1) is thin without lead-pipeline data.** Consider deferring it until #2 (the Leads Module) ships, so it has real signal to summarize.
3. **Plane removal creates a task-tracking gap.** Either accept losing granular task data, or scope an in-app tasks module (bigger than anything in the top 3).
4. **Back up n8n workflow JSON to git.** Single-VPS = single point of failure.
5. **Talk to each lead for 15 minutes before building.** The strongest AI features come from "what do you hate doing every Friday?" — not top-down spec. One conversation can change the priority list more than another revision of this doc.

### The pattern underneath everything

```
Supabase (data) → n8n (orchestrate) → Gemini (think) → email / in-app route (deliver)
```

Build the wiring once for CEO Briefing in week 1. Every feature after that becomes composition, not fresh integration. **That compounding is the actual ROI** — not any single tool.

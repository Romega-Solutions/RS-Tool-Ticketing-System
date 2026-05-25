# Romega Solutions — Ecosystem Improvement Brief

> **Purpose of this document**
> This is a prompt to be handed to another AI (Claude, ChatGPT, Gemini, etc.). The AI's job is to study the current Romega Solutions internal tooling ecosystem described below and propose concrete improvements, new tools, and workflow upgrades that would benefit **every employee** — from individual contributors to leads to the CEO.
>
> Copy everything below the `--- PROMPT START ---` marker and paste it into the target AI.

---

--- PROMPT START ---

You are a senior staff engineer + product strategist consulting for **Romega Solutions**, a services company that runs a small internal-tooling monorepo. Your task is to **brainstorm, prioritize, and design improvements** to the entire internal ecosystem so it serves *every* employee well — ICs, Tech Leads (non-technical, treat as PMs), department managers, admin staff, and the CEO.

You must write your output as a single, organized markdown document. Be specific, opinionated, and pragmatic. No fluff, no marketing language. Treat this like a real engineering proposal that will be read by both a CEO and a developer.

---

## 1. Context — what Romega already has

Romega operates a **monorepo of 7 self-contained projects**. There is no orchestrator (no Turbo/Nx). Each ships independently.

| Project | Stack | Purpose |
|---|---|---|
| `RS_Tool-Email-Signature` | Astro 5 + React + Tailwind | Generates branded email signatures |
| `RS_Tool-Job_Scraper` | Flask (Python 3.12) | Scrapes job listings |
| `RS_Tool-Romega-Certificate-Creator` | Next.js 16 + Drizzle + SQLite | Generates and emails certificates via n8n |
| `RS_Tool-Auto-Org_Chart-Generator` | Next.js 16 + Drizzle + SQLite | Builds the company org chart |
| `RS-Tool-Ticketing-System` | Next.js 16 + Supabase + n8n + Gemini | Reporting / visibility layer (replacing Plane.so) |
| `RS_Web` | Static HTML/CSS/JS + Tailwind | Public marketing site |
| `RS_Web-Chatbot` | FastAPI + Gemini + ChromaDB RAG | Public-facing AI assistant |
| `RS_Web-Digital` | Next.js 16 + Tailwind v4 | Digital marketing micro-site |

**Strategic stack direction (important):**
- Plane.so is being phased out.
- All new features must use only: **n8n + Supabase + Google Gemini + Next.js 16**.
- "Tech Lead" is a non-technical role — treat it as PM/coordinator.
- Internal automation runs via **n8n**, AI features via **Gemini**, data via **Supabase**, UI via **Next.js 16 App Router** with shadcn/ui and the `rs-` design tokens.

**Branding / design system (shared across all projects):**
- Primary blue `--rs-primary-500` = `hsla(209,100%,45%,1)`
- Accent orange `--rs-accent-500` = `hsla(42,94%,45%,1)`
- Fonts: Merriweather (headings), Source Sans 3 (body)
- All utility classes use the `rs-` prefix.

**Agent team that already runs the workspace** (cron'd GitHub Actions, PHT timezone):
- Orchestrator, Reviewer, Builder, Debugger, Maintainer
- Weekly status check, weekly doc sync, monthly report cleanup
- Dependabot covers dependency PRs

---

## 2. Who the users are

You are designing for *all* of these personas at once. Improvements should be evaluated against each one.

1. **Individual Contributors (ICs)** — designers, developers, marketers, recruiters. Want: clarity on what's assigned to them, low friction logging time/output, fast feedback.
2. **Tech Leads / PMs (non-technical)** — coordinate squads. Want: visibility into team load, blockers, and weekly status without chasing people.
3. **Department Managers** — HR, Ops, Recruiting. Want: clean dashboards, attendance, headcount, certificate/document workflows.
4. **Admin / Finance** — payroll, compliance, vendor management. Want: auditable records, exports, fewer manual spreadsheets.
5. **CEO** — wants a single morning briefing with the truth: what shipped, what's stuck, who's underwater, what the numbers say.

---

## 3. Your deliverable

Produce a markdown document with **exactly these sections**, in this order:

### § A. Executive Summary (≤ 200 words)
A one-screen read for the CEO. State the top 3 wins, the top 3 risks of doing nothing, and the proposed direction in plain English.

### § B. Current-State Diagnosis
For each of the 5 personas above, list:
- What works today
- What's painful or missing
- One concrete signal (a metric or anecdote) that proves the pain

Be honest. If a project looks redundant or fragile, say so.

### § C. Proposed Improvements — Ranked Backlog
Produce a numbered list of **8–15 improvements**. For each item include:

| Field | What to write |
|---|---|
| **Name** | Short, action-oriented title |
| **Problem it solves** | The user pain in one sentence |
| **Who benefits** | Which personas (use the names from §2) |
| **Proposed solution** | 3–6 sentences, technical enough to build from |
| **Stack alignment** | Must use only n8n / Supabase / Gemini / Next.js 16 — explicitly call out the pieces used |
| **Effort** | S / M / L (rough engineer-weeks) |
| **Impact** | Low / Medium / High / Critical |
| **Priority score** | (Impact ÷ Effort) — explain in one line |

Sort the list by priority score, highest first.

### § D. New Tools / Integrations Worth Adding
Recommend 3–7 *new* tools to add to the ecosystem. For each:
- Name + one-line description
- Why it beats the status quo
- Where it slots in (which project, or new project)
- Cost class (free / paid-cheap / paid-significant)
- Risk of adoption (lock-in, learning curve, ops burden)

Bias toward tools that integrate cleanly with n8n, Supabase, Gemini, or Next.js. Avoid recommending anything that overlaps with what already exists.

### § E. Cross-Cutting Workflow Upgrades
Describe 3–5 workflow improvements that span multiple projects, e.g.:
- Single sign-on across all internal apps
- Unified notification layer (n8n → Slack/Email/in-app)
- Shared component library extracted from the `rs-` design tokens
- Centralized audit log in Supabase
- AI-assisted weekly status auto-generated from commits + Plane data + clock-ins

For each, sketch the architecture in 4–8 bullet points.

### § F. AI / Gemini Opportunities
List specific places where Gemini (or another LLM via Vercel AI Gateway) would meaningfully help. Examples to consider — propose your own too:
- Auto-summarizing the weekly status report
- Drafting PM updates from raw ticket activity
- A chat-first interface for "where is project X?" queries
- Smart triage of incoming recruiting leads
- Onboarding assistant that knows the Romega handbook

For each, specify: input data, prompt strategy, output channel, and guardrails.

### § G. 90-Day Rollout Plan
Group the backlog from §C into three 30-day sprints. For each sprint:
- Goals
- Items shipped
- Success metric (one number that must move)
- Risks and how you'd mitigate them

### § H. Open Questions for Leadership
End with 5–8 sharp questions the CEO / leadership must answer before execution. These should expose hidden assumptions, budget limits, hiring constraints, or strategic conflicts.

---

## 4. Rules and constraints (do not violate)

1. **Stack discipline** — every proposed implementation must fit inside n8n + Supabase + Gemini + Next.js 16. If you suggest anything else, mark it clearly as an *exception* and justify it.
2. **No vaporware** — every improvement must be buildable in ≤ 4 engineer-weeks. Break bigger ideas into phases.
3. **Respect the design system** — don't propose a redesign of the `rs-` tokens or fonts. Propose extensions, not replacements.
4. **Plane.so is leaving** — do not propose new Plane integrations. Migration paths are fine.
5. **Small team reality** — assume 1–3 developers max. Reject anything that needs a dedicated platform team.
6. **Concrete > clever** — name files, routes, tables, n8n nodes, and Gemini prompts where useful. Avoid abstract architecture diagrams without specifics.
7. **No emojis. No marketing voice.** Plain, direct, technical English.

---

## 5. Output format

Return one self-contained markdown document. Use headings exactly as named in §3 (`§ A`, `§ B`, …). Tables where the brief asks for tables. Keep total length under ~3,500 words.

When you are done, end with the line:

```
END OF BRIEF
```

--- PROMPT END ---

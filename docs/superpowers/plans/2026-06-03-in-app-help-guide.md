# In-App Help & Guide Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an in-app, role-aware **Help & Guide** page at `/help` (step-by-step how-tos for users, plus an admin-only section) with a sidebar link visible to all roles.

**Architecture:** One server component that reads the session, renders static content from typed arrays, and gates the Admin section behind `canAccessAdmin(role)`. A sticky in-page section nav (anchor links) and accurate content for the new 15h/week overtime + current LMS. No client JS, no new dependencies, no RBAC change (`canAccessPath` default-allows `/help`).

**Tech Stack:** Next.js 16 App Router (server component), Tailwind v4 with `--rs-*` tokens, `lucide-react`, `next/link`. Spec: `docs/superpowers/specs/2026-06-03-in-app-help-guide-design.md`.

---

## File Structure

- **Create** `src/app/(app)/help/page.tsx` — the Help & Guide page (header, section nav, daily-flow strip, user how-to cards, admin-only cards, escalation footer). Content in typed arrays at top.
- **Modify** `src/components/app-sidebar.tsx` — import `LifeBuoy`, add one `navItems` entry in the `"main"` category.

---

### Task 1: Create the Help & Guide page

**Files:**
- Create: `src/app/(app)/help/page.tsx`

- [ ] **Step 1: Create the page file with full content**

```tsx
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ComponentType } from 'react';
import {
  LifeBuoy, Clock, Timer, CheckSquare, BookMarked, FileText,
  Shield, Users, BookOpen, ArrowRight, MessageCircle,
} from 'lucide-react';
import { getSession } from '@/lib/session';
import { canAccessAdmin, roleLabel } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

type HowTo = {
  id: string;
  icon: ComponentType<{ className?: string }>;
  title: string;
  blurb: string;
  steps: string[];
  link?: { href: string; label: string };
  accent?: boolean;
};

const DAILY_FLOW = [
  { n: 1, icon: Clock,       title: 'Clock in',      desc: 'Start your day from the clock control in the sidebar.' },
  { n: 2, icon: CheckSquare, title: 'Work tasks',    desc: 'Pick up and update items in My Tasks.' },
  { n: 3, icon: BookMarked,  title: 'Keep learning', desc: 'Finish assigned courses in My Learning.' },
  { n: 4, icon: FileText,    title: 'Weekly report', desc: 'Submit your end-of-week status.' },
  { n: 5, icon: Clock,       title: 'Clock out',     desc: 'End your session before logging out.' },
];

const USER_GUIDES: HowTo[] = [
  {
    id: 'clock',
    icon: Timer,
    title: 'Clocking in & out + overtime',
    blurb: 'Track your work hours from anywhere in the app.',
    steps: [
      'Click the clock control in the sidebar (or top bar) and confirm to start a session — you’ll show as “in” across the app.',
      'Your live timer runs in the sidebar and turns amber once you cross into overtime.',
      'There is no daily limit — you can work several hours in one sitting. The cap is 15 hours per Mon–Sun week.',
      'When you reach 15h for the week you’re clocked out automatically and shown a prompt — click “Request overtime” to ask an admin.',
      'Once an admin approves, clock back in and keep working until the end of the day; the limit resumes afterward.',
      'Always clock out before logging out (the app reminds you if you forget).',
    ],
    link: { href: '/attendance', label: 'View attendance' },
  },
  {
    id: 'tasks',
    icon: CheckSquare,
    title: 'My Tasks',
    blurb: 'Your work items and their progress.',
    steps: [
      'Open My Tasks to see everything assigned to you.',
      'Click a task to view details and update its status as you make progress.',
      'Use Projects to see how your tasks roll up into larger work.',
    ],
    link: { href: '/my-tasks', label: 'Go to My Tasks' },
  },
  {
    id: 'learning',
    icon: BookMarked,
    title: 'My Learning',
    blurb: 'Courses assigned to your role and team.',
    steps: [
      'Open My Learning to see your Foundation, Intern, and Department courses.',
      'Open a course and work through each lesson in order.',
      'For video lessons, watch to the end to unlock “Mark complete”.',
      'If a lesson has a quiz, pass it to complete the lesson.',
      'Finish 100% of a course and a certificate is issued automatically — find it under My Certificates.',
    ],
    link: { href: '/learning', label: 'Go to My Learning' },
  },
  {
    id: 'reports',
    icon: FileText,
    title: 'Weekly Reports',
    blurb: 'Share your end-of-week status.',
    steps: [
      'Open Weekly Reports.',
      'Review the week’s work and fill in your status.',
      'Submit so your lead has visibility.',
    ],
    link: { href: '/weekly-report', label: 'Go to Weekly Reports' },
  },
];

const ADMIN_GUIDES: HowTo[] = [
  {
    id: 'admin-users',
    icon: Users,
    title: 'Manage users',
    blurb: 'Add teammates and set their access.',
    steps: [
      'Open User Management under Admin.',
      'Invite or edit a user and set their role (IC, Lead, Admin) and team.',
      'Role and team drive what each person sees and which courses auto-assign.',
    ],
    link: { href: '/admin/users', label: 'Open User Management' },
    accent: true,
  },
  {
    id: 'admin-learning',
    icon: BookOpen,
    title: 'Set up a course',
    blurb: 'Author and publish Learning content.',
    steps: [
      'Open Manage Learning under Admin and click “New course”.',
      'Set the title, description, scope (Foundation / Department / Intern), and — for Department — the team.',
      'Open the course and add lessons (text, video, or both).',
      'Optionally attach a quiz with a pass score.',
      'Publish the course — it auto-assigns to the right people by scope, role, and team.',
    ],
    link: { href: '/admin/learning', label: 'Open Manage Learning' },
    accent: true,
  },
  {
    id: 'admin-overtime',
    icon: Timer,
    title: 'Approve overtime',
    blurb: 'Let someone work past the weekly cap.',
    steps: [
      'Open Overtime Requests under Admin.',
      'Review each pending request and Approve or Deny it.',
      'Approving grants overtime for the rest of that person’s day (Asia/Manila); the 15h weekly limit resumes afterward.',
    ],
    link: { href: '/admin/overtime', label: 'Open Overtime Requests' },
    accent: true,
  },
];

function SectionNav({ isAdmin }: { isAdmin: boolean }) {
  const items = [
    { href: '#daily-flow', label: 'Daily flow' },
    { href: '#clock',      label: 'Clock & overtime' },
    { href: '#tasks',      label: 'My Tasks' },
    { href: '#learning',   label: 'My Learning' },
    { href: '#reports',    label: 'Weekly reports' },
    ...(isAdmin ? [{ href: '#admin-tools', label: 'Admin tools' }] : []),
  ];
  return (
    <nav aria-label="Guide sections" className="sticky top-2 z-10 mb-8 flex flex-wrap gap-2 rounded-2xl border border-(--rs-neutral-grey-200) bg-white/80 px-3 py-2.5 backdrop-blur">
      {items.map(i => (
        <a
          key={i.href}
          href={i.href}
          className="cursor-pointer rounded-full px-3 py-1 text-xs font-medium text-(--rs-neutral-grey-600) transition-colors hover:bg-(--rs-primary-50) hover:text-(--rs-primary-700) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--rs-primary-300)"
        >
          {i.label}
        </a>
      ))}
    </nav>
  );
}

function HowToCard({ guide }: { guide: HowTo }) {
  const Icon = guide.icon;
  return (
    <section id={guide.id} className="scroll-mt-24 rounded-2xl border border-(--rs-neutral-grey-200) bg-white p-6 shadow-sm">
      <div className="flex items-start gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${guide.accent ? 'bg-(--rs-accent-50) text-(--rs-accent-600)' : 'bg-(--rs-primary-50) text-(--rs-primary-600)'}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h3 className="font-serif text-lg font-semibold text-(--rs-neutral-grey-900)">{guide.title}</h3>
          <p className="mt-0.5 text-sm text-(--rs-neutral-grey-500)">{guide.blurb}</p>
        </div>
      </div>
      <ol className="mt-4 space-y-2.5">
        {guide.steps.map((step, i) => (
          <li key={i} className="flex gap-3 text-sm text-(--rs-neutral-grey-700)">
            <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${guide.accent ? 'bg-(--rs-accent-100) text-(--rs-accent-700)' : 'bg-(--rs-primary-100) text-(--rs-primary-700)'}`}>
              {i + 1}
            </span>
            <span className="leading-relaxed">{step}</span>
          </li>
        ))}
      </ol>
      {guide.link && (
        <Link href={guide.link.href} className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-(--rs-primary-600) transition-colors hover:text-(--rs-primary-700) hover:underline">
          {guide.link.label}
          <ArrowRight className="h-4 w-4" />
        </Link>
      )}
    </section>
  );
}

export default async function HelpPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  const isAdmin = canAccessAdmin(session.role);

  return (
    <div className="mx-auto max-w-4xl space-y-8 pb-12">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-(--rs-primary-500) text-white shadow-sm">
            <LifeBuoy className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-serif text-2xl font-semibold text-(--rs-neutral-grey-900)">Help &amp; Guide</h1>
            <p className="mt-1 text-sm text-(--rs-neutral-grey-500)">
              Step-by-step instructions for getting things done in the app.
            </p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-(--rs-neutral-grey-100) px-3 py-1 text-xs font-semibold uppercase tracking-wider text-(--rs-neutral-grey-600)">
          <Shield className="h-3.5 w-3.5" />
          {roleLabel(session.role)}
        </span>
      </header>

      <SectionNav isAdmin={isAdmin} />

      {/* Daily flow */}
      <section id="daily-flow" className="scroll-mt-24 rounded-2xl border border-(--rs-neutral-grey-200) bg-white p-6 shadow-sm">
        <h2 className="mb-6 font-serif text-lg font-semibold text-(--rs-neutral-grey-900)">Your daily flow</h2>
        <ol className="flex flex-col gap-0 md:flex-row md:items-start">
          {DAILY_FLOW.map((step, i) => {
            const Icon = step.icon;
            return (
              <li key={step.n} className="flex flex-1 items-start gap-4 md:flex-col md:items-center md:gap-0 md:text-center">
                <div className="flex items-center md:flex-col">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-(--rs-primary-500) text-white shadow-sm">
                    <Icon className="h-5 w-5" />
                  </div>
                  {i < DAILY_FLOW.length - 1 && (
                    <>
                      <div className="mx-0 hidden h-0.5 w-full bg-(--rs-primary-200) md:block" />
                      <div className="ml-5 mt-1 h-8 w-0.5 bg-(--rs-primary-200) md:hidden" />
                    </>
                  )}
                </div>
                <div className="md:mt-3 md:px-2">
                  <p className="text-sm font-bold text-(--rs-neutral-grey-900)">{step.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-(--rs-neutral-grey-500)">{step.desc}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      {/* User how-tos */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {USER_GUIDES.map(guide => <HowToCard key={guide.id} guide={guide} />)}
      </div>

      {/* Admin tools — admins only */}
      {isAdmin && (
        <section id="admin-tools" className="scroll-mt-24 space-y-4">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-(--rs-accent-600)" />
            <h2 className="font-serif text-lg font-semibold text-(--rs-neutral-grey-900)">Admin tools</h2>
            <span className="rounded-full bg-(--rs-accent-50) px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-(--rs-accent-700)">Admins only</span>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {ADMIN_GUIDES.map(guide => <HowToCard key={guide.id} guide={guide} />)}
          </div>
        </section>
      )}

      {/* Escalation */}
      <section className="rounded-2xl border border-(--rs-primary-200) bg-(--rs-primary-50) p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-(--rs-primary-600) shadow-sm">
            <MessageCircle className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-(--rs-neutral-grey-900)">Still stuck?</p>
            <p className="mt-0.5 text-sm text-(--rs-neutral-grey-600)">
              Message your team lead or an admin. You can also revisit your{' '}
              <Link href="/profile" className="font-semibold text-(--rs-primary-600) hover:underline">profile</Link>{' '}
              to update your details.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Build to typecheck the new page**

Run: `npm run build`
Expected: build completes; route list includes `ƒ /help` (no type errors).

- [ ] **Step 3: Lint the new file**

Run: `npx eslint "src/app/(app)/help/page.tsx"`
Expected: exit 0, no output.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/help/page.tsx"
git commit -m "feat: in-app Help & Guide page at /help (role-aware step-by-step)"
```

---

### Task 2: Add the sidebar link

**Files:**
- Modify: `src/components/app-sidebar.tsx`

- [ ] **Step 1: Import the LifeBuoy icon**

In the `lucide-react` import (line 7), add `LifeBuoy` to the destructured list, e.g. change the trailing `…, BookMarked, Timer }` to `…, BookMarked, Timer, LifeBuoy }`.

- [ ] **Step 2: Add the nav item to the `"main"` category**

In the `navItems` array, add this line immediately after the Weekly Reports entry (`{ href: "/weekly-report", … }`):

```tsx
  { href: "/help",              label: "Help & Guide",         icon: LifeBuoy,        category: "main"      },
```

- [ ] **Step 3: Build + lint**

Run: `npm run build && npx eslint src/components/app-sidebar.tsx`
Expected: build completes; eslint exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/components/app-sidebar.tsx
git commit -m "feat: add Help & Guide link to sidebar"
```

---

### Task 3: Visual verification

**Files:** none (manual/automated browser check)

- [ ] **Step 1: Start the dev server**

Run: `npm run dev` (http://localhost:3000)

- [ ] **Step 2: Verify as a regular user**

Log in as a non-admin (e.g. an `ic`), open `/help` via the sidebar "Help & Guide" link. Confirm: header + role badge, section nav (no "Admin tools" pill), daily-flow strip, the four user how-to cards, escalation card. Click a section pill → smooth scroll to that section (heading not hidden under the sticky nav).

- [ ] **Step 3: Verify as an admin**

Log in as an `admin`/`ceo`, open `/help`. Confirm the **Admin tools** section now renders with the three admin cards and the "Admin tools" pill appears in the section nav.

- [ ] **Step 4: Responsive pass**

At 375px and 1024px widths confirm: no horizontal scroll, the daily-flow strip stacks vertically on mobile, cards go single-column on mobile / two-column on desktop.

---

## Self-Review

**Spec coverage:**
- New `/help` server component, role-aware → Task 1. ✓
- Sidebar link for all roles, no RBAC change → Task 2 (default-allow confirmed in spec). ✓
- Section nav + smooth anchors (`scroll-mt-24`, `#id`s) → Task 1 `SectionNav` + section ids. ✓
- Daily flow, user how-tos (clock/overtime accurate to 15h-week, tasks, learning, reports), admin-gated section, escalation footer → Task 1. ✓
- RS design language (tokens, serif headings, rounded-2xl, lucide, numbered steps) → Task 1. ✓
- A11y (focus-visible, cursor-pointer, `<ol>` steps, `<h2>/<h3>`, contrast ≥ grey-600) → Task 1. ✓
- Verification via build + lint + visual → Tasks 1–3. ✓

**Placeholder scan:** none — full page code provided; sidebar edit shown exactly.

**Type consistency:** `HowTo` type defined once and used by `USER_GUIDES`, `ADMIN_GUIDES`, and `HowToCard`; `SectionNav`/`HelpPage` use `isAdmin: boolean`; `roleLabel`/`canAccessAdmin` imported from `@/lib/rbac` (existing). Anchor ids in `SectionNav` (`#daily-flow`, `#clock`, `#tasks`, `#learning`, `#reports`, `#admin-tools`) match the `id=` on each rendered section.

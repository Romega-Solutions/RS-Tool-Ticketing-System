import Link from 'next/link';
import type { ComponentType } from 'react';
import {
  Clock, Timer, CheckSquare, BookMarked, FileText, GraduationCap,
  LayoutDashboard, Briefcase, Shield, BookOpen, CircleDollarSign,
  ArrowRight, Lightbulb,
} from 'lucide-react';

// Single source of truth for the guide. Consumed by both the full /help page and
// the floating help drawer, each via the GuideWizard. Icons match the sidebar
// (app-sidebar.tsx) one-for-one so a page reads the same in its guide step, its
// progress pill, and its nav link.

export type HowTo = {
  id: string;
  icon: ComponentType<{ className?: string }>;
  title: string;
  blurb: string;
  steps: string[];
  tip?: string;
  link?: { href: string; label: string };
  accent?: boolean;
};

export const DAILY_FLOW = [
  { n: 1, icon: Clock,       title: 'Clock in',      desc: 'Start your day from the clock control in the sidebar.' },
  { n: 2, icon: CheckSquare, title: 'Work tasks',    desc: 'Pick up and update items in My Tasks.' },
  { n: 3, icon: BookMarked,  title: 'Keep learning', desc: 'Finish assigned courses in My Learning.' },
  { n: 4, icon: FileText,    title: 'Weekly report', desc: 'Submit your end-of-week status.' },
  { n: 5, icon: Clock,       title: 'Clock out',     desc: 'End your session before logging out.' },
];

// One step per page in the sidebar (same order, same icons).
export const USER_GUIDES: HowTo[] = [
  {
    id: 'clock',
    icon: Clock,
    title: 'Clocking in & out + overtime',
    blurb: 'Track your work hours from anywhere in the app.',
    steps: [
      'Click the clock control in the sidebar (or top bar) and confirm — you’ll show as “in” across the app and your live timer starts.',
      'There is no daily limit. You can work several hours in one sitting; the only cap is 15 hours per Mon–Sun week.',
      'The timer turns amber once your week-to-date total passes 15h — that’s overtime.',
      'At 15h for the week you’re clocked out automatically and shown a prompt. Click “Request overtime” to ask an admin.',
      'Once an admin approves, clock back in and keep working until the end of the day; the limit resumes the next day.',
      'Always clock out before logging out — the app will remind you if you forget.',
    ],
    tip: 'The 15h limit is weekly, not daily — a long day is fine as long as your week stays under 15h.',
    link: { href: '/attendance', label: 'View attendance' },
  },
  {
    id: 'dashboard',
    icon: LayoutDashboard,
    title: 'Dashboard',
    blurb: 'Your at-a-glance overview.',
    steps: [
      'Open Dashboard for a snapshot of what’s happening and what needs your attention.',
      'Leads and admins also see team workload and who’s currently clocked in.',
    ],
    tip: 'Dashboard is the default landing page for leads and admins after login.',
    link: { href: '/dashboard', label: 'Go to Dashboard' },
  },
  {
    id: 'tasks',
    icon: CheckSquare,
    title: 'My Tasks',
    blurb: 'Your work items and their progress.',
    steps: [
      'Open My Tasks to see everything assigned to you.',
      'Click a task to view details and update its status as you make progress.',
    ],
    tip: 'Keep statuses current — your lead’s weekly report is built from them.',
    link: { href: '/my-tasks', label: 'Go to My Tasks' },
  },
  {
    id: 'projects',
    icon: Briefcase,
    title: 'Projects',
    blurb: 'Where your tasks roll up.',
    steps: [
      'Open Projects to see the projects your work belongs to.',
      'Open a project to view its tasks, members, and progress.',
    ],
    tip: 'A project groups related tasks and the people working on them.',
    link: { href: '/projects', label: 'Go to Projects' },
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
      'Finish 100% of a course and a certificate is issued automatically.',
    ],
    tip: 'A required (“hard”) course can block other pages until you finish it — do those first.',
    link: { href: '/learning', label: 'Go to My Learning' },
  },
  {
    id: 'certificates',
    icon: GraduationCap,
    title: 'My Certificates',
    blurb: 'Proof of the courses you’ve completed.',
    steps: [
      'Open My Certificates to see every course you’ve finished.',
      'A new certificate appears automatically when you reach 100% on a course.',
      'Download a certificate PDF anytime for your records.',
    ],
    tip: 'You never request a certificate — it’s generated the moment you hit 100%.',
    link: { href: '/learning/certificates', label: 'Go to My Certificates' },
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
    tip: 'Submit before end of week so your status appears in the team report.',
    link: { href: '/weekly-report', label: 'Go to Weekly Reports' },
  },
];

// One step per Admin page in the sidebar (same order, same icons).
export const ADMIN_GUIDES: HowTo[] = [
  {
    id: 'admin-users',
    icon: Shield,
    title: 'User Management',
    blurb: 'Add teammates and set their access.',
    steps: [
      'Open User Management under Admin.',
      'Invite or edit a user and set their role (IC, Lead, Admin) and team.',
      'Role and team drive what each person sees and which courses auto-assign.',
    ],
    tip: 'Changing someone’s team re-targets which Department courses auto-assign to them.',
    link: { href: '/admin/users', label: 'Open User Management' },
    accent: true,
  },
  {
    id: 'admin-overtime',
    icon: Timer,
    title: 'Overtime Requests',
    blurb: 'Let someone work past the weekly cap.',
    steps: [
      'Open Overtime Requests under Admin.',
      'Review each pending request and Approve or Deny it.',
      'Approving grants overtime for the rest of that person’s day (Asia/Manila).',
    ],
    tip: 'An approval lasts until end of that person’s day, then the 15h weekly cap resumes.',
    link: { href: '/admin/overtime', label: 'Open Overtime Requests' },
    accent: true,
  },
  {
    id: 'admin-learning',
    icon: BookOpen,
    title: 'Manage Learning',
    blurb: 'Author and publish Learning content.',
    steps: [
      'Open Manage Learning under Admin and click “New course”.',
      'Set the title, description, scope (Foundation / Department / Intern), and — for Department — the team.',
      'Open the course and add lessons (text, video, or both).',
      'Optionally attach a quiz with a pass score.',
      'Publish the course — it auto-assigns to the right people by scope, role, and team.',
    ],
    tip: 'A course stays hidden from everyone until you click Publish.',
    link: { href: '/admin/learning', label: 'Open Manage Learning' },
    accent: true,
  },
  {
    id: 'admin-rates',
    icon: CircleDollarSign,
    title: 'Rates & Currency',
    blurb: 'Set pay rates and currency display.',
    steps: [
      'Open Rates & Currency under Admin.',
      'Set each person’s hourly rate; the app shows the live USD→PHP value where relevant.',
    ],
    tip: 'You only set the USD rate — the USD→PHP conversion updates live on its own.',
    link: { href: '/rates', label: 'Open Rates & Currency' },
    accent: true,
  },
];

/** The numbered daily-flow strip (no outer card — callers wrap it). */
export function DailyFlowStrip() {
  return (
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
  );
}

/** One step's full detail — the panel shown for the current wizard step. */
export function StepDetail({ guide }: { guide: HowTo }) {
  const Icon = guide.icon;
  return (
    <div className="rounded-2xl border border-(--rs-neutral-grey-200) bg-white p-6 shadow-sm md:p-8">
      <div className="flex items-start gap-4">
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${guide.accent ? 'bg-(--rs-accent-50) text-(--rs-accent-600)' : 'bg-(--rs-primary-50) text-(--rs-primary-600)'}`}>
          <Icon className="h-6 w-6" />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-serif text-xl font-semibold text-(--rs-neutral-grey-900)">{guide.title}</h3>
            {guide.accent && (
              <span className="rounded-full bg-(--rs-accent-50) px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-(--rs-accent-700)">Admin</span>
            )}
          </div>
          <p className="mt-1 text-sm text-(--rs-neutral-grey-500)">{guide.blurb}</p>
        </div>
      </div>

      <ol className="mt-5 space-y-3">
        {guide.steps.map((step, idx) => (
          <li key={idx} className="flex gap-3 text-sm text-(--rs-neutral-grey-700)">
            <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${guide.accent ? 'bg-(--rs-accent-100) text-(--rs-accent-700)' : 'bg-(--rs-primary-100) text-(--rs-primary-700)'}`}>
              {idx + 1}
            </span>
            <span className="pt-0.5 leading-relaxed">{step}</span>
          </li>
        ))}
      </ol>

      {guide.tip && (
        <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-(--rs-accent-200) bg-(--rs-accent-50) px-4 py-3">
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-(--rs-accent-600)" />
          <p className="text-xs leading-relaxed text-(--rs-accent-800)">{guide.tip}</p>
        </div>
      )}

      {guide.link && (
        <Link
          href={guide.link.href}
          className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-(--rs-primary-500) px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-(--rs-primary-600) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--rs-primary-300)"
        >
          {guide.link.label}
          <ArrowRight className="h-4 w-4" />
        </Link>
      )}
    </div>
  );
}

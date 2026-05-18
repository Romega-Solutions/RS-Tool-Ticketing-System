import Image from 'next/image';
import Link from 'next/link';
import {
  UserPlus, Mail, UserCheck, LayoutDashboard,
  GraduationCap, User, Users, Building2, Shield,
  CheckSquare, Calendar, FileText, BarChart2,
  ArrowLeft, ArrowRight,
} from 'lucide-react';

const FLOW_STEPS = [
  {
    n: 1,
    icon: UserPlus,
    title: 'Create Account',
    desc: 'Sign up with your work or Gmail email on the login page.',
  },
  {
    n: 2,
    icon: Mail,
    title: 'Confirm Email',
    desc: 'Click the confirmation link we send to activate your account.',
  },
  {
    n: 3,
    icon: UserCheck,
    title: 'Set Up Profile',
    desc: 'Choose your role, department, and job title during onboarding.',
  },
  {
    n: 4,
    icon: LayoutDashboard,
    title: 'Start Working',
    desc: 'Access your dashboard, tasks, reports, and team tools.',
  },
];

const ROLES = [
  {
    icon: GraduationCap,
    label: 'Intern',
    color: 'text-(--rs-primary-500)',
    bg: 'bg-(--rs-primary-50)',
    border: 'border-(--rs-primary-200)',
    access: ['My Tasks', 'Projects', 'Weekly Report', 'Profile'],
    note: 'Entry-level access — great for onboarding.',
  },
  {
    icon: User,
    label: 'IC',
    color: 'text-(--rs-primary-600)',
    bg: 'bg-(--rs-primary-50)',
    border: 'border-(--rs-primary-200)',
    access: ['My Tasks', 'Projects', 'Weekly Report', 'Profile'],
    note: 'Standard individual contributor access.',
  },
  {
    icon: Users,
    label: 'IC Lead',
    color: 'text-(--rs-accent-600)',
    bg: 'bg-(--rs-accent-50)',
    border: 'border-(--rs-accent-200)',
    access: ['Everything above', 'Attendance Tracking', 'Team Reports', 'Dashboard'],
    note: 'Team lead with reporting visibility.',
  },
  {
    icon: Building2,
    label: 'CEO',
    color: 'text-(--rs-primary-700)',
    bg: 'bg-(--rs-primary-100)',
    border: 'border-(--rs-primary-300)',
    access: ['Full access', 'All reports', 'All dashboards'],
    note: 'Same permissions as Admin.',
  },
  {
    icon: Shield,
    label: 'Admin',
    color: 'text-(--rs-neutral-grey-700)',
    bg: 'bg-(--rs-neutral-grey-100)',
    border: 'border-(--rs-neutral-grey-300)',
    access: ['Full access', 'User Management', 'All features'],
    note: 'Manages users and system settings.',
  },
];

const FEATURES = [
  {
    icon: CheckSquare,
    title: 'Task Management',
    desc: 'Track your work items and project progress synced from Plane.',
    color: 'text-(--rs-primary-500)',
    bg: 'bg-(--rs-primary-50)',
  },
  {
    icon: Calendar,
    title: 'Attendance Tracking',
    desc: 'Log your daily status — present, WFH, or leave — with clock-in/out.',
    color: 'text-(--rs-accent-500)',
    bg: 'bg-(--rs-accent-50)',
  },
  {
    icon: FileText,
    title: 'Weekly Reports',
    desc: 'Submit your end-of-week status report for team visibility.',
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
  },
  {
    icon: BarChart2,
    title: 'Team Dashboard',
    desc: 'IC Leads and above get a live view of team workload and blockers.',
    color: 'text-(--rs-neutral-grey-600)',
    bg: 'bg-(--rs-neutral-grey-100)',
  },
];

export default function GuidePage() {
  return (
    <div className="min-h-screen bg-(--rs-primary-50) px-4 py-12">
      <div className="mx-auto max-w-4xl animate-auth-enter">

        {/* Header */}
        <div className="mb-10 text-center flex flex-col items-center gap-3">
          <Image
            src="/images/rs-logo.svg"
            alt="Romega Solutions"
            width={148}
            height={44}
            className="object-contain"
            style={{ height: 'auto' }}
            priority
            unoptimized
          />
          <div>
            <h1 className="text-3xl font-serif font-bold text-(--rs-neutral-grey-900)">Getting Started</h1>
            <p className="mt-2 text-sm text-(--rs-neutral-grey-500) max-w-md mx-auto">
              Your visual guide to the RS Ticketing System — everything you need to know before signing up.
            </p>
          </div>
        </div>

        {/* How It Works */}
        <section className="mb-8">
          <div className="rounded-2xl border border-(--color-border) bg-white p-8 shadow-[var(--shadow-elevated)]">
            <h2 className="text-lg font-serif font-bold text-(--rs-neutral-grey-900) mb-6">How It Works</h2>
            <div className="flex flex-col md:flex-row items-start gap-0">
              {FLOW_STEPS.map((step, i) => (
                <div key={step.n} className="flex md:flex-col items-start md:items-center flex-1 gap-4 md:gap-0">
                  {/* Step content */}
                  <div className="flex md:flex-col items-center md:items-center gap-3 flex-1 md:text-center">
                    {/* Circle + connector row */}
                    <div className="flex items-center md:flex-col">
                      <div className="w-10 h-10 rounded-full bg-(--rs-primary-500) text-white flex items-center justify-center shrink-0 shadow-sm">
                        <step.icon className="w-5 h-5" />
                      </div>
                      {/* horizontal connector on desktop */}
                      {i < FLOW_STEPS.length - 1 && (
                        <div className="hidden md:block h-0.5 w-full bg-(--rs-primary-200) mx-0" />
                      )}
                      {/* vertical connector on mobile */}
                      {i < FLOW_STEPS.length - 1 && (
                        <div className="md:hidden w-0.5 h-8 bg-(--rs-primary-200) ml-5 mt-1" />
                      )}
                    </div>
                    <div className="md:mt-3 md:px-2">
                      <div className="flex items-center gap-2 md:justify-center">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-(--rs-primary-400)">{step.n}</span>
                        <p className="text-sm font-bold text-(--rs-neutral-grey-900)">{step.title}</p>
                      </div>
                      <p className="text-xs text-(--rs-neutral-grey-500) mt-1 leading-relaxed">{step.desc}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Roles */}
        <section className="mb-8">
          <div className="rounded-2xl border border-(--color-border) bg-white p-8 shadow-[var(--shadow-elevated)]">
            <h2 className="text-lg font-serif font-bold text-(--rs-neutral-grey-900) mb-2">Choose Your Role</h2>
            <p className="text-sm text-(--rs-neutral-grey-500) mb-6">
              Pick the role that best describes you during onboarding. Your admin can update it anytime.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {ROLES.map(role => (
                <div
                  key={role.label}
                  className={`rounded-xl border-2 ${role.border} ${role.bg} p-4`}
                >
                  <div className="flex items-center gap-2.5 mb-3">
                    <div className={`w-8 h-8 rounded-lg bg-white flex items-center justify-center shadow-sm border ${role.border}`}>
                      <role.icon className={`w-4 h-4 ${role.color}`} />
                    </div>
                    <span className={`text-sm font-bold ${role.color}`}>{role.label}</span>
                  </div>
                  <ul className="space-y-1 mb-3">
                    {role.access.map(item => (
                      <li key={item} className="text-xs text-(--rs-neutral-grey-600) flex items-center gap-1.5">
                        <span className="w-1 h-1 rounded-full bg-(--rs-primary-400) shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                  <p className="text-[11px] text-(--rs-neutral-grey-400) italic">{role.note}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="mb-10">
          <div className="rounded-2xl border border-(--color-border) bg-white p-8 shadow-[var(--shadow-elevated)]">
            <h2 className="text-lg font-serif font-bold text-(--rs-neutral-grey-900) mb-6">What&apos;s Inside</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {FEATURES.map(feat => (
                <div key={feat.title} className="flex items-start gap-3 p-4 rounded-xl border border-(--color-border)">
                  <div className={`w-9 h-9 rounded-lg ${feat.bg} flex items-center justify-center shrink-0`}>
                    <feat.icon className={`w-4 h-4 ${feat.color}`} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-(--rs-neutral-grey-900)">{feat.title}</p>
                    <p className="text-xs text-(--rs-neutral-grey-500) mt-0.5 leading-relaxed">{feat.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/login"
            className="inline-flex items-center gap-2 rounded-xl border border-(--rs-primary-300) bg-white px-5 py-2.5 text-sm font-semibold text-(--rs-primary-600) hover:bg-(--rs-primary-50) transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Sign In
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition-all hover:opacity-90"
            style={{ background: 'var(--color-primary)' }}
          >
            Create Account
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <p className="mt-8 text-center text-xs text-(--color-foreground-subtle)">
          © {new Date().getFullYear()} RS Ticketing System · Internal use only
        </p>
      </div>
    </div>
  );
}

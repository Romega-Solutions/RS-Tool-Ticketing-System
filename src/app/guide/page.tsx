import Image from 'next/image';
import Link from 'next/link';
import {
  GraduationCap, User, Users, Building2, Shield,
  CheckSquare, Calendar, FileText, BarChart2,
  ArrowLeft,
} from 'lucide-react';
import { GoogleIcon } from '@/components/google-icon';
import { SignupStepper } from '@/components/guide/signup-stepper.client';

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
    desc: 'Track your work items and project progress across teams.',
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
    <div className="min-h-screen bg-(--rs-primary-50) px-4 sm:px-6 lg:px-10 py-12">
      <div className="mx-auto w-full max-w-[1600px] animate-auth-enter">

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
              Your visual guide to the RS Ticketing System — everything you need to know before you sign in.
            </p>
          </div>
        </div>

        {/* How you sign in (interactive) */}
        <section className="mb-8">
          <div className="rounded-2xl border border-(--color-border) bg-white p-8 shadow-[var(--shadow-elevated)]">
            <h2 className="text-lg font-serif font-bold text-(--rs-neutral-grey-900)">How you sign in</h2>
            <p className="mt-1 mb-6 text-sm text-(--rs-neutral-grey-500)">
              Sign-in is Google-only — one click, no password to set up. Tap a step to see what happens.
            </p>
            <SignupStepper />
          </div>
        </section>

        {/* Roles */}
        <section className="mb-8">
          <div className="rounded-2xl border border-(--color-border) bg-white p-8 shadow-[var(--shadow-elevated)]">
            <h2 className="text-lg font-serif font-bold text-(--rs-neutral-grey-900) mb-2">Choose Your Role</h2>
            <p className="text-sm text-(--rs-neutral-grey-500) mb-6">
              Pick the role that best describes you during onboarding. Your admin can update it anytime.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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

        {/* CTAs — Google-only sign-in */}
        <div className="flex flex-col-reverse sm:flex-row items-center justify-center gap-3">
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-(--rs-neutral-grey-500) hover:text-(--rs-neutral-grey-800) transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to sign in
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center gap-3 rounded-xl border border-(--rs-neutral-grey-200) bg-white px-6 py-3 text-sm font-semibold text-(--rs-neutral-grey-800) shadow-sm transition-colors hover:bg-(--rs-neutral-grey-50) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--rs-primary-300)"
          >
            <GoogleIcon className="h-4 w-4" />
            Continue with Google
          </Link>
        </div>

        <p className="mt-8 text-center text-xs text-(--color-foreground-subtle)">
          © {new Date().getFullYear()} RS Ticketing System · Internal use only
        </p>
      </div>
    </div>
  );
}

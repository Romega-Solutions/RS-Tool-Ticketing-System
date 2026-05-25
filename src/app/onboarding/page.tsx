'use client';

import { useState, useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Loader2, ArrowRight, Lock, CheckCircle2, User, Users2, Briefcase, GraduationCap, Building2, X, Sparkles } from 'lucide-react';
import type { OrgPerson } from '@/lib/orgchart';
import { createClient } from '@/lib/supabase/client';

const TRUSTED_DOMAINS = ['romega-solutions.com'];

const DEPARTMENTS = [
  'AI & Technology',
  'Design',
  'Social Media',
  'Marketing & Brand Content',
  'Sales & Account Management',
  'Recruitment',
  'Human Resources',
  'Finance & Bookkeeping',
  'Market Research & Analytics',
  'Executive & Admin',
];

const ROLE_OPTS = [
  { value: 'intern', label: 'Intern',      desc: 'My Tasks · Projects · Weekly Report', icon: GraduationCap },
  { value: 'ic',     label: 'IC',          desc: 'My Tasks · Projects · Weekly Report', icon: User          },
  { value: 'lead',   label: 'IC Lead',     desc: 'All above + Attendance · Reports',    icon: Users2        },
  { value: 'ceo',    label: 'CEO',         desc: 'Full access to all features',         icon: Building2     },
] as const;

const onboardingSchema = z.object({
  name:     z.string().min(2, 'Full name must be at least 2 characters'),
  role:     z.enum(['intern', 'ic', 'lead', 'ceo']),
  team:     z.string().min(1, 'Please select a department'),
  jobTitle: z.string().optional(),
});

type OnboardingValues = z.infer<typeof onboardingSchema>;

const STEPS = [
  { n: 1, label: 'Your Name',   desc: 'How your team sees you'              },
  { n: 2, label: 'Your Role',   desc: 'Determines what tools you can access' },
  { n: 3, label: 'Department',  desc: 'Routes reports to the right team'    },
] as const;

export default function OnboardingPage() {
  const router = useRouter();

  const [domainLoading, setDomainLoading]   = useState(true);
  const [isTrusted, setIsTrusted]           = useState(false);
  const [submitted, setSubmitted]           = useState(false);
  const [serverError, setServerError]       = useState('');
  const [errorKey, setErrorKey]             = useState(0);
  const [orgMatch, setOrgMatch]             = useState<OrgPerson | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  const form = useForm<OnboardingValues>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: { name: '', role: 'ic', team: '', jobTitle: '' },
  });

  const { control, setValue, register, handleSubmit, formState: { errors, isSubmitting } } = form;
  const nameValue = useWatch({ control, name: 'name' }) ?? '';
  const roleValue = useWatch({ control, name: 'role' }) ?? 'ic';
  const teamValue = useWatch({ control, name: 'team' }) ?? '';

  const step = nameValue.trim().length >= 2 ? (teamValue ? 3 : 2) : 1;

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      const email   = data.user?.email ?? '';
      const domain  = email.split('@')[1] ?? '';
      const trusted = TRUSTED_DOMAINS.includes(domain);
      setIsTrusted(trusted);
      if (!trusted) setValue('role', 'ic');

      // Pre-fill name from Google OAuth (full_name) or email sign-up (name)
      const oauthName = (
        (data.user?.user_metadata?.full_name as string | undefined) ||
        (data.user?.user_metadata?.name as string | undefined)
      )?.trim();
      if (oauthName) setValue('name', oauthName);

      setDomainLoading(false);

      // Org chart lookup — email is primary, name is fallback
      if (email || (oauthName && oauthName.length >= 2)) {
        try {
          const params = new URLSearchParams();
          if (email) params.set('email', email);
          if (oauthName) params.set('name', oauthName);
          const res = await fetch(`/api/orgchart/lookup?${params.toString()}`);
          if (res.ok) {
            const { match } = await res.json() as { match: OrgPerson | null };
            if (match) {
              setOrgMatch(match);
              setValue('team', match.department, { shouldValidate: true });
              setValue('jobTitle', match.title);
            }
          }
        } catch { /* org chart unavailable — no pre-fill */ }
      }
    });
  }, [setValue]);

  const onSubmit = async (values: OnboardingValues) => {
    setServerError('');
    try {
      const res = await fetch('/api/onboarding', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          name:     values.name,
          team:     values.team,
          jobTitle: values.jobTitle || null,
          role:     values.role,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setServerError(data.error ?? 'Something went wrong');
        setErrorKey(k => k + 1);
        return;
      }
      setSubmitted(true);
      setTimeout(() => { router.push('/dashboard'); router.refresh(); }, 700);
    } catch {
      setServerError('An error occurred. Please try again.');
      setErrorKey(k => k + 1);
    }
  };

  return (
    <div className="flex min-h-screen">

      {/* ── Left: Brand panel ───────────────────────────────── */}
      <div
        className="hidden lg:flex lg:w-[42%] xl:w-[45%] flex-col justify-between p-12 relative overflow-hidden"
        style={{ background: 'linear-gradient(145deg, var(--rs-primary-800) 0%, var(--rs-primary-950) 100%)' }}
      >
        {/* Background orbs */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
          <div className="absolute -top-32 -right-32 w-[440px] h-[440px] rounded-full bg-white/[0.03]" />
          <div className="absolute -bottom-40 -left-20 w-[360px] h-[360px] rounded-full bg-white/[0.03]" />
        </div>

        {/* Logo */}
        <div className="relative z-10">
          <Image src="/images/rs-logo.svg" alt="Romega Solutions" width={132} height={40}
            className="object-contain brightness-0 invert" style={{ height: 'auto' }} priority unoptimized />
        </div>

        {/* Hero copy */}
        <div className="relative z-10 space-y-8">
          <div>
            <h1 className="text-4xl font-serif font-bold leading-[1.2] text-white">
              One last step<br />before you&rsquo;re in.
            </h1>
            <p className="mt-4 text-white/55 text-sm leading-relaxed max-w-xs">
              Tell us a bit about yourself so we can personalise your workspace and show you the right tools.
            </p>
          </div>

          {/* Step preview */}
          <div className="space-y-4">
            {STEPS.map(({ n, label, desc }) => {
              const done   = step > n;
              const active = step === n;
              return (
                <div key={n} className="flex items-start gap-3.5">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 transition-all duration-300 ${
                    done   ? 'bg-(--rs-accent-500) text-white'
                    : active ? 'bg-white text-(--rs-primary-700) ring-2 ring-white/30'
                             : 'bg-white/15 text-white/40'
                  }`}>
                    {done ? <CheckCircle2 className="w-4 h-4" /> : n}
                  </div>
                  <div>
                    <p className={`text-sm font-semibold transition-colors duration-200 ${
                      active ? 'text-white' : done ? 'text-white/60' : 'text-white/35'
                    }`}>{label}</p>
                    <p className={`text-xs mt-0.5 transition-colors duration-200 ${
                      active ? 'text-white/55' : 'text-white/25'
                    }`}>{desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="relative z-10">
          <p className="text-xs text-white/25">© {new Date().getFullYear()} Romega Solutions · Internal use only</p>
        </div>
      </div>

      {/* ── Right: Form panel ───────────────────────────────── */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 bg-white">

        {/* Mobile logo */}
        <div className="mb-8 flex flex-col items-center gap-2 lg:hidden">
          <Image src="/images/rs-logo.svg" alt="Romega Solutions" width={140} height={42}
            className="object-contain" style={{ height: 'auto' }} priority unoptimized />
        </div>

        <div className="w-full max-w-md animate-auth-enter">

          {/* Desktop heading */}
          <div className="hidden lg:block mb-7">
            <h2 className="text-2xl font-serif font-bold text-(--rs-neutral-grey-900)">Set up your profile</h2>
            <p className="mt-1 text-sm text-(--rs-neutral-grey-500)">
              Your admin can update your role or team anytime.
            </p>
          </div>

          {/* Mobile step indicator */}
          <div className="flex items-center justify-between mb-6 lg:hidden">
            {STEPS.map(({ n, label }, i) => {
              const done   = step > n;
              const active = step === n;
              return (
                <div key={n} className="flex items-center flex-1">
                  <div className="flex flex-col items-center gap-1 min-w-0">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${
                      done   ? 'bg-(--rs-primary-500) text-white'
                      : active ? 'bg-(--rs-primary-100) text-(--rs-primary-700) ring-2 ring-(--rs-primary-400)'
                               : 'bg-(--rs-neutral-grey-100) text-(--rs-neutral-grey-400)'
                    }`}>
                      {done ? <CheckCircle2 className="w-3.5 h-3.5" /> : n}
                    </div>
                    <span className={`text-[10px] font-medium ${
                      active ? 'text-(--rs-primary-600)' : done ? 'text-(--rs-primary-500)' : 'text-(--rs-neutral-grey-400)'
                    }`}>{label}</span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className="flex-1 h-0.5 mx-1 mb-4 rounded-full transition-colors duration-500"
                      style={{
                        background: step > n + 1 ? 'var(--rs-primary-500)'
                          : step > n ? 'var(--rs-primary-300)' : 'var(--rs-neutral-grey-200)',
                      }} />
                  )}
                </div>
              );
            })}
          </div>

          {/* Org chart match banner */}
          {orgMatch && !bannerDismissed && (
            <div className="mb-5 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3.5">
              <Sparkles className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-emerald-800">Found in org chart</p>
                <p className="text-xs text-emerald-700 mt-0.5">
                  Department and job title pre-filled from{' '}
                  <span className="font-medium">{orgMatch.name}</span>&rsquo;s profile. You can change them below.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setBannerDismissed(true)}
                className="text-emerald-500 hover:text-emerald-700 transition-colors cursor-pointer"
                aria-label="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Server error */}
          {serverError && (
            <div key={errorKey} className="mb-5 animate-shake rounded-lg border border-red-300 bg-red-50 px-3.5 py-3 text-sm text-red-800">
              {serverError}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">

            {/* ① Full Name */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 mb-2">
                <span className="inline-flex w-5 h-5 items-center justify-center rounded-full bg-(--rs-primary-500) text-white text-[10px] font-bold shrink-0">1</span>
                <label htmlFor="ob-name" className="text-sm font-semibold text-(--rs-neutral-grey-800)">
                  Full Name <span className="text-red-400 font-normal">*</span>
                </label>
              </div>
              <input id="ob-name" type="text" autoFocus
                {...register('name')}
                placeholder="e.g. Jane Dela Cruz"
                className={fieldCls(!!errors.name)} />
              {errors.name && (
                <p className="text-xs text-red-600 animate-slide-up">{errors.name.message}</p>
              )}
            </div>

            {/* ② Role */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 mb-2">
                <span className="inline-flex w-5 h-5 items-center justify-center rounded-full bg-(--rs-primary-500) text-white text-[10px] font-bold shrink-0">2</span>
                <label className="text-sm font-semibold text-(--rs-neutral-grey-800)">Your Role</label>
              </div>

              {domainLoading ? (
                <div className="h-[120px] rounded-xl bg-(--rs-neutral-grey-100) animate-pulse" aria-hidden="true" />
              ) : isTrusted ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2.5">
                    {ROLE_OPTS.map(opt => {
                      const selected = roleValue === opt.value;
                      const Icon = opt.icon;
                      return (
                        <button key={opt.value} type="button"
                          onClick={() => setValue('role', opt.value, { shouldValidate: true })}
                          className={`group rounded-xl border-2 px-3.5 py-3 text-left cursor-pointer transition-all duration-150 ${
                            selected
                              ? 'border-(--rs-primary-500) bg-(--rs-primary-50) animate-card-select'
                              : 'border-(--rs-neutral-grey-200) hover:border-(--rs-primary-300) hover:bg-(--rs-primary-50)'
                          }`}>
                          <div className="flex items-center gap-2 mb-1">
                            <Icon className={`w-3.5 h-3.5 shrink-0 ${selected ? 'text-(--rs-primary-500)' : 'text-(--rs-neutral-grey-400)'}`} />
                            <span className={`text-sm font-semibold ${selected ? 'text-(--rs-primary-700)' : 'text-(--rs-neutral-grey-700)'}`}>
                              {opt.label}
                            </span>
                          </div>
                          <p className={`text-[11px] leading-snug ${selected ? 'text-(--rs-primary-500)' : 'text-(--rs-neutral-grey-400)'}`}>
                            {opt.desc}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-(--rs-neutral-grey-400) flex items-center gap-1">
                    <Lock className="w-3 h-3 shrink-0" />
                    Admin role is assigned by your administrator.
                  </p>
                </div>
              ) : (
                <div className="flex items-center gap-3 rounded-xl border border-(--rs-neutral-grey-200) bg-(--rs-neutral-grey-50) px-4 py-3.5">
                  <div className="w-8 h-8 rounded-lg bg-(--rs-neutral-grey-100) flex items-center justify-center shrink-0">
                    <Briefcase className="h-4 w-4 text-(--rs-neutral-grey-400)" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-(--rs-neutral-grey-700)">Individual Contributor (IC)</p>
                    <p className="text-xs text-(--rs-neutral-grey-400) mt-0.5">
                      Your email domain is not in the trusted list. Your admin can update your role.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* ③ Department */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 mb-2">
                <span className="inline-flex w-5 h-5 items-center justify-center rounded-full bg-(--rs-primary-500) text-white text-[10px] font-bold shrink-0">3</span>
                <label className="text-sm font-semibold text-(--rs-neutral-grey-800)">
                  Department <span className="text-red-400 font-normal">*</span>
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                {DEPARTMENTS.map(dept => {
                  const selected = teamValue === dept;
                  return (
                    <button key={dept} type="button"
                      onClick={() => setValue('team', selected ? '' : dept, { shouldValidate: true })}
                      className={`rounded-full border px-3 py-1 text-sm cursor-pointer transition-all duration-150 ${
                        selected
                          ? 'border-(--rs-primary-500) bg-(--rs-primary-500) text-white animate-pill-select'
                          : 'border-(--rs-neutral-grey-200) text-(--rs-neutral-grey-600) hover:border-(--rs-primary-400) hover:text-(--rs-primary-600)'
                      }`}>
                      {dept}
                    </button>
                  );
                })}
              </div>
              {errors.team && (
                <p className="text-xs text-red-600 animate-slide-up">{errors.team.message}</p>
              )}
            </div>

            {/* Job Title (optional) */}
            <div className="space-y-1.5">
              <label htmlFor="ob-jobtitle" className="block text-sm font-semibold text-(--rs-neutral-grey-800)">
                Job Title{' '}
                <span className="text-xs font-normal text-(--rs-neutral-grey-400)">(optional)</span>
              </label>
              <input id="ob-jobtitle" type="text"
                {...register('jobTitle')}
                placeholder="e.g. Software Engineer, UI/UX Designer…"
                className={fieldCls(false)} />
            </div>

            {/* Submit */}
            <button type="submit" disabled={isSubmitting}
              className={`flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-white transition-all duration-200 cursor-pointer hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 ${
                submitted ? 'bg-green-500' : ''
              }`}
              style={submitted ? {} : { background: 'var(--color-primary)' }}>
              {isSubmitting
                ? <><Loader2 className="h-4 w-4 animate-spin" />Saving…</>
                : submitted
                  ? <><CheckCircle2 className="h-4 w-4" />Done!</>
                  : <><ArrowRight className="h-4 w-4" />Go to Dashboard</>
              }
            </button>

          </form>

          <p className="mt-6 text-center text-xs text-(--color-foreground-subtle)">
            © {new Date().getFullYear()} RS Ticketing System · Internal use only
          </p>

        </div>
      </div>
    </div>
  );
}

function fieldCls(hasError: boolean) {
  return `w-full rounded-lg border px-3.5 py-2.5 text-sm text-(--color-foreground) outline-none transition-all bg-(--color-surface) ${
    hasError
      ? 'border-red-400 focus:shadow-[0_0_0_3px_color-mix(in_srgb,#ef4444_20%,transparent)]'
      : 'border-(--color-border) focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-primary)_20%,transparent)]'
  }`;
}

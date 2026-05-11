'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Loader2, ArrowRight, Lock, CheckCircle2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

const TRUSTED_DOMAINS = ['romega-solutions.com', 'gmail.com'];

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
  { value: 'intern', label: 'Intern',                      desc: 'My Tasks · Projects · Weekly Report' },
  { value: 'ic',     label: 'Individual Contributor (IC)', desc: 'My Tasks · Projects · Weekly Report' },
  { value: 'lead',   label: 'IC Lead',                     desc: 'All above + Attendance · Team Reports' },
  { value: 'ceo',    label: 'CEO',                         desc: 'Full access to all features' },
] as const;

const onboardingSchema = z.object({
  name:     z.string().min(2, 'Full name must be at least 2 characters'),
  role:     z.enum(['intern', 'ic', 'lead', 'ceo']),
  team:     z.string().min(1, 'Please select a department'),
  jobTitle: z.string().optional(),
});

type OnboardingValues = z.infer<typeof onboardingSchema>;

const STEPS = [
  { label: 'Identity',   n: 1 },
  { label: 'Role',       n: 2 },
  { label: 'Department', n: 3 },
] as const;

export default function OnboardingPage() {
  const router = useRouter();

  const [domainLoading, setDomainLoading] = useState(true);
  const [isTrusted, setIsTrusted]         = useState(false);
  const [submitted, setSubmitted]         = useState(false);
  const [serverError, setServerError]     = useState('');
  const [errorKey, setErrorKey]           = useState(0);

  const form = useForm<OnboardingValues>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: { name: '', role: 'ic', team: '', jobTitle: '' },
  });

  const { watch, setValue, register, handleSubmit, formState: { errors, isSubmitting } } = form;
  const nameValue = watch('name');
  const roleValue = watch('role');
  const teamValue = watch('team');

  const step = nameValue.trim().length >= 2 ? (teamValue ? 3 : 2) : 1;

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      const email  = data.user?.email ?? '';
      const domain = email.split('@')[1] ?? '';
      const trusted = TRUSTED_DOMAINS.includes(domain);
      setIsTrusted(trusted);
      if (!trusted) setValue('role', 'ic');
      setDomainLoading(false);
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
    <div className="flex min-h-screen items-center justify-center bg-(--rs-primary-50) px-4 py-12">
      <div className="w-full max-w-lg animate-auth-enter">

        {/* Logo + heading */}
        <div className="mb-8 text-center flex flex-col items-center gap-3">
          <Image src="/images/rs-logo.svg" alt="Romega Solutions" width={140} height={42}
            className="object-contain" priority unoptimized />
          <div>
            <h1 className="text-2xl font-serif font-bold text-(--rs-neutral-grey-900)">Welcome aboard!</h1>
            <p className="mt-1 text-sm text-(--rs-neutral-grey-500)">
              Set up your profile to get started. Your admin can update your role anytime.
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-(--color-border) bg-white p-8 shadow-[var(--shadow-elevated)]">

          {/* Progress indicator */}
          <div className="mb-7 flex items-start">
            {STEPS.map(({ label, n }, i) => {
              const done   = step > n;
              const active = step === n;
              return (
                <div key={n} className="flex items-center flex-1 last:flex-none">
                  <div className="flex flex-col items-center gap-1.5 min-w-[52px]">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${
                      done   ? 'bg-(--rs-primary-500) text-white'
                      : active ? 'bg-(--rs-primary-100) text-(--rs-primary-700) ring-2 ring-(--rs-primary-400)'
                               : 'bg-(--rs-neutral-grey-100) text-(--rs-neutral-grey-400)'
                    }`}>
                      {done ? <CheckCircle2 className="w-4 h-4" /> : n}
                    </div>
                    <span className={`text-[10px] font-medium leading-none transition-colors duration-200 ${
                      active ? 'text-(--rs-primary-600)'
                      : done  ? 'text-(--rs-primary-500)'
                              : 'text-(--rs-neutral-grey-400)'
                    }`}>
                      {label}
                    </span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className="flex-1 mx-1 h-0.5 rounded-full mb-5 transition-colors duration-500"
                      style={{
                        background: step > n + 1
                          ? 'var(--rs-primary-500)'
                          : step > n
                            ? 'var(--rs-primary-300)'
                            : 'var(--rs-neutral-grey-200)',
                      }} />
                  )}
                </div>
              );
            })}
          </div>

          {/* Server error */}
          {serverError && (
            <div key={errorKey} className="mb-5 animate-shake rounded-lg border border-red-300 bg-red-50 px-3.5 py-3 text-sm text-red-800">
              {serverError}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">

            {/* Step 1 — Name */}
            <div className="space-y-1.5">
              <label htmlFor="ob-name" className="block text-sm font-medium text-(--rs-neutral-grey-800)">
                Full Name <span className="text-red-500">*</span>
              </label>
              <input id="ob-name" type="text" autoFocus
                {...register('name')}
                placeholder="e.g. Jane Dela Cruz"
                className={fieldCls(!!errors.name)} />
              {errors.name && (
                <p className="text-xs text-red-600 animate-slide-up">{errors.name.message}</p>
              )}
            </div>

            {/* Step 2 — Role */}
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-(--rs-neutral-grey-800)">Your Role</label>

              {domainLoading ? (
                <div className="h-[100px] rounded-xl bg-(--rs-neutral-grey-100) animate-pulse" aria-hidden="true" />
              ) : isTrusted ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    {ROLE_OPTS.map(opt => {
                      const selected = roleValue === opt.value;
                      return (
                        <button key={opt.value} type="button"
                          onClick={() => setValue('role', opt.value, { shouldValidate: true })}
                          className={`rounded-xl border-2 px-4 py-3 text-left text-sm cursor-pointer transition-all duration-150 ${
                            selected
                              ? 'border-(--rs-primary-500) bg-(--rs-primary-50) text-(--rs-primary-700) font-semibold animate-card-select'
                              : 'border-(--rs-neutral-grey-200) text-(--rs-neutral-grey-600) hover:border-(--rs-primary-300) hover:bg-(--rs-primary-50)'
                          }`}>
                          <div className="font-semibold">{opt.label}</div>
                          <div className={`mt-0.5 text-[11px] ${selected ? 'text-(--rs-primary-500)' : 'text-(--rs-neutral-grey-400)'}`}>{opt.desc}</div>
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-(--rs-neutral-grey-400)">
                    Admin role is assigned by your administrator.
                  </p>
                </>
              ) : (
                <div className="flex items-center gap-3 rounded-xl border border-(--rs-neutral-grey-200) bg-(--rs-neutral-grey-50) px-4 py-3">
                  <Lock className="h-4 w-4 text-(--rs-neutral-grey-400) shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-(--rs-neutral-grey-700)">Individual Contributor (IC)</p>
                    <p className="text-xs text-(--rs-neutral-grey-400)">
                      Your domain is not in the trusted list. Role is assigned by your administrator.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Step 3 — Department */}
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-(--rs-neutral-grey-800)">
                Department <span className="text-red-500">*</span>
              </label>
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

            {/* Job Title */}
            <div className="space-y-1.5">
              <label htmlFor="ob-jobtitle" className="block text-sm font-medium text-(--rs-neutral-grey-800)">
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
              className={`mt-2 flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-white transition-all duration-200 cursor-pointer hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 ${
                submitted ? 'bg-green-500' : ''
              }`}
              style={submitted ? {} : { background: 'var(--color-primary)' }}>
              {isSubmitting
                ? <><Loader2 className="h-4 w-4 animate-spin" />Saving…</>
                : submitted
                  ? <><CheckCircle2 className="h-4 w-4" />Done!</>
                  : <><ArrowRight className="h-4 w-4" />Go to Dashboard</>}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-(--color-foreground-subtle)">
          © {new Date().getFullYear()} RS Ticketing System. Internal use only.
        </p>
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

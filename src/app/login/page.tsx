'use client';

import { Suspense, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, EyeOff, Loader2, LogIn, UserPlus, MailCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

const ROMEGA_DOMAIN = 'romega-solutions.com';
const SHOW_DEMO = process.env.NEXT_PUBLIC_SHOW_DEMO_ACCOUNTS === 'true';

const demoUsers = [
  { email: 'ken@romega-solutions.com',  password: 'Demo@1234', role: 'CEO / Admin' },
  { email: 'mark@romega-solutions.com', password: 'Demo@1234', role: 'Lead (Tech)' },
  { email: 'anna@romega-solutions.com', password: 'Demo@1234', role: 'Lead (Design)' },
  { email: 'john@romega-solutions.com', password: 'Demo@1234', role: 'IC (Tech)' },
];

const signInSchema = z.object({
  email:    z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});

const signUpSchema = z.object({
  name:     z.string().min(2, 'Name must be at least 2 characters'),
  email:    z.string().email('Enter a valid email'),
  password: z.string().min(8, 'Minimum 8 characters'),
});

type SignInValues = z.infer<typeof signInSchema>;
type SignUpValues = z.infer<typeof signUpSchema>;

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}

function LoginContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const authError    = searchParams.get('error');

  const [tab, setTab]               = useState<'signin' | 'signup'>('signin');
  const [showPassword, setShowPass]  = useState(false);
  const [signUpDone, setSignUpDone]  = useState(false);
  const [signUpEmail, setSignUpEmail] = useState('');
  const [serverError, setServerError] = useState(
    authError === 'auth_failed' ? 'Email confirmation failed. Please try again.' : ''
  );
  const [errorKey, setErrorKey] = useState(0);

  const signInForm = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '', password: '' },
  });

  const signUpForm = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { name: '', email: '', password: '' },
  });

  const pushError = (msg: string) => {
    setServerError(msg);
    setErrorKey(k => k + 1);
  };

  const handleSignIn = async (values: SignInValues) => {
    setServerError('');
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: values.email,
        password: values.password,
      });
      if (error) {
        pushError(error.message === 'Invalid login credentials'
          ? 'Invalid email or password'
          : error.message);
        return;
      }
      router.push('/dashboard');
      router.refresh();
    } catch {
      pushError('An error occurred. Please try again.');
    }
  };

  const handleSignUp = async (values: SignUpValues) => {
    setServerError('');
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signUp({
        email:    values.email.trim().toLowerCase(),
        password: values.password,
        options: {
          data:             { name: values.name.trim() },
          emailRedirectTo:  `${window.location.origin}/auth/callback`,
        },
      });
      if (error) { pushError(error.message); return; }
      setSignUpEmail(values.email);
      setSignUpDone(true);
    } catch {
      pushError('An error occurred. Please try again.');
    }
  };

  const switchTab = (t: 'signin' | 'signup') => {
    setTab(t);
    setServerError('');
    setSignUpDone(false);
    signInForm.reset();
    signUpForm.reset();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-(--rs-primary-50) px-4 py-12">
      <div className="w-full max-w-md animate-auth-enter">

        {/* Logo + title */}
        <div className="mb-8 text-center flex flex-col items-center gap-3">
          <Image src="/images/rs-logo.svg" alt="Romega Solutions" width={160} height={48}
            className="object-contain" priority unoptimized />
          <div>
            <h1 className="text-xl font-serif font-bold text-(--rs-neutral-grey-900)">Ticketing System</h1>
            <p className="mt-1 text-sm text-(--rs-neutral-grey-600)">Internal workspace — Romega Solutions</p>
          </div>
        </div>

        <div className="rounded-2xl border border-(--color-border) bg-white shadow-[var(--shadow-elevated)] overflow-hidden">

          {/* Tabs */}
          <div className="flex border-b border-(--rs-neutral-grey-100)">
            {(['signin', 'signup'] as const).map(t => (
              <button key={t} onClick={() => switchTab(t)} className={`flex-1 py-3 text-sm font-semibold transition-colors cursor-pointer ${
                tab === t
                  ? 'text-(--rs-primary-600) border-b-2 border-(--rs-primary-500) bg-white'
                  : 'text-(--rs-neutral-grey-400) hover:text-(--rs-neutral-grey-700) bg-(--rs-neutral-grey-50)'
              }`}>
                {t === 'signin' ? 'Sign In' : 'Create Account'}
              </button>
            ))}
          </div>

          {/* Panel — key triggers tab-enter animation on switch */}
          <div className="p-8">
            <div key={tab} className="animate-tab-enter">

              {/* ── Sign In ──────────────────────────────────────────── */}
              {tab === 'signin' && (
                <>
                  {SHOW_DEMO && (
                    <div className="mb-5 rounded-lg border border-(--rs-primary-200) bg-(--rs-primary-50) p-3">
                      <p className="text-xs font-semibold uppercase tracking-wider text-(--rs-primary-700)">Demo Accounts</p>
                      <div className="mt-2 grid grid-cols-1 gap-2">
                        {demoUsers.map(acc => (
                          <button key={acc.email} type="button"
                            onClick={() => {
                              signInForm.setValue('email', acc.email);
                              signInForm.setValue('password', acc.password);
                              setServerError('');
                            }}
                            className="w-full rounded-md border border-(--rs-primary-200) bg-white px-2.5 py-2 text-left text-xs hover:bg-(--rs-primary-100) transition-colors cursor-pointer">
                            <div className="font-semibold text-(--rs-neutral-grey-900)">{acc.role}</div>
                            <div className="text-(--rs-neutral-grey-500)">{acc.email} · {acc.password}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <form onSubmit={signInForm.handleSubmit(handleSignIn)} noValidate className="space-y-5">
                    {serverError && (
                      <div key={errorKey} className="animate-shake rounded-lg border border-red-300 bg-red-50 px-3.5 py-3 text-sm text-red-800">
                        {serverError}
                      </div>
                    )}

                    <Field label="Email" htmlFor="si-email" error={signInForm.formState.errors.email?.message}>
                      <input id="si-email" type="email" autoComplete="email"
                        disabled={signInForm.formState.isSubmitting}
                        {...signInForm.register('email')}
                        className={inputCls(!!signInForm.formState.errors.email)} />
                    </Field>

                    <Field label="Password" htmlFor="si-password" error={signInForm.formState.errors.password?.message}>
                      <PasswordInput
                        id="si-password"
                        register={signInForm.register('password')}
                        hasError={!!signInForm.formState.errors.password}
                        disabled={signInForm.formState.isSubmitting}
                        show={showPassword}
                        onToggle={() => setShowPass(v => !v)}
                        autoComplete="current-password"
                      />
                    </Field>

                    <SubmitBtn loading={signInForm.formState.isSubmitting} label="Sign In" loadingLabel="Signing in…"
                      icon={<LogIn className="h-4 w-4" />} />
                  </form>
                </>
              )}

              {/* ── Sign Up ──────────────────────────────────────────── */}
              {tab === 'signup' && (
                signUpDone ? (
                  <div className="text-center py-4 space-y-3 animate-slide-up">
                    <MailCheck className="h-12 w-12 text-(--rs-primary-500) mx-auto" />
                    <h2 className="font-serif text-lg font-bold text-(--rs-neutral-grey-900)">Check your email</h2>
                    <p className="text-sm text-(--rs-neutral-grey-600)">
                      We sent a confirmation link to <strong>{signUpEmail}</strong>. Click it to activate your account.
                    </p>
                    <button onClick={() => switchTab('signin')}
                      className="text-sm text-(--rs-primary-600) hover:underline mt-2 cursor-pointer">
                      Back to sign in
                    </button>
                  </div>
                ) : (
                  <form onSubmit={signUpForm.handleSubmit(handleSignUp)} noValidate className="space-y-5">
                    {serverError && (
                      <div key={errorKey} className="animate-shake rounded-lg border border-red-300 bg-red-50 px-3.5 py-3 text-sm text-red-800">
                        {serverError}
                      </div>
                    )}

                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
                      Anyone can create an account. <strong>@{ROMEGA_DOMAIN}</strong> emails can choose their role; others are assigned IC.
                    </div>

                    <Field label="Full Name" htmlFor="su-name" error={signUpForm.formState.errors.name?.message}>
                      <input id="su-name" type="text" autoComplete="name"
                        disabled={signUpForm.formState.isSubmitting}
                        {...signUpForm.register('name')}
                        placeholder="e.g. Jane Dela Cruz"
                        className={inputCls(!!signUpForm.formState.errors.name)} />
                    </Field>

                    <Field label="Work Email" htmlFor="su-email" error={signUpForm.formState.errors.email?.message}>
                      <input id="su-email" type="email" autoComplete="email"
                        disabled={signUpForm.formState.isSubmitting}
                        {...signUpForm.register('email')}
                        placeholder={`you@${ROMEGA_DOMAIN}`}
                        className={inputCls(!!signUpForm.formState.errors.email)} />
                    </Field>

                    <Field label="Password" htmlFor="su-password" error={signUpForm.formState.errors.password?.message}>
                      <PasswordInput
                        id="su-password"
                        register={signUpForm.register('password')}
                        hasError={!!signUpForm.formState.errors.password}
                        disabled={signUpForm.formState.isSubmitting}
                        show={showPassword}
                        onToggle={() => setShowPass(v => !v)}
                        autoComplete="new-password"
                        placeholder="Min 8 characters"
                      />
                    </Field>

                    <SubmitBtn loading={signUpForm.formState.isSubmitting} label="Create Account" loadingLabel="Creating…"
                      icon={<UserPlus className="h-4 w-4" />} />
                  </form>
                )
              )}

            </div>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-(--color-foreground-subtle)">
          © {new Date().getFullYear()} RS Ticketing System. Internal use only.
        </p>
      </div>
    </div>
  );
}

/* ── Shared sub-components ───────────────────────────────────── */

function Field({
  label, htmlFor, error, children,
}: {
  label: string; htmlFor: string; error?: string; children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-(--color-foreground)">{label}</label>
      {children}
      {error && <p className="text-xs text-red-600 animate-slide-up">{error}</p>}
    </div>
  );
}

function PasswordInput({
  id, register, hasError, disabled, show, onToggle, autoComplete, placeholder,
}: {
  id: string;
  register: ReturnType<ReturnType<typeof useForm>['register']>;
  hasError: boolean;
  disabled: boolean;
  show: boolean;
  onToggle: () => void;
  autoComplete?: string;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <input id={id} type={show ? 'text' : 'password'}
        autoComplete={autoComplete}
        disabled={disabled}
        placeholder={placeholder}
        {...register}
        className={`${inputCls(hasError)} pr-10`} />
      <button type="button" tabIndex={-1}
        aria-label={show ? 'Hide password' : 'Show password'}
        onClick={onToggle}
        className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-0.5 text-(--color-foreground-subtle) cursor-pointer">
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

function SubmitBtn({
  loading, label, loadingLabel, icon,
}: {
  loading: boolean; label: string; loadingLabel: string; icon: React.ReactNode;
}) {
  return (
    <button type="submit" disabled={loading}
      className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-(--color-primary-foreground) transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-75 cursor-pointer"
      style={{ background: 'var(--color-primary)' }}>
      {loading ? <><Loader2 className="h-4 w-4 animate-spin" />{loadingLabel}</> : <>{icon}{label}</>}
    </button>
  );
}

function inputCls(hasError: boolean) {
  return `w-full rounded-lg border px-3.5 py-2.5 text-sm text-(--color-foreground) outline-none transition-all bg-(--color-surface) ${
    hasError
      ? 'border-red-400 focus:shadow-[0_0_0_3px_color-mix(in_srgb,#ef4444_20%,transparent)]'
      : 'border-(--color-border) focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-primary)_20%,transparent)]'
  }`;
}

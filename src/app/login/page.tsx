'use client';

import { Suspense, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, EyeOff, Loader2, LogIn, UserPlus, MailCheck, CheckSquare, Clock, FileText, BarChart2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

const TRUSTED_DOMAINS_LABEL = '@romega-solutions.com or @gmail.com';
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
  const [navigating, setNavigating] = useState(false);

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

  const handleGoogleSignIn = async () => {
    setServerError('');
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) pushError(error.message);
    } catch {
      pushError('An error occurred. Please try again.');
    }
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
      setNavigating(true);
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

  const brandFeatures = [
    { icon: CheckSquare, text: 'Plane-powered task tracking' },
    { icon: Clock,       text: 'Attendance & clock-in/out' },
    { icon: FileText,    text: 'Weekly status reports' },
    { icon: BarChart2,   text: 'Dashboard for leads & above' },
  ];

  return (
    <div className="flex min-h-screen">

      {/* ── Left: Brand panel ───────────────────────────────── */}
      <div className="hidden lg:flex lg:w-[52%] xl:w-[55%] flex-col justify-between p-12 relative overflow-hidden"
        style={{ background: 'linear-gradient(145deg, var(--rs-primary-800) 0%, var(--rs-primary-950) 100%)' }}>

        {/* Background orbs */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
          <div className="absolute -top-32 -right-32 w-[480px] h-[480px] rounded-full bg-white/[0.03]" />
          <div className="absolute -bottom-40 -left-20 w-[400px] h-[400px] rounded-full bg-white/[0.03]" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full bg-white/[0.02]" />
        </div>

        {/* Logo */}
        <div className="relative z-10">
          <Image src="/images/rs-logo.svg" alt="Romega Solutions" width={132} height={40}
            className="object-contain brightness-0 invert" style={{ height: 'auto' }} priority unoptimized />
        </div>

        {/* Hero copy + features */}
        <div className="relative z-10 space-y-8">
          <div>
            <h1 className="text-4xl font-serif font-bold leading-[1.2] text-white">
              Your team.<br />Your tasks.<br />All in one place.
            </h1>
            <p className="mt-4 text-white/55 text-sm leading-relaxed max-w-xs">
              RS Ticketing System keeps Romega Solutions teams aligned — track work, log time, and submit weekly reports without leaving the page.
            </p>
          </div>

          <div className="space-y-3">
            {brandFeatures.map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-3 text-sm text-white/70">
                <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                  <Icon className="w-3.5 h-3.5 text-white" />
                </div>
                {text}
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="relative z-10">
          <p className="text-xs text-white/25">© {new Date().getFullYear()} Romega Solutions · Internal use only</p>
        </div>
      </div>

      {/* ── Right: Form panel ───────────────────────────────── */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 bg-white">

        {/* Mobile-only logo */}
        <div className="mb-8 flex flex-col items-center gap-2 lg:hidden">
          <Image src="/images/rs-logo.svg" alt="Romega Solutions" width={140} height={42}
            className="object-contain" style={{ height: 'auto' }} priority unoptimized />
          <p className="text-sm text-(--rs-neutral-grey-600)">Internal workspace — Romega Solutions</p>
        </div>

        <div className="w-full max-w-sm animate-auth-enter">

          {/* Desktop heading */}
          <div className="hidden lg:block mb-7">
            <h2 className="text-2xl font-serif font-bold text-(--rs-neutral-grey-900)">
              {tab === 'signin' ? 'Welcome back' : 'Create account'}
            </h2>
            <p className="mt-1 text-sm text-(--rs-neutral-grey-500)">
              {tab === 'signin'
                ? 'Sign in to your Romega workspace'
                : 'Join the Romega Solutions workspace'}
            </p>
          </div>

          {/* Tabs */}
          <div className="flex mb-6 rounded-xl border border-(--rs-neutral-grey-200) bg-(--rs-neutral-grey-50) p-1 gap-1">
            {(['signin', 'signup'] as const).map(t => (
              <button key={t} onClick={() => switchTab(t)}
                className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-all cursor-pointer ${
                  tab === t
                    ? 'bg-white text-(--rs-primary-600) shadow-sm'
                    : 'text-(--rs-neutral-grey-400) hover:text-(--rs-neutral-grey-700)'
                }`}>
                {t === 'signin' ? 'Sign In' : 'Create Account'}
              </button>
            ))}
          </div>

          {/* Panel — key triggers tab-enter animation on switch */}
          <div key={tab} className="animate-tab-enter">

            {/* ── Sign In ──────────────────────────────────────── */}
            {tab === 'signin' && (
              <>
                <GoogleButton onClick={handleGoogleSignIn} />
                <OrDivider />

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

            {/* ── Sign Up ──────────────────────────────────────── */}
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
                <>
                <GoogleButton onClick={handleGoogleSignIn} />
                <OrDivider />
                <form onSubmit={signUpForm.handleSubmit(handleSignUp)} noValidate className="space-y-5">
                  {serverError && (
                    <div key={errorKey} className="animate-shake rounded-lg border border-red-300 bg-red-50 px-3.5 py-3 text-sm text-red-800">
                      {serverError}
                    </div>
                  )}

                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
                    Anyone can create an account. <strong>{TRUSTED_DOMAINS_LABEL}</strong> can choose their role; others are assigned IC.
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
                      placeholder="you@romega-solutions.com"
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
                </>
              )
            )}

          </div>

          {/* Footer links */}
          <div className="mt-8 text-center space-y-1.5">
            <p className="text-xs text-(--color-foreground-subtle)">
              © {new Date().getFullYear()} RS Ticketing System · Internal use only
            </p>
            <p className="text-xs">
              <a href="/guide" className="text-(--rs-primary-600) hover:underline font-medium">
                How it works →
              </a>
            </p>
          </div>

        </div>
      </div>

      {/* ── Transition overlay ─────────────────────────────── */}
      {navigating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white animate-fade-in">
          <div className="flex flex-col items-center gap-5">
            <Image src="/images/rs-logo.svg" alt="Romega Solutions" width={148} height={44}
              className="object-contain" style={{ height: 'auto' }} unoptimized />
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-(--rs-primary-500)" />
              <p className="text-sm font-medium text-(--rs-neutral-grey-600)">Loading your workspace…</p>
            </div>
          </div>
        </div>
      )}
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

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

function GoogleButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-center gap-3 rounded-xl border border-(--color-border) bg-white py-2.5 text-sm font-medium text-(--color-foreground) transition-all hover:bg-(--rs-neutral-grey-50) cursor-pointer shadow-sm"
    >
      <GoogleIcon />
      Continue with Google
    </button>
  );
}

function OrDivider() {
  return (
    <div className="relative my-5">
      <div className="absolute inset-0 flex items-center" aria-hidden="true">
        <div className="w-full border-t border-(--color-border)" />
      </div>
      <div className="relative flex justify-center">
        <span className="bg-white px-3 text-xs text-(--rs-neutral-grey-400)">or continue with email</span>
      </div>
    </div>
  );
}

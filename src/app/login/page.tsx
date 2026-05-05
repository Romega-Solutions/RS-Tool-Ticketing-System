'use client';

import { Suspense, useState } from 'react';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, EyeOff, Loader2, LogIn, UserPlus } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

const ALLOWED_DOMAIN = 'romega.solutions';

const demoUsers = [
  { email: 'ken@romega.solutions',   password: 'Demo@1234', role: 'CEO / Admin' },
  { email: 'mark@romega.solutions',  password: 'Demo@1234', role: 'Lead (Tech)' },
  { email: 'anna@romega.solutions',  password: 'Demo@1234', role: 'Lead (Design)' },
  { email: 'john@romega.solutions',  password: 'Demo@1234', role: 'IC (Tech)' },
];

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const authError = searchParams.get('error');

  const [tab, setTab] = useState<'signin' | 'signup'>('signin');
  const [error, setError] = useState(
    authError === 'auth_failed' ? 'Email confirmation failed. Please try again.' : ''
  );
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [signUpDone, setSignUpDone] = useState(false);

  // Sign-in fields
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');

  // Sign-up fields
  const [suName, setSuName]         = useState('');
  const [suEmail, setSuEmail]       = useState('');
  const [suPassword, setSuPassword] = useState('');

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) {
        setError(authError.message === 'Invalid login credentials'
          ? 'Invalid email or password'
          : authError.message);
        return;
      }
      router.push('/dashboard');
      router.refresh();
    } catch {
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const trimmedEmail = suEmail.trim().toLowerCase();
    const domain = trimmedEmail.split('@')[1] ?? '';
    if (domain !== ALLOWED_DOMAIN) {
      setError(`Only @${ALLOWED_DOMAIN} email addresses can sign up.`);
      setLoading(false);
      return;
    }

    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signUp({
        email: trimmedEmail,
        password: suPassword,
        options: {
          data: { name: suName.trim() },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (authError) {
        setError(authError.message);
        return;
      }

      setSignUpDone(true);
    } catch {
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const switchTab = (t: 'signin' | 'signup') => {
    setTab(t);
    setError('');
    setSignUpDone(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-(--rs-primary-50) px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center flex flex-col items-center gap-3">
          <Image src="/images/rs-logo.svg" alt="Romega Solutions" width={160} height={48}
            className="object-contain" priority unoptimized />
          <div>
            <h1 className="text-xl font-serif font-bold text-(--rs-neutral-grey-900)">Ticketing System</h1>
            <p className="mt-1 text-sm text-(--rs-neutral-grey-600)">Internal workspace — Romega Solutions</p>
          </div>
        </div>

        <div className="rounded-2xl border border-(--color-border) bg-white shadow-[var(--shadow-elevated)] overflow-hidden">
          {/* Tab bar */}
          <div className="flex border-b border-(--rs-neutral-grey-100)">
            {(['signin', 'signup'] as const).map((t) => (
              <button
                key={t}
                onClick={() => switchTab(t)}
                className={`flex-1 py-3 text-sm font-semibold transition-colors ${
                  tab === t
                    ? 'text-(--rs-primary-600) border-b-2 border-(--rs-primary-500) bg-white'
                    : 'text-(--rs-neutral-grey-400) hover:text-(--rs-neutral-grey-700) bg-(--rs-neutral-grey-50)'
                }`}
              >
                {t === 'signin' ? 'Sign In' : 'Create Account'}
              </button>
            ))}
          </div>

          <div className="p-8">
            {/* ── Sign In ────────────────────────────────────────────────── */}
            {tab === 'signin' && (
              <>
                <div className="mb-5 rounded-lg border border-(--rs-primary-200) bg-(--rs-primary-50) p-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-(--rs-primary-700)">Demo Accounts</p>
                  <div className="mt-2 grid grid-cols-1 gap-2">
                    {demoUsers.map((account) => (
                      <button key={account.email} type="button"
                        onClick={() => { setEmail(account.email); setPassword(account.password); setError(''); }}
                        className="w-full rounded-md border border-(--rs-primary-200) bg-white px-2.5 py-2 text-left text-xs hover:bg-(--rs-primary-100)">
                        <div className="font-semibold text-(--rs-neutral-grey-900)">{account.role}</div>
                        <div className="text-(--rs-neutral-grey-500)">{account.email} · {account.password}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <form onSubmit={handleSignIn} className="space-y-5">
                  {error && <ErrorBox message={error} />}

                  <FormField label="Email">
                    <input id="email" type="email" autoComplete="email" required disabled={loading}
                      value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
                  </FormField>

                  <FormField label="Password">
                    <PasswordInput value={password} onChange={setPassword} disabled={loading}
                      show={showPassword} onToggle={() => setShowPassword(v => !v)} />
                  </FormField>

                  <SubmitButton loading={loading} label="Sign In" loadingLabel="Signing in…" icon={<LogIn className="h-4 w-4" />} />
                </form>
              </>
            )}

            {/* ── Sign Up ────────────────────────────────────────────────── */}
            {tab === 'signup' && (
              signUpDone ? (
                <div className="text-center py-4 space-y-3">
                  <div className="text-4xl">📬</div>
                  <h2 className="font-serif text-lg font-bold text-(--rs-neutral-grey-900)">Check your email</h2>
                  <p className="text-sm text-(--rs-neutral-grey-600)">
                    We sent a confirmation link to <strong>{suEmail}</strong>. Click it to activate your account and get started.
                  </p>
                  <button onClick={() => switchTab('signin')}
                    className="text-sm text-(--rs-primary-600) hover:underline mt-2">
                    Back to sign in
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSignUp} className="space-y-5">
                  {error && <ErrorBox message={error} />}

                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
                    Only <strong>@{ALLOWED_DOMAIN}</strong> email addresses can create an account.
                  </div>

                  <FormField label="Full Name">
                    <input type="text" autoComplete="name" required disabled={loading}
                      value={suName} onChange={(e) => setSuName(e.target.value)}
                      placeholder="e.g. Jane Dela Cruz" className={inputCls} />
                  </FormField>

                  <FormField label="Work Email">
                    <input type="email" autoComplete="email" required disabled={loading}
                      value={suEmail} onChange={(e) => setSuEmail(e.target.value)}
                      placeholder={`you@${ALLOWED_DOMAIN}`} className={inputCls} />
                  </FormField>

                  <FormField label="Password">
                    <PasswordInput value={suPassword} onChange={setSuPassword} disabled={loading}
                      show={showPassword} onToggle={() => setShowPassword(v => !v)}
                      placeholder="Min 8 characters" minLength={8} />
                  </FormField>

                  <SubmitButton loading={loading} label="Create Account" loadingLabel="Creating…"
                    icon={<UserPlus className="h-4 w-4" />} />
                </form>
              )
            )}
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-(--color-foreground-subtle)">
          © {new Date().getFullYear()} RS Ticketing System. Internal use only.
        </p>
      </div>
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-red-300 bg-red-50 px-3.5 py-3 text-sm text-red-800">
      {message}
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-(--color-foreground)">{label}</label>
      {children}
    </div>
  );
}

function PasswordInput({ value, onChange, disabled, show, onToggle, placeholder, minLength }: {
  value: string; onChange: (v: string) => void; disabled: boolean;
  show: boolean; onToggle: () => void; placeholder?: string; minLength?: number;
}) {
  return (
    <div className="relative">
      <input type={show ? 'text' : 'password'} autoComplete="current-password" required
        disabled={disabled} value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder} minLength={minLength}
        className={`${inputCls} pr-10`} />
      <button type="button" tabIndex={-1} onClick={onToggle}
        className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-0.5 text-(--color-foreground-subtle)"
        aria-label={show ? 'Hide password' : 'Show password'}>
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

function SubmitButton({ loading, label, loadingLabel, icon }: {
  loading: boolean; label: string; loadingLabel: string; icon: React.ReactNode;
}) {
  return (
    <button type="submit" disabled={loading}
      className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-(--color-primary-foreground) transition-all disabled:cursor-not-allowed disabled:opacity-85"
      style={{ background: 'var(--color-primary)' }}>
      {loading ? <><Loader2 className="h-4 w-4 animate-spin" />{loadingLabel}</> : <>{icon}{label}</>}
    </button>
  );
}

const inputCls = 'w-full rounded-lg border border-(--color-border) bg-(--color-surface) px-3.5 py-2.5 text-sm text-(--color-foreground) outline-none transition-all focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-primary)_20%,transparent)]';

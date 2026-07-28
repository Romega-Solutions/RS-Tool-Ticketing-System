'use client';

import { Suspense, useState } from 'react';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { Loader2, CheckSquare, Clock, FileText, BarChart2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}

function LoginContent() {
  const searchParams = useSearchParams();
  const authError    = searchParams.get('error');
  const staleReason  = searchParams.get('reason');
  const isStale      = searchParams.get('stale') === '1';

  const [serverError, setServerError] = useState(() => {
    if (authError === 'auth_failed')   return 'Sign-in failed. Please try again.';
    if (authError === 'signup_failed') return 'Account setup failed. Please contact your admin.';
    if (authError === 'not_allowed')   return 'This Google email is not listed in the Romega Org Chart. Please ask an admin to add it first.';
    if (isStale && staleReason === 'inactive') {
      return 'Your account is inactive. Please contact your admin to re-activate it.';
    }
    if (isStale) return 'Your session expired. Please sign in again.';
    return '';
  });
  const [errorKey, setErrorKey]   = useState(0);
  const [connecting, setConnecting] = useState(false);

  const pushError = (msg: string) => {
    setServerError(msg);
    setErrorKey(k => k + 1);
    setConnecting(false);
  };

  const handleGoogleSignIn = async () => {
    setServerError('');
    setConnecting(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) pushError(error.message);
      // On success the browser is redirected to Google — no further UI needed.
    } catch {
      pushError('An error occurred. Please try again.');
    }
  };

  const [devEmail, setDevEmail]       = useState('ken@romega-solutions.com');
  const [devPassword, setDevPassword] = useState('Demo@1234');
  const [devSigningIn, setDevSigningIn] = useState(false);

  const handleDevPasswordSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError('');
    setDevSigningIn(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({ email: devEmail, password: devPassword });
      if (error) { pushError(error.message); setDevSigningIn(false); return; }
      window.location.href = '/dashboard';
    } catch {
      pushError('An error occurred. Please try again.');
      setDevSigningIn(false);
    }
  };

  const brandFeatures = [
    { icon: CheckSquare, text: 'Task & ticket tracking' },
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

      {/* ── Right: Sign-in panel ────────────────────────────── */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 bg-white">

        {/* Mobile-only logo */}
        <div className="mb-8 flex flex-col items-center gap-2 lg:hidden">
          <Image src="/images/rs-logo.svg" alt="Romega Solutions" width={140} height={42}
            className="object-contain" style={{ height: 'auto' }} priority unoptimized />
          <p className="text-sm text-(--rs-neutral-grey-600)">Internal workspace — Romega Solutions</p>
        </div>

        <div className="w-full max-w-sm animate-auth-enter">

          {/* Heading */}
          <div className="mb-7 text-center lg:text-left">
            <h2 className="text-2xl font-serif font-bold text-(--rs-neutral-grey-900)">Welcome back</h2>
            <p className="mt-1 text-sm text-(--rs-neutral-grey-500)">Sign in to your Romega workspace</p>
          </div>

          {serverError && (
            <div key={errorKey} className="animate-shake mb-5 rounded-lg border border-red-300 bg-red-50 px-3.5 py-3 text-sm text-red-800">
              {serverError}
            </div>
          )}

          <GoogleButton onClick={handleGoogleSignIn} loading={connecting} />

          <p className="mt-4 text-center text-xs text-(--rs-neutral-grey-500)">
            Access is limited to emails listed in the Romega Org Chart.
          </p>

          {process.env.NODE_ENV === 'development' && (
            <div className="mt-6 rounded-lg border border-dashed border-(--color-border) p-4">
              <p className="mb-3 text-xs font-medium text-(--rs-neutral-grey-500)">
                Dev only — password sign-in (local Supabase)
              </p>
              <form onSubmit={handleDevPasswordSignIn} className="space-y-2">
                <input
                  type="email"
                  value={devEmail}
                  onChange={e => setDevEmail(e.target.value)}
                  placeholder="email"
                  className="w-full rounded-md border border-(--color-border) px-3 py-2 text-sm"
                />
                <input
                  type="password"
                  value={devPassword}
                  onChange={e => setDevPassword(e.target.value)}
                  placeholder="password"
                  className="w-full rounded-md border border-(--color-border) px-3 py-2 text-sm"
                />
                <button
                  type="submit"
                  disabled={devSigningIn}
                  className="w-full rounded-md bg-(--rs-neutral-grey-900) py-2 text-sm font-medium text-white disabled:opacity-60 cursor-pointer"
                >
                  {devSigningIn ? 'Signing in…' : 'Sign in (dev)'}
                </button>
              </form>
            </div>
          )}

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
    </div>
  );
}

/* ── Google sign-in button ───────────────────────────────────── */

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

function GoogleButton({ onClick, loading }: { onClick: () => void; loading: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="flex w-full items-center justify-center gap-3 rounded-xl border border-(--color-border) bg-white py-3 text-sm font-medium text-(--color-foreground) transition-all hover:bg-(--rs-neutral-grey-50) disabled:cursor-not-allowed disabled:opacity-75 cursor-pointer shadow-sm"
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleIcon />}
      {loading ? 'Connecting to Google…' : 'Continue with Google'}
    </button>
  );
}

'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Loader2, LogIn } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

const demoUsers = [
  { email: 'ken@romega.solutions',   password: 'Demo@1234', role: 'CEO / Admin' },
  { email: 'mark@romega.solutions',  password: 'Demo@1234', role: 'Lead (Tech)' },
  { email: 'anna@romega.solutions',  password: 'Demo@1234', role: 'Lead (Design)' },
  { email: 'john@romega.solutions',  password: 'Demo@1234', role: 'IC (Tech)' },
];

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
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

  return (
    <div className="flex min-h-screen items-center justify-center bg-(--rs-primary-50) px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center flex flex-col items-center gap-3">
          <Image
            src="/images/rs-logo.svg"
            alt="Romega Solutions"
            width={160}
            height={48}
            className="object-contain"
            priority
            unoptimized
          />
          <div>
            <h1 className="text-xl font-serif font-bold text-(--rs-neutral-grey-900)">Ticketing System</h1>
            <p className="mt-1 text-sm text-(--rs-neutral-grey-600)">Sign in to your workspace</p>
          </div>
        </div>

        <div className="rounded-2xl border border-(--color-border) bg-white p-8 shadow-[var(--shadow-elevated)]">
          <div className="mb-5 rounded-lg border border-(--rs-primary-200) bg-(--rs-primary-50) p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-(--rs-primary-700)">Demo Accounts</p>
            <div className="mt-2 grid grid-cols-1 gap-2">
              {demoUsers.map((account) => (
                <button
                  key={account.email}
                  type="button"
                  onClick={() => {
                    setEmail(account.email);
                    setPassword(account.password);
                    setError('');
                  }}
                  className="w-full rounded-md border border-(--rs-primary-200) bg-white px-2.5 py-2 text-left text-xs hover:bg-(--rs-primary-100)"
                >
                  <div className="font-semibold text-(--rs-neutral-grey-900)">{account.role}</div>
                  <div className="text-(--rs-neutral-grey-500)">{account.email} · {account.password}</div>
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error ? (
              <div className="rounded-lg border border-red-300 bg-red-50 px-3.5 py-3 text-sm text-red-800">
                {error}
              </div>
            ) : null}

            <div className="space-y-1.5">
              <label htmlFor="email" className="block text-sm font-medium text-(--color-foreground)">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                disabled={loading}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-(--color-border) bg-(--color-surface) px-3.5 py-2.5 text-sm text-(--color-foreground) outline-none transition-all focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-primary)_20%,transparent)]"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="block text-sm font-medium text-(--color-foreground)">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  disabled={loading}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-(--color-border) bg-(--color-surface) py-2.5 pl-3.5 pr-10 text-sm text-(--color-foreground) outline-none transition-all focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-primary)_20%,transparent)]"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-0.5 text-(--color-foreground-subtle) transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-(--color-primary-foreground) transition-all disabled:cursor-not-allowed disabled:opacity-85"
              style={{ background: 'var(--color-primary)' }}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  <LogIn className="h-4 w-4" />
                  Sign in
                </>
              )}
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

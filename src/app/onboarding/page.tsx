'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Loader2, ArrowRight } from 'lucide-react';

const TEAMS     = ['Tech', 'Design', 'Operations', 'Marketing', 'Other'];
const ROLE_OPTS = [
  { value: 'ic',   label: 'Individual Contributor (IC)' },
  { value: 'lead', label: 'Team Lead' },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const [name, setName]         = useState('');
  const [team, setTeam]         = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [role, setRole]         = useState('ic');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, team, jobTitle, role }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) { setError(data.error ?? 'Something went wrong'); return; }
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
      <div className="w-full max-w-lg">
        <div className="mb-8 text-center flex flex-col items-center gap-3">
          <Image src="/images/rs-logo.svg" alt="Romega Solutions" width={140} height={42}
            className="object-contain" priority unoptimized />
          <div>
            <h1 className="text-2xl font-serif font-bold text-(--rs-neutral-grey-900)">Welcome aboard!</h1>
            <p className="mt-1 text-sm text-(--rs-neutral-grey-500)">
              Fill in a few details to set up your profile. Your admin can update your role anytime.
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-(--color-border) bg-white p-8 shadow-[var(--shadow-elevated)]">
          {error && (
            <div className="mb-5 rounded-lg border border-red-300 bg-red-50 px-3.5 py-3 text-sm text-red-800">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Name */}
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-(--rs-neutral-grey-800)">
                Full Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                autoFocus
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Jane Dela Cruz"
                className={inputCls}
              />
            </div>

            {/* Role */}
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-(--rs-neutral-grey-800)">
                Your Role
              </label>
              <div className="grid grid-cols-2 gap-3">
                {ROLE_OPTS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setRole(opt.value)}
                    className={`rounded-xl border-2 px-4 py-3 text-left text-sm transition-colors ${
                      role === opt.value
                        ? 'border-(--rs-primary-500) bg-(--rs-primary-50) text-(--rs-primary-700) font-semibold'
                        : 'border-(--rs-neutral-grey-200) text-(--rs-neutral-grey-600) hover:border-(--rs-neutral-grey-300)'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-(--rs-neutral-grey-400) mt-1">
                Admin / CEO roles are assigned by your administrator.
              </p>
            </div>

            {/* Team */}
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-(--rs-neutral-grey-800)">Team</label>
              <div className="flex flex-wrap gap-2">
                {TEAMS.map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTeam(team === t ? '' : t)}
                    className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                      team === t
                        ? 'border-(--rs-primary-500) bg-(--rs-primary-500) text-white'
                        : 'border-(--rs-neutral-grey-200) text-(--rs-neutral-grey-600) hover:border-(--rs-primary-300)'
                    }`}
                  >
                    {t}
                  </button>
                ))}
                {/* Custom team input */}
                {!TEAMS.includes(team) && team && (
                  <span className="rounded-full border border-(--rs-primary-500) bg-(--rs-primary-500) text-white px-3 py-1 text-sm">
                    {team}
                  </span>
                )}
              </div>
              <input
                type="text"
                value={team}
                onChange={e => setTeam(e.target.value)}
                placeholder="Or type a custom team name…"
                className={`${inputCls} mt-2`}
              />
            </div>

            {/* Job Title */}
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-(--rs-neutral-grey-800)">Job Title</label>
              <input
                type="text"
                value={jobTitle}
                onChange={e => setJobTitle(e.target.value)}
                placeholder="e.g. Software Engineer, UI/UX Designer…"
                className={inputCls}
              />
            </div>

            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-white transition-all disabled:cursor-not-allowed disabled:opacity-60"
              style={{ background: 'var(--color-primary)' }}
            >
              {loading
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
                : <><ArrowRight className="h-4 w-4" /> Go to Dashboard</>}
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

const inputCls = 'w-full rounded-lg border border-(--color-border) bg-(--color-surface) px-3.5 py-2.5 text-sm text-(--color-foreground) outline-none transition-all focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-primary)_20%,transparent)]';

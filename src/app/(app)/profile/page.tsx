'use client';

import { useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';

type ProfileUser = {
  id: number;
  username: string;
  name: string;
  email: string;
  role: string;
  team: string | null;
  jobTitle: string | null;
  planeMemberId?: string | null;
  isActive: boolean;
};

const inputBase =
  'w-full rounded-lg border border-(--rs-neutral-grey-200) px-3 py-2.5 text-sm text-(--rs-neutral-grey-900) outline-none transition-all focus:border-(--rs-primary-400) focus:ring-2 focus:ring-(--rs-primary-100)';

const inputDisabled =
  'w-full rounded-lg border border-(--rs-neutral-grey-200) bg-(--rs-neutral-grey-50) px-3 py-2.5 text-sm text-(--rs-neutral-grey-400) cursor-not-allowed';

export default function ProfilePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [user, setUser] = useState<ProfileUser | null>(null);
  const [form, setForm] = useState({
    name: '',
    email: '',
    team: '',
    jobTitle: '',
    password: '',
  });

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await fetch('/api/profile/me', { cache: 'no-store' });
        const data = await res.json() as { user?: ProfileUser; error?: string };
        if (!res.ok || !data.user) {
          setError(data.error || 'Failed to load profile');
          return;
        }
        setUser(data.user);
        setForm({
          name: data.user.name || '',
          email: data.user.email || '',
          team: data.user.team || '',
          jobTitle: data.user.jobTitle || '',
          password: '',
        });
      } catch {
        setError('Failed to load profile');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch('/api/profile/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json() as { user?: ProfileUser; error?: string };
      if (!res.ok || !data.user) {
        setError(data.error || 'Failed to update profile');
        return;
      }
      setUser(data.user);
      setForm(prev => ({ ...prev, password: '' }));
      setSuccess('Profile updated successfully.');
    } catch {
      setError('Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-serif font-bold text-(--rs-neutral-grey-900)">My Profile</h1>
        <div className="flex items-center gap-2 text-(--rs-neutral-grey-500)">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Loading profile…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-serif font-bold text-(--rs-neutral-grey-900)">My Profile</h1>
        <p className="text-sm text-(--rs-neutral-grey-500) mt-1">Manage your account information and password.</p>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2.5 text-sm text-green-700">
          {success}
        </div>
      )}

      <form onSubmit={handleSave} className="rounded-xl border border-(--rs-neutral-grey-200) bg-white p-6 space-y-5 max-w-2xl shadow-sm">

        {/* Read-only info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold uppercase tracking-wide text-(--rs-neutral-grey-500)">
              Username
            </label>
            <input value={user?.username || ''} disabled className={inputDisabled} />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold uppercase tracking-wide text-(--rs-neutral-grey-500)">
              Role
            </label>
            <input value={user?.role || ''} disabled className={inputDisabled} />
          </div>
        </div>

        <div className="border-t border-(--rs-neutral-grey-100)" />

        {/* Editable fields */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="name" className="block text-sm font-medium text-(--rs-neutral-grey-700)">
              Full Name <span className="text-red-500">*</span>
            </label>
            <input
              id="name"
              value={form.name}
              onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
              required
              className={inputBase}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="email" className="block text-sm font-medium text-(--rs-neutral-grey-700)">
              Email <span className="text-red-500">*</span>
            </label>
            <input
              id="email"
              type="email"
              value={form.email}
              onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))}
              required
              className={inputBase}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="team" className="block text-sm font-medium text-(--rs-neutral-grey-700)">
              Team
            </label>
            <input
              id="team"
              value={form.team}
              onChange={e => setForm(prev => ({ ...prev, team: e.target.value }))}
              placeholder="e.g. Engineering"
              className={inputBase}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="jobTitle" className="block text-sm font-medium text-(--rs-neutral-grey-700)">
              Job Title
            </label>
            <input
              id="jobTitle"
              value={form.jobTitle}
              onChange={e => setForm(prev => ({ ...prev, jobTitle: e.target.value }))}
              placeholder="e.g. Full-Stack Developer"
              className={inputBase}
            />
          </div>
        </div>

        <div className="border-t border-(--rs-neutral-grey-100)" />

        <div className="space-y-1.5">
          <label htmlFor="password" className="block text-sm font-medium text-(--rs-neutral-grey-700)">
            New Password <span className="text-(--rs-neutral-grey-400) font-normal">(optional)</span>
          </label>
          <input
            id="password"
            type="password"
            value={form.password}
            onChange={e => setForm(prev => ({ ...prev, password: e.target.value }))}
            placeholder="Leave blank to keep current password"
            className={inputBase}
          />
          <p className="text-xs text-(--rs-neutral-grey-400)">Minimum 8 characters if provided.</p>
        </div>

        {/* Plane Member ID (read-only info) */}
        {user?.planeMemberId !== undefined && (
          <div className="rounded-lg border border-(--rs-primary-100) bg-(--rs-primary-50) px-4 py-3 text-sm">
            <div className="font-medium text-(--rs-primary-700)">Plane Member ID</div>
            <div className="text-(--rs-primary-600) font-mono text-xs mt-0.5">
              {user.planeMemberId || (
                <span className="italic text-(--rs-neutral-grey-400) font-sans">Not set — ask your admin to configure this</span>
              )}
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-(--rs-primary-500) px-5 py-2.5 text-sm font-semibold text-white hover:bg-(--rs-primary-600) transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? 'Saving…' : 'Save Profile'}
        </button>
      </form>
    </div>
  );
}

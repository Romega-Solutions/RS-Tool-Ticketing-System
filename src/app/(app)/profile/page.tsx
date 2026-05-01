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
  isActive: boolean;
};

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
      setForm((prev) => ({ ...prev, password: '' }));
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
        <div className="flex items-center gap-2 text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading profile...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-serif font-bold text-(--rs-neutral-grey-900)">My Profile</h1>

      {error ? <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {success ? <p className="rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-700">{success}</p> : null}

      <form onSubmit={handleSave} className="rounded-xl border border-slate-200 bg-white p-6 space-y-4 max-w-2xl">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="username" className="text-sm font-medium text-slate-700">Username</label>
            <input
              id="username"
              value={user?.username || ''}
              disabled
              className="w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-500"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="role" className="text-sm font-medium text-slate-700">Role</label>
            <input
              id="role"
              value={user?.role || ''}
              disabled
              className="w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="name" className="text-sm font-medium text-slate-700">Full Name</label>
            <input
              id="name"
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="email" className="text-sm font-medium text-slate-700">Email</label>
            <input
              id="email"
              type="email"
              value={form.email}
              onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="team" className="text-sm font-medium text-slate-700">Team</label>
            <input
              id="team"
              value={form.team}
              onChange={(e) => setForm((prev) => ({ ...prev, team: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="jobTitle" className="text-sm font-medium text-slate-700">Job Title</label>
            <input
              id="jobTitle"
              value={form.jobTitle}
              onChange={(e) => setForm((prev) => ({ ...prev, jobTitle: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="password" className="text-sm font-medium text-slate-700">New Password (optional)</label>
          <input
            id="password"
            type="password"
            value={form.password}
            onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
            placeholder="Leave blank to keep current password"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <p className="text-xs text-slate-500">If provided, password must be at least 8 characters.</p>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-(--rs-primary-500) px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? 'Saving...' : 'Save Profile'}
        </button>
      </form>
    </div>
  );
}

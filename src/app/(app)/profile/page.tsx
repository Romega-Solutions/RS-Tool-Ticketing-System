'use client';

import { useEffect, useState } from 'react';
import { Loader2, Save, RefreshCw } from 'lucide-react';
import type { OrgPerson } from '@/lib/orgchart';

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
  reminderEnabled: boolean;
  reminderIntervalMinutes: number;
};

const inputBase =
  'w-full rounded-lg border border-(--rs-neutral-grey-200) px-3 py-2.5 text-sm text-(--rs-neutral-grey-900) outline-none transition-all focus:border-(--rs-primary-400) focus:ring-2 focus:ring-(--rs-primary-100)';

const inputDisabled =
  'w-full rounded-lg border border-(--rs-neutral-grey-200) bg-(--rs-neutral-grey-50) px-3 py-2.5 text-sm text-(--rs-neutral-grey-400) cursor-not-allowed';

export default function ProfilePage() {
  const [loading, setLoading]                   = useState(true);
  const [saving, setSaving]                     = useState(false);
  const [syncing, setSyncing]                   = useState(false);
  const [syncMsg, setSyncMsg]                   = useState('');
  const [error, setError]                       = useState('');
  const [success, setSuccess]                   = useState('');
  const [user, setUser]                         = useState<ProfileUser | null>(null);
  const [availableTeams, setAvailableTeams]     = useState<string[]>([]);
  const [availableJobTitles, setAvailableJobTitles] = useState<string[]>([]);
  const [form, setForm] = useState({
    name: '',
    team: '',
    jobTitle: '',
    password: '',
    reminderEnabled: true,
    reminderIntervalMinutes: 120,
  });

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await fetch('/api/profile/me', { cache: 'no-store' });
        const data = await res.json() as {
          user?: ProfileUser;
          availableTeams?: string[];
          availableJobTitles?: string[];
          error?: string;
        };
        if (!res.ok || !data.user) {
          setError(data.error || 'Failed to load profile');
          return;
        }
        setUser(data.user);
        setAvailableTeams(data.availableTeams ?? []);
        setAvailableJobTitles(data.availableJobTitles ?? []);
        setForm({
          name:                    data.user.name || '',
          team:                    data.user.team || '',
          jobTitle:                data.user.jobTitle || '',
          password:                '',
          reminderEnabled:         data.user.reminderEnabled ?? true,
          reminderIntervalMinutes: data.user.reminderIntervalMinutes ?? 120,
        });
      } catch {
        setError('Failed to load profile');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const handleOrgSync = async () => {
    const name = form.name.trim();
    if (!name) return;
    setSyncing(true);
    setSyncMsg('');
    setError('');
    try {
      const res = await fetch(`/api/orgchart/lookup?name=${encodeURIComponent(name)}`);
      const data = await res.json() as { match: OrgPerson | null };
      if (data.match) {
        setForm(prev => ({ ...prev, team: data.match!.department, jobTitle: data.match!.title }));
        setSyncMsg(`Synced from org chart — ${data.match.name}. Save to apply.`);
      } else {
        setSyncMsg('No org chart profile found for this name.');
      }
    } catch {
      setSyncMsg('Could not reach org chart. Try again later.');
    } finally {
      setSyncing(false);
    }
  };

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

        {/* Read-only account info */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold uppercase tracking-wide text-(--rs-neutral-grey-500)">
              Email
            </label>
            <input value={user?.email || ''} disabled className={inputDisabled} />
          </div>
        </div>

        <div className="border-t border-(--rs-neutral-grey-100)" />

        {/* Editable fields */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="name" className="block text-sm font-medium text-(--rs-neutral-grey-700)">
              Full Name <span className="text-red-500">*</span>
            </label>
            <button
              type="button"
              onClick={handleOrgSync}
              disabled={syncing || !form.name.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-(--rs-neutral-grey-200) px-2.5 py-1 text-xs font-medium text-(--rs-neutral-grey-600) hover:border-(--rs-primary-400) hover:text-(--rs-primary-600) transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              <RefreshCw className={`w-3 h-3 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing…' : 'Sync from Org Chart'}
            </button>
          </div>
          <input
            id="name"
            value={form.name}
            onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
            required
            className={inputBase}
          />
          {syncMsg && (
            <p className={`text-xs ${syncMsg.startsWith('Synced') ? 'text-emerald-600' : 'text-(--rs-neutral-grey-500)'}`}>
              {syncMsg}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="team" className="block text-sm font-medium text-(--rs-neutral-grey-700)">
              Team
            </label>
            <select
              id="team"
              value={form.team}
              onChange={e => setForm(prev => ({ ...prev, team: e.target.value }))}
              className={inputBase + ' bg-white cursor-pointer'}
            >
              <option value="">— No team</option>
              {/* Preserve current value if it's not in the fetched list */}
              {form.team && !availableTeams.includes(form.team) && (
                <option value={form.team}>{form.team}</option>
              )}
              {availableTeams.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="jobTitle" className="block text-sm font-medium text-(--rs-neutral-grey-700)">
              Job Title
            </label>
            <select
              id="jobTitle"
              value={form.jobTitle}
              onChange={e => setForm(prev => ({ ...prev, jobTitle: e.target.value }))}
              className={inputBase + ' bg-white cursor-pointer'}
            >
              <option value="">— No title</option>
              {/* Preserve current value if it's not in the fetched list */}
              {form.jobTitle && !availableJobTitles.includes(form.jobTitle) && (
                <option value={form.jobTitle}>{form.jobTitle}</option>
              )}
              {availableJobTitles.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
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

        <div className="border-t border-(--rs-neutral-grey-100)" />

        {/* Clock-Out Reminders */}
        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-(--rs-neutral-grey-800)">Clock-Out Reminders</h3>
            <p className="text-xs text-(--rs-neutral-grey-400) mt-0.5">
              Get notified when you&apos;ve been clocked in for too long.
            </p>
          </div>

          <label className="flex items-center gap-3 cursor-pointer select-none">
            <div className="relative">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={form.reminderEnabled}
                onChange={e => setForm(prev => ({ ...prev, reminderEnabled: e.target.checked }))}
              />
              <div className="w-9 h-5 rounded-full bg-(--rs-neutral-grey-200) peer-checked:bg-(--rs-primary-500) transition-colors" />
              <div className="absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
            </div>
            <span className="text-sm text-(--rs-neutral-grey-700)">Enable reminders</span>
          </label>

          {form.reminderEnabled && (
            <div className="space-y-1.5">
              <label htmlFor="reminderInterval" className="block text-sm font-medium text-(--rs-neutral-grey-700)">
                Remind me every
              </label>
              <select
                id="reminderInterval"
                value={form.reminderIntervalMinutes}
                onChange={e => setForm(prev => ({ ...prev, reminderIntervalMinutes: Number(e.target.value) }))}
                className={inputBase + ' bg-white cursor-pointer'}
              >
                <option value={30}>30 minutes</option>
                <option value={60}>1 hour</option>
                <option value={120}>2 hours (default)</option>
                <option value={180}>3 hours</option>
              </select>
            </div>
          )}
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

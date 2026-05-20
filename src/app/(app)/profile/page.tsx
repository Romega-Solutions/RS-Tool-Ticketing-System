'use client';

import { useEffect, useState } from 'react';
import { Loader2, Save, RefreshCw, CheckCircle2 } from 'lucide-react';
import type { OrgPerson } from '@/lib/orgchart';

type ProfileUser = {
  id: number;
  username: string;
  name: string;
  email: string;
  role: string;
  team: string | null;
  jobTitle: string | null;
  hourlyRateUsd?: number | null;
  isActive: boolean;
  reminderEnabled: boolean;
  reminderIntervalMinutes: number;
};

type FxRate = { rate: number; fetchedAt: string; stale: boolean };

const inputBase =
  'w-full rounded-lg border border-(--rs-neutral-grey-200) px-3 py-2 text-sm text-(--rs-neutral-grey-900) outline-none transition-all focus:border-(--rs-primary-400) focus:ring-2 focus:ring-(--rs-primary-100)';
const labelCls = 'block text-xs font-semibold uppercase tracking-wide text-(--rs-neutral-grey-500) mb-1';

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  const has = value != null && String(value).trim() !== '';
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-2.5">
      <span className="text-xs font-medium text-(--rs-neutral-grey-500)">{label}</span>
      <span className={`text-sm text-right truncate ${has ? 'font-medium text-(--rs-neutral-grey-900)' : 'italic text-(--rs-neutral-grey-400)'}`}>
        {has ? value : 'Not set'}
      </span>
    </div>
  );
}

function OrgAvatar({ person, size = 80 }: { person: OrgPerson; size?: number }) {
  const initials = person.name
    .split(' ').filter(Boolean).slice(0, 2)
    .map(n => n[0]?.toUpperCase() ?? '').join('');

  if (person.photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={person.photoUrl}
        alt={person.name}
        className="rounded-full object-cover border-2 border-(--rs-neutral-grey-200) shrink-0"
        style={{ width: size, height: size }}
        onError={e => {
          const el = e.currentTarget as HTMLImageElement;
          el.style.display = 'none';
          el.nextElementSibling?.removeAttribute('style');
        }}
      />
    );
  }

  return (
    <div
      className="rounded-full flex items-center justify-center font-bold text-white shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.3, background: 'var(--rs-primary-500)' }}
    >
      {initials}
    </div>
  );
}

export default function ProfilePage() {
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [syncing, setSyncing]   = useState(false);
  const [error, setError]       = useState('');
  const [success, setSuccess]   = useState('');
  const [syncMsg, setSyncMsg]   = useState('');
  const [user, setUser]         = useState<ProfileUser | null>(null);
  const [orgProfile, setOrgProfile] = useState<OrgPerson | null>(null);
  const [orgLoading, setOrgLoading] = useState(false);
  const [fx, setFx] = useState<FxRate | null>(null);
  // Identity is read-only and sourced from the org chart; only password +
  // reminder settings remain editable here.
  const [form, setForm] = useState({
    password: '', reminderEnabled: true, reminderIntervalMinutes: 120,
  });

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res  = await fetch('/api/profile/me', { cache: 'no-store' });
        const data = await res.json() as { user?: ProfileUser; error?: string };
        if (!res.ok || !data.user) { setError(data.error || 'Failed to load profile'); return; }
        setUser(data.user);
        setForm({
          password: '',
          reminderEnabled: data.user.reminderEnabled ?? true,
          reminderIntervalMinutes: data.user.reminderIntervalMinutes ?? 120,
        });

        if (data.user.email || data.user.name) {
          setOrgLoading(true);
          const p = new URLSearchParams();
          if (data.user.email) p.set('email', data.user.email);
          if (data.user.name)  p.set('name',  data.user.name);
          fetch(`/api/orgchart/lookup?${p}`)
            .then(r => r.json())
            .then(({ match }: { match: OrgPerson | null }) => setOrgProfile(match ?? null))
            .catch(() => setOrgProfile(null))
            .finally(() => setOrgLoading(false));
        }
      } catch { setError('Failed to load profile'); }
      finally  { setLoading(false); }
    };
    void load();
  }, []);

  // Live USD→PHP rate — only fetched when the user actually has a rate set.
  useEffect(() => {
    if (user?.hourlyRateUsd == null) return;
    let active = true;
    const pull = async () => {
      try {
        const res  = await fetch('/api/fx/usd-php', { cache: 'no-store' });
        const data = await res.json() as { rate?: number; fetchedAt?: string; stale?: boolean; error?: string };
        if (active && res.ok && typeof data.rate === 'number') {
          setFx({ rate: data.rate, fetchedAt: data.fetchedAt ?? new Date().toISOString(), stale: Boolean(data.stale) });
        }
      } catch { /* keep last known */ }
    };
    void pull();
    const id = setInterval(pull, 5 * 60 * 1000); // refresh every 5 min
    return () => { active = false; clearInterval(id); };
  }, [user?.hourlyRateUsd]);

  // Single read-only identity, sourced from the org chart with a graceful
  // fallback to the stored account values when there is no org chart match.
  const identity = {
    linked:     Boolean(orgProfile),
    name:       orgProfile?.name          ?? user?.name      ?? '',
    title:      orgProfile?.title         ?? user?.jobTitle  ?? null,
    department: orgProfile?.department    ?? user?.team      ?? null,
    reportsTo:  orgProfile?.reportsToName ?? null,
    email:      orgProfile?.email         ?? user?.email     ?? '',
  };

  const handleOrgSync = async () => {
    const lookupName = user?.name?.trim() ?? '';
    if (!lookupName && !user?.email) return;
    setSyncing(true); setSyncMsg(''); setError('');
    try {
      const p = new URLSearchParams();
      if (user?.email) p.set('email', user.email);
      if (lookupName)  p.set('name',  lookupName);
      const res  = await fetch(`/api/orgchart/lookup?${p}`);
      const data = await res.json() as { match: OrgPerson | null };
      if (data.match) {
        setOrgProfile(data.match);
        setSyncMsg(`Matched — ${data.match.name}`);
      } else { setSyncMsg('No match found.'); }
    } catch { setSyncMsg('Could not reach org chart.'); }
    finally  { setSyncing(false); }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError(''); setSuccess('');
    try {
      // Identity is read-only; we still send it so the DB stays in sync with
      // the org chart. The API requires a non-empty name.
      const payload = {
        name:     identity.name || user?.name || '',
        team:     identity.department,
        jobTitle: identity.title,
        password: form.password,
        reminderEnabled: form.reminderEnabled,
        reminderIntervalMinutes: form.reminderIntervalMinutes,
      };
      const res  = await fetch('/api/profile/me', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json() as { user?: ProfileUser; error?: string };
      if (!res.ok || !data.user) { setError(data.error || 'Failed to update profile'); return; }
      setUser(data.user);
      setForm(prev => ({ ...prev, password: '' }));
      setSuccess('Saved.');
    } catch { setError('Failed to update profile'); }
    finally  { setSaving(false); }
  };

  if (loading) return (
    <div className="flex items-center gap-2 text-(--rs-neutral-grey-500) pt-8">
      <Loader2 className="h-4 w-4 animate-spin" />
      <span className="text-sm">Loading profile…</span>
    </div>
  );

  return (
    <div className="flex flex-col gap-4 h-full">

      {/* ── Page header ── */}
      <div>
        <h1 className="text-2xl font-serif font-bold text-(--rs-neutral-grey-900) leading-tight">My Profile</h1>
        <p className="text-sm text-(--rs-neutral-grey-500) mt-0.5">Manage your account information and preferences.</p>
      </div>

      {/* ── Two-column layout ── */}
      <div className="flex-1 grid grid-cols-[260px_1fr] gap-4 min-h-0">

        {/* ── Left: Org Chart Identity ── */}
        <div className="rounded-xl border border-(--rs-neutral-grey-200) bg-white shadow-sm flex flex-col overflow-hidden">
          {/* Card header */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-(--rs-neutral-grey-100) bg-(--rs-neutral-grey-50) shrink-0">
            <span className="text-[10px] font-bold uppercase tracking-widest text-(--rs-neutral-grey-500)">Org Chart</span>
            {orgLoading
              ? <span className="flex items-center gap-1 text-[11px] text-(--rs-neutral-grey-400)"><Loader2 className="w-3 h-3 animate-spin" />Fetching…</span>
              : orgProfile
                ? <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-600"><CheckCircle2 className="w-3 h-3" />Matched</span>
                : <span className="text-[11px] text-(--rs-neutral-grey-400)">Not found</span>
            }
          </div>

          {/* Identity body */}
          <div className="flex-1 flex flex-col items-center justify-center p-5 gap-3 text-center">
            {orgLoading ? (
              <>
                <div className="w-20 h-20 rounded-full bg-(--rs-neutral-grey-100) animate-pulse" />
                <div className="space-y-2 w-full">
                  <div className="h-4 w-3/4 mx-auto rounded bg-(--rs-neutral-grey-100) animate-pulse" />
                  <div className="h-3 w-1/2 mx-auto rounded bg-(--rs-neutral-grey-100) animate-pulse" />
                  <div className="h-3 w-1/3 mx-auto rounded bg-(--rs-neutral-grey-100) animate-pulse" />
                </div>
              </>
            ) : orgProfile ? (
              <>
                <OrgAvatar person={orgProfile} size={80} />
                <div className="min-w-0 w-full">
                  <p className="font-semibold text-(--rs-neutral-grey-900) leading-snug text-sm">{orgProfile.name}</p>
                  <p className="text-xs text-(--rs-neutral-grey-500) mt-0.5 leading-snug">{orgProfile.title}</p>
                  <div className="mt-2 flex flex-wrap justify-center gap-1.5">
                    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
                      style={{
                        background: orgProfile.departmentColor ? `${orgProfile.departmentColor}22` : 'var(--rs-primary-50)',
                        color: orgProfile.departmentColor ?? 'var(--rs-primary-600)',
                        border: `1px solid ${orgProfile.departmentColor ? `${orgProfile.departmentColor}44` : 'var(--rs-primary-200)'}`,
                      }}>
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: orgProfile.departmentColor ?? 'var(--rs-primary-500)' }} />
                      {orgProfile.department}
                    </span>
                  </div>
                  {orgProfile.reportsToName && (
                    <p className="text-[11px] text-(--rs-neutral-grey-400) mt-1.5">
                      Reports to <span className="font-medium text-(--rs-neutral-grey-600)">{orgProfile.reportsToName}</span>
                    </p>
                  )}
                </div>
              </>
            ) : (
              <p className="text-xs text-(--rs-neutral-grey-400) leading-relaxed">
                No org chart profile matched. Click <span className="font-medium text-(--rs-neutral-grey-600)">Sync</span> after confirming your name.
              </p>
            )}
          </div>

          {/* Sync button footer */}
          <div className="px-4 pb-4 shrink-0">
            <button type="button" onClick={handleOrgSync} disabled={syncing}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-(--rs-neutral-grey-200) px-3 py-2 text-xs font-medium text-(--rs-neutral-grey-600) hover:border-(--rs-primary-400) hover:text-(--rs-primary-600) transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer bg-white">
              <RefreshCw className={`w-3 h-3 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing…' : 'Sync from Org Chart'}
            </button>
            {syncMsg && (
              <p className={`text-[11px] text-center mt-1.5 ${syncMsg.startsWith('Matched') ? 'text-emerald-600' : 'text-(--rs-neutral-grey-400)'}`}>
                {syncMsg}
              </p>
            )}
          </div>
        </div>

        {/* ── Right: Form ── */}
        <form onSubmit={handleSave} className="rounded-xl border border-(--rs-neutral-grey-200) bg-white shadow-sm flex flex-col overflow-hidden">

          {/* Scrollable fields */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

            {/* Identity — read-only, sourced from the Org Chart */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className={labelCls + ' mb-0'}>Identity</span>
                {orgLoading ? (
                  <span className="inline-flex items-center gap-1 text-[11px] text-(--rs-neutral-grey-400)">
                    <Loader2 className="w-3 h-3 animate-spin" /> Checking org chart…
                  </span>
                ) : identity.linked ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600">
                    <CheckCircle2 className="w-3 h-3" /> Synced from Org Chart
                  </span>
                ) : (
                  <span className="text-[11px] text-(--rs-neutral-grey-400)">
                    From your account · not linked to org chart
                  </span>
                )}
              </div>

              <div className="rounded-lg border border-(--rs-neutral-grey-200) bg-(--rs-neutral-grey-50) divide-y divide-(--rs-neutral-grey-100)">
                <InfoRow label="Full Name"  value={identity.name} />
                <InfoRow label="Job Title"  value={identity.title} />
                <InfoRow label="Department" value={identity.department} />
                <InfoRow label="Reports To" value={identity.reportsTo} />
                <InfoRow label="Email"      value={identity.email} />
                <InfoRow label="Username"   value={user?.username ?? null} />
                <InfoRow label="Role"       value={user?.role ?? null} />
              </div>

              {!identity.linked && !orgLoading && (
                <p className="mt-1.5 text-[11px] text-(--rs-neutral-grey-400)">
                  Showing your stored account details. Use <span className="font-medium text-(--rs-neutral-grey-600)">Sync from Org Chart</span> on the left to link your profile.
                </p>
              )}
            </div>

            <div className="border-t border-(--rs-neutral-grey-100)" />

            {/* Password */}
            <div>
              <label htmlFor="password" className={labelCls}>New Password <span className="normal-case font-normal text-(--rs-neutral-grey-400)">(optional)</span></label>
              <input id="password" type="password" value={form.password} placeholder="Leave blank to keep current"
                onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                className={inputBase} />
            </div>

            <div className="border-t border-(--rs-neutral-grey-100)" />

            {/* Clock-out reminders — compact inline row */}
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-(--rs-neutral-grey-800)">Clock-Out Reminders</p>
                <p className="text-xs text-(--rs-neutral-grey-400)">Alert when clocked in too long.</p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <div className="relative">
                    <input type="checkbox" className="sr-only peer" checked={form.reminderEnabled}
                      onChange={e => setForm(p => ({ ...p, reminderEnabled: e.target.checked }))} />
                    <div className="w-9 h-5 rounded-full bg-(--rs-neutral-grey-200) peer-checked:bg-(--rs-primary-500) transition-colors" />
                    <div className="absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
                  </div>
                  <span className="text-xs text-(--rs-neutral-grey-600)">{form.reminderEnabled ? 'On' : 'Off'}</span>
                </label>
                {form.reminderEnabled && (
                  <select value={form.reminderIntervalMinutes}
                    onChange={e => setForm(p => ({ ...p, reminderIntervalMinutes: Number(e.target.value) }))}
                    className="rounded-lg border border-(--rs-neutral-grey-200) px-2.5 py-1.5 text-xs bg-white cursor-pointer outline-none focus:border-(--rs-primary-400)">
                    <option value={30}>Every 30 min</option>
                    <option value={60}>Every 1 hr</option>
                    <option value={120}>Every 2 hrs</option>
                    <option value={180}>Every 3 hrs</option>
                  </select>
                )}
              </div>
            </div>

            {/* Compensation — read-only; only admins can change the rate */}
            <div className="border-t border-(--rs-neutral-grey-100)" />
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-(--rs-neutral-grey-500) uppercase tracking-wide">Hourly Rate</span>
                <span className="text-[11px] text-(--rs-neutral-grey-400)">Set by admin</span>
              </div>
              {user?.hourlyRateUsd != null ? (
                <div className="flex items-end justify-between rounded-lg border border-(--rs-neutral-grey-200) bg-(--rs-neutral-grey-50) px-4 py-3">
                  <div>
                    <p className="text-2xl font-serif font-bold text-(--rs-neutral-grey-900) tabular-nums leading-none">
                      ${user.hourlyRateUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      <span className="text-sm font-sans font-normal text-(--rs-neutral-grey-400)"> / hr</span>
                    </p>
                  </div>
                  <div className="text-right">
                    {fx ? (
                      <>
                        <p className="text-lg font-semibold text-(--rs-primary-600) tabular-nums leading-none">
                          ₱{(user.hourlyRateUsd * fx.rate).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          <span className="text-xs font-normal text-(--rs-neutral-grey-400)"> / hr</span>
                        </p>
                        <p className="text-[10px] text-(--rs-neutral-grey-400) mt-1">
                          @ ₱{fx.rate.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/$1{fx.stale ? ' · cached' : ' · live'}
                        </p>
                      </>
                    ) : (
                      <p className="text-xs text-(--rs-neutral-grey-400)">Loading PHP…</p>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-(--rs-neutral-grey-400) italic">No rate set — ask your admin.</p>
              )}
            </div>

          </div>

          {/* ── Form footer ── */}
          <div className="shrink-0 border-t border-(--rs-neutral-grey-100) bg-(--rs-neutral-grey-50) px-6 py-3 flex items-center justify-between gap-4">
            <div className="min-w-0">
              {error   && <p className="text-xs text-red-600 truncate">{error}</p>}
              {success && <p className="text-xs text-emerald-600">{success}</p>}
            </div>
            <button type="submit" disabled={saving}
              className="shrink-0 inline-flex items-center gap-2 rounded-lg bg-(--rs-primary-500) px-5 py-2 text-sm font-semibold text-white hover:bg-(--rs-primary-600) transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? 'Saving…' : 'Save Settings'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

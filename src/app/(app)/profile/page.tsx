'use client';

import { useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';

type NotificationPrefs = {
  email:        boolean;
  mentions:     boolean;
  dueToday:     boolean;
  approvals:    boolean;
  projectAdded: boolean;
  taskAdded:    boolean;
};

const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  email: true, mentions: true, dueToday: true, approvals: true, projectAdded: true, taskAdded: true,
};

// Per-event toggles shown under the master "Email me notifications" switch.
const NOTIFICATION_EVENTS: Array<{ key: keyof NotificationPrefs; label: string; hint: string }> = [
  { key: 'mentions',     label: 'Mentions',          hint: 'When someone @mentions you in a comment.' },
  { key: 'dueToday',     label: 'Due today',         hint: 'When a task assigned to you is due.' },
  { key: 'approvals',    label: 'Approvals',         hint: 'When a time-correction request is decided.' },
  { key: 'projectAdded', label: 'Added to project',  hint: 'When you are added to a project.' },
  { key: 'taskAdded',    label: 'Added to a task',   hint: 'When you are assigned to a task.' },
];

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
  notificationPrefs?: NotificationPrefs;
};

// Portal-owned reporting line + photo. reportsToName null = the founder (default).
type Reporting = {
  reportsToName: string | null;
  alsoReportsToNames: string[];
  photoUrl: string | null;
  departmentColor: string | null;
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

function Avatar({ name, photoUrl, size = 80 }: { name: string; photoUrl: string | null; size?: number }) {
  const initials = name
    .split(' ').filter(Boolean).slice(0, 2)
    .map(n => n[0]?.toUpperCase() ?? '').join('');

  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoUrl}
        alt={name}
        className="rounded-full object-cover border-2 border-(--rs-neutral-grey-200) shrink-0"
        style={{ width: size, height: size }}
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
  const [error, setError]       = useState('');
  const [success, setSuccess]   = useState('');
  const [user, setUser]         = useState<ProfileUser | null>(null);
  const [reporting, setReporting] = useState<Reporting | null>(null);
  const [fx, setFx] = useState<FxRate | null>(null);
  // Identity is read-only (admin-owned); only password + reminder settings
  // remain editable here.
  const [form, setForm] = useState({
    password: '', reminderEnabled: true, reminderIntervalMinutes: 120,
    notificationPrefs: DEFAULT_NOTIFICATION_PREFS,
  });

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res  = await fetch('/api/profile/me', { cache: 'no-store' });
        const data = await res.json() as { user?: ProfileUser; reporting?: Reporting; error?: string };
        if (!res.ok || !data.user) { setError(data.error || 'Failed to load profile'); return; }
        setUser(data.user);
        setReporting(data.reporting ?? null);
        setForm({
          password: '',
          reminderEnabled: data.user.reminderEnabled ?? true,
          reminderIntervalMinutes: data.user.reminderIntervalMinutes ?? 120,
          notificationPrefs: { ...DEFAULT_NOTIFICATION_PREFS, ...(data.user.notificationPrefs ?? {}) },
        });
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

  const reportsTo = reporting?.reportsToName ?? 'Robbie Galoso';
  const departmentColor = reporting?.departmentColor ?? null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError(''); setSuccess('');
    try {
      // Identity is admin-owned and not sent — only preferences + password.
      const payload = {
        password: form.password,
        reminderEnabled: form.reminderEnabled,
        reminderIntervalMinutes: form.reminderIntervalMinutes,
        notificationPrefs: form.notificationPrefs,
      };
      const res  = await fetch('/api/profile/me', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json() as { user?: ProfileUser; error?: string };
      if (!res.ok || !data.user) { setError(data.error || 'Failed to update profile'); return; }
      setUser(data.user);
      setForm(prev => ({
        ...prev,
        password: '',
        notificationPrefs: { ...DEFAULT_NOTIFICATION_PREFS, ...(data.user!.notificationPrefs ?? {}) },
      }));
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

        {/* ── Left: identity card ── */}
        <div className="rounded-xl border border-(--rs-neutral-grey-200) bg-white shadow-sm flex flex-col items-center justify-center p-5 gap-3 text-center">
          <Avatar name={user?.name ?? ''} photoUrl={reporting?.photoUrl ?? null} size={96} />
          <div className="min-w-0 w-full">
            <p className="font-semibold text-(--rs-neutral-grey-900) leading-snug text-sm">{user?.name}</p>
            {user?.jobTitle && <p className="text-xs text-(--rs-neutral-grey-500) mt-0.5 leading-snug">{user.jobTitle}</p>}
            {user?.team && (
              <div className="mt-2 flex flex-wrap justify-center gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
                  style={{
                    background: departmentColor ? `${departmentColor}22` : 'var(--rs-primary-50)',
                    color: departmentColor ?? 'var(--rs-primary-600)',
                    border: `1px solid ${departmentColor ? `${departmentColor}44` : 'var(--rs-primary-200)'}`,
                  }}>
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: departmentColor ?? 'var(--rs-primary-500)' }} />
                  {user.team}
                </span>
              </div>
            )}
            <p className="text-[11px] text-(--rs-neutral-grey-400) mt-1.5">
              Reports to <span className="font-medium text-(--rs-neutral-grey-600)">{reportsTo}</span>
            </p>
          </div>
        </div>

        {/* ── Right: Form ── */}
        <form onSubmit={handleSave} className="rounded-xl border border-(--rs-neutral-grey-200) bg-white shadow-sm flex flex-col overflow-hidden">

          {/* Scrollable fields */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

            {/* Identity — read-only, admin-owned */}
            <div>
              <span className={labelCls}>Identity</span>

              <div className="rounded-lg border border-(--rs-neutral-grey-200) bg-(--rs-neutral-grey-50) divide-y divide-(--rs-neutral-grey-100)">
                <InfoRow label="Full Name"  value={user?.name ?? null} />
                <InfoRow label="Job Title"  value={user?.jobTitle ?? null} />
                <InfoRow label="Department" value={user?.team ?? null} />
                <InfoRow label="Reports To" value={reportsTo} />
                <InfoRow label="Also Reports To" value={reporting?.alsoReportsToNames.join(', ')} />
                <InfoRow label="Email"      value={user?.email ?? null} />
                <InfoRow label="Username"   value={user?.username ?? null} />
                <InfoRow label="Role"       value={user?.role ?? null} />
              </div>
              <p className="mt-1.5 text-[11px] text-(--rs-neutral-grey-400)">
                These details are managed by HR — contact an admin to change them.
              </p>
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

            {/* Notification emails — master switch + per-event opt-outs */}
            <div className="border-t border-(--rs-neutral-grey-100)" />
            <div>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-(--rs-neutral-grey-800)">Email Notifications</p>
                  <p className="text-xs text-(--rs-neutral-grey-400)">Get an email for bell activity. The in-app bell is unaffected.</p>
                </div>
                <label className="flex items-center gap-2 cursor-pointer select-none shrink-0">
                  <div className="relative">
                    <input type="checkbox" className="sr-only peer" checked={form.notificationPrefs.email}
                      onChange={e => setForm(p => ({ ...p, notificationPrefs: { ...p.notificationPrefs, email: e.target.checked } }))} />
                    <div className="w-9 h-5 rounded-full bg-(--rs-neutral-grey-200) peer-checked:bg-(--rs-primary-500) transition-colors" />
                    <div className="absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
                  </div>
                  <span className="text-xs text-(--rs-neutral-grey-600)">{form.notificationPrefs.email ? 'On' : 'Off'}</span>
                </label>
              </div>

              <div className={`mt-3 rounded-lg border border-(--rs-neutral-grey-200) bg-(--rs-neutral-grey-50) divide-y divide-(--rs-neutral-grey-100) transition-opacity ${form.notificationPrefs.email ? '' : 'opacity-50'}`}>
                {NOTIFICATION_EVENTS.map(ev => (
                  <div key={ev.key} className="flex items-center justify-between gap-4 px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-(--rs-neutral-grey-800)">{ev.label}</p>
                      <p className="text-xs text-(--rs-neutral-grey-500)">{ev.hint}</p>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer select-none shrink-0">
                      <div className="relative">
                        <input type="checkbox" className="sr-only peer"
                          disabled={!form.notificationPrefs.email}
                          checked={form.notificationPrefs[ev.key]}
                          onChange={e => setForm(p => ({ ...p, notificationPrefs: { ...p.notificationPrefs, [ev.key]: e.target.checked } }))} />
                        <div className="w-9 h-5 rounded-full bg-(--rs-neutral-grey-200) peer-checked:bg-(--rs-primary-500) transition-colors peer-disabled:cursor-not-allowed" />
                        <div className="absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
                      </div>
                      <span className="text-xs text-(--rs-neutral-grey-600) w-6">{form.notificationPrefs[ev.key] ? 'On' : 'Off'}</span>
                    </label>
                  </div>
                ))}
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
                      $ {user.hourlyRateUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      <span className="text-sm font-sans font-normal text-(--rs-neutral-grey-400)"> / hr</span>
                    </p>
                  </div>
                  <div className="text-right">
                    {fx ? (
                      <>
                        <p className="text-lg font-semibold text-(--rs-primary-600) tabular-nums leading-none">
                          ₱ {(user.hourlyRateUsd * fx.rate).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          <span className="text-xs font-normal text-(--rs-neutral-grey-400)"> / hr</span>
                        </p>
                        <p className="text-[10px] text-(--rs-neutral-grey-400) mt-1">
                          @ ₱ {fx.rate.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/$1{fx.stale ? ' · cached' : ' · live'}
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

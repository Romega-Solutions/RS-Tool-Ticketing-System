'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { Pencil, X, Loader2, UserPlus, Eye, EyeOff, Users, UserMinus, RotateCcw, FileText, ArrowUp, ArrowDown, ChevronsUpDown, SlidersHorizontal, Mail, MailCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { SendSetupEmailDialog, type SetupEmailTarget } from '@/components/send-setup-email-dialog';
import { createClient } from '@/lib/supabase/client';
import { roleDisplayLabel } from '@/lib/rbac';
import { formatPhtRange, pacificRange } from '@/lib/schedule';
import { changeView } from '@/app/actions/view-actions';

export type UserRow = {
  id: number;
  username: string;
  name: string;
  email: string;
  role: string;
  team: string | null;
  jobTitle: string | null;
  memberCode: string | null;
  hourlyRateUsd: number | null;
  isActive: boolean;
  toolAccess: string[];
  dateOfBirth: string | null;
  startDate: string | null;
  endDate: string | null;
  driveUrl: string | null;
  approvedHoursPerWeek: number;
  schedulePhtStart: string | null;
  schedulePhtEnd: string | null;
  setupEmailSentAt: string | null;
};

// Selectable roles (stored value is the lowercase string; the dropdown shows the
// proper display label via roleDisplayLabel). 'founder' = Admin access.
const ROLE_OPTIONS = ['intern', 'ic', 'lead', 'admin', 'founder'];

// Canonical departments, shown alphabetically in the selection dropdowns.
const DEPARTMENTS = [
  'Executive',
  'Finance',
  'Human Resource',
  'Marketing',
  'Sales',
  'Technical',
];

const ROLE_BADGE: Record<string, string> = {
  admin:   'bg-purple-100 text-purple-700 border-purple-200',
  founder: 'bg-purple-100 text-purple-700 border-purple-200',
  ceo:     'bg-purple-100 text-purple-700 border-purple-200',
  lead:    'bg-blue-100 text-blue-700 border-blue-200',
  tl:      'bg-blue-100 text-blue-700 border-blue-200',
  manager: 'bg-blue-100 text-blue-700 border-blue-200',
  intern:  'bg-amber-100 text-amber-700 border-amber-200',
  ic:      'bg-(--rs-neutral-grey-100) text-(--rs-neutral-grey-600) border-(--rs-neutral-grey-200)',
};

type EditState = {
  role: string; isActive: boolean; team: string; memberCode: string; hourlyRateUsd: string;
  dateOfBirth: string; startDate: string; endDate: string; driveUrl: string;
  approvedHoursPerWeek: string; schedulePhtStart: string; schedulePhtEnd: string;
};

type NewUserForm = {
  email: string;
  password: string;
  name: string;
  username: string;
  role: string;
  team: string;
  jobTitle: string;
  memberCode: string;
  hourlyRateUsd: string;
  dateOfBirth: string;
  startDate: string;
  endDate: string;
  driveUrl: string;
  approvedHoursPerWeek: string;
  schedulePhtStart: string;
  schedulePhtEnd: string;
  sendSetupEmail: boolean;
};

const EMPTY_FORM: NewUserForm = {
  email: '', password: '', name: '', username: '', role: 'ic', team: '', jobTitle: '', memberCode: '', hourlyRateUsd: '',
  dateOfBirth: '', startDate: '', endDate: '', driveUrl: '',
  approvedHoursPerWeek: '15', schedulePhtStart: '', schedulePhtEnd: '',
  sendSetupEmail: false,
};

// ── Column sorting ───────────────────────────────────────────────────────────
type SortKey = 'name' | 'role' | 'team' | 'dateOfBirth' | 'startDate' | 'endDate' | 'memberCode' | 'hourlyRateUsd' | 'isActive' | 'approvedHoursPerWeek';
type SortDir = 'asc' | 'desc';

function compareUsers(a: UserRow, b: UserRow, key: SortKey): number {
  if (key === 'hourlyRateUsd') return (a.hourlyRateUsd ?? -1) - (b.hourlyRateUsd ?? -1);
  if (key === 'approvedHoursPerWeek') return a.approvedHoursPerWeek - b.approvedHoursPerWeek;
  if (key === 'isActive') return (a.isActive ? 1 : 0) - (b.isActive ? 1 : 0);
  const av = (a[key] ?? '') as string;
  const bv = (b[key] ?? '') as string;
  // Empty values sort last in ascending order.
  if (!av && bv) return 1;
  if (av && !bv) return -1;
  return av.localeCompare(bv, undefined, { numeric: true, sensitivity: 'base' });
}

// ── Column show/hide ─────────────────────────────────────────────────────────
// Optional columns the admin can toggle. Name + Actions are always shown. The
// chosen set persists per-browser (matches the existing taskPanelWidth pattern).
type ColKey = 'role' | 'team' | 'approvedHoursPerWeek' | 'schedulePht' | 'schedulePst'
  | 'isActive' | 'dateOfBirth' | 'startDate' | 'endDate' | 'driveUrl' | 'memberCode' | 'hourlyRateUsd';
const COLUMNS: { key: ColKey; label: string }[] = [
  { key: 'role',                 label: 'Role' },
  { key: 'team',                 label: 'Team' },
  { key: 'approvedHoursPerWeek', label: 'Approved Hours' },
  { key: 'schedulePht',          label: 'Schedule PHT' },
  { key: 'schedulePst',          label: 'Schedule PST' },
  { key: 'isActive',             label: 'Active' },
  { key: 'dateOfBirth',          label: 'Birth Date' },
  { key: 'startDate',            label: 'Start Date' },
  { key: 'endDate',              label: 'End Date' },
  { key: 'driveUrl',             label: 'File' },
  { key: 'memberCode',           label: 'Member Code' },
  { key: 'hourlyRateUsd',        label: 'Rate (USD/hr)' },
];
// Default keeps the table compact (the "avoid overcrowding" goal).
const DEFAULT_VISIBLE: ColKey[] = ['role', 'team', 'approvedHoursPerWeek', 'isActive'];
const COLS_KEY = 'usersTableColumns:v1';

function formatUsd(value: number | null): string {
  if (value == null) return '';
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// 'YYYY-MM-DD' → 'Jan 5, 2026' (falls back to the raw value if unparseable).
function fmtDate(value: string | null): string {
  if (!value) return '';
  const d = new Date(value + 'T00:00:00');
  if (isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// ISO timestamp → short 'Jan 5' for the "setup email sent" badge.
function fmtSent(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Derived PST/PDT range label for a PHT window, or '—'.
function pstLabel(start: string | null, end: string | null): { range: string; zone: string } | null {
  return pacificRange(start, end);
}

// Client-side mirror of the PATCH /api/admin/users validation rules so errors
// surface in the editor dialog before submit (dates YYYY-MM-DD, http(s) drive
// URL, rate ≥ 0, approved hours 1–60). Returns an error string, or null if valid.
function validateEditForm(f: EditState): string | null {
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  const dateChecks: [string, string][] = [
    ['Date of birth', f.dateOfBirth],
    ['Start date', f.startDate],
    ['End date', f.endDate],
  ];
  for (const [label, value] of dateChecks) {
    if (value.trim() && !dateRe.test(value.trim())) return `${label} must be YYYY-MM-DD`;
  }
  if (f.driveUrl.trim()) {
    try {
      const u = new URL(f.driveUrl.trim());
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return 'Drive link must be an http(s) URL';
    } catch {
      return 'Drive link must be a valid URL';
    }
  }
  if (f.hourlyRateUsd.trim()) {
    const n = Number(f.hourlyRateUsd.trim());
    if (!Number.isFinite(n)) return 'Hourly rate must be a number';
    if (n < 0) return 'Hourly rate cannot be negative';
  }
  const ah = Number((f.approvedHoursPerWeek || '15').trim());
  if (!Number.isInteger(ah) || ah < 1 || ah > 60) return 'Approved hours must be between 1 and 60';
  return null;
}

export function UserManagementTable({ initialUsers, currentUserId }: { initialUsers: UserRow[]; currentUserId?: number }) {
  const [userList, setUserList] = useState<UserRow[]>(initialUsers);
  const [liveAlert, setLiveAlert] = useState<string | null>(null);
  const alertTimer = useRef<ReturnType<typeof setTimeout>>(null);

  // Soft remove (deactivate) / restore
  const [pendingRemove, setPendingRemove] = useState<UserRow | null>(null);
  const [togglingActive, setTogglingActive] = useState(false);

  // Profile popup (clicking a name)
  const [profileUser, setProfileUser] = useState<UserRow | null>(null);

  // Account-setup email dialog (per-user "Send setup email" / "Resend")
  const [setupEmailUser, setSetupEmailUser] = useState<SetupEmailTarget | null>(null);
  const markSetupSent = (userId: number, sentAt: string) =>
    setUserList(prev => prev.map(u => u.id === userId ? { ...u, setupEmailSentAt: sentAt } : u));

  // Column show/hide. Lazy init from localStorage (client only) — mirrors the
  // taskPanelWidth pattern: no effect → no setState-in-effect, server falls back
  // to the default set.
  const [visibleCols, setVisibleCols] = useState<Set<ColKey>>(() => {
    if (typeof window === 'undefined') return new Set(DEFAULT_VISIBLE);
    try {
      const raw = localStorage.getItem(COLS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as string[];
        const valid = parsed.filter((k): k is ColKey => COLUMNS.some(c => c.key === k));
        return new Set(valid);
      }
    } catch { /* keep defaults */ }
    return new Set(DEFAULT_VISIBLE);
  });
  const [colsMenuOpen, setColsMenuOpen] = useState(false);
  const persistCols = (next: Set<ColKey>) => {
    setVisibleCols(next);
    try { localStorage.setItem(COLS_KEY, JSON.stringify([...next])); } catch { /* ignore */ }
  };
  const toggleCol = (key: ColKey) => {
    const next = new Set(visibleCols);
    if (next.has(key)) next.delete(key); else next.add(key);
    persistCols(next);
  };
  const show = (key: ColKey) => visibleCols.has(key);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel('users-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'users' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newUser = payload.new as UserRow;
            setUserList(prev => {
              if (prev.some(u => u.id === newUser.id)) return prev;
              return [...prev, newUser].sort((a, b) => a.name.localeCompare(b.name));
            });
            setLiveAlert(`${newUser.name || 'Someone'} just joined!`);
            if (alertTimer.current) clearTimeout(alertTimer.current);
            alertTimer.current = setTimeout(() => setLiveAlert(null), 6000);
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as UserRow;
            setUserList(prev => prev.map(u => u.id === updated.id ? { ...u, ...updated } : u));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (alertTimer.current) clearTimeout(alertTimer.current);
    };
  }, []);

  // Edit existing user — the editor lives inside the profile dialog (profileUser).
  const [editForm, setEditForm]     = useState<EditState>({ role: '', isActive: true, team: '', memberCode: '', hourlyRateUsd: '', dateOfBirth: '', startDate: '', endDate: '', driveUrl: '', approvedHoursPerWeek: '15', schedulePhtStart: '', schedulePhtEnd: '' });
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState('');

  // Column sorting (asc/desc, toggled from the header)
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'name', dir: 'asc' });
  const toggleSort = (key: SortKey) =>
    setSort(s => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  const sortedUsers = useMemo(() => {
    const dirMul = sort.dir === 'asc' ? 1 : -1;
    return [...userList].sort((a, b) => {
      // Removed (inactive) users always sink to the very bottom — they keep their
      // grayed-out row but never sort in among the active users.
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      return compareUsers(a, b, sort.key) * dirMul;
    });
  }, [userList, sort]);

  // Create new user
  const [showCreate, setShowCreate]       = useState(false);
  const [newForm, setNewForm]             = useState<NewUserForm>(EMPTY_FORM);
  const [showPassword, setShowPassword]   = useState(false);
  const [creating, setCreating]           = useState(false);
  const [createError, setCreateError]     = useState('');

  // Open the profile dialog as an editor — seeds editForm from the row.
  const openProfile = (user: UserRow) => {
    setProfileUser(user);
    setError('');
    setEditForm({
      role: user.role,
      isActive: user.isActive,
      team: user.team ?? '',
      memberCode: user.memberCode ?? '',
      hourlyRateUsd: user.hourlyRateUsd != null ? String(user.hourlyRateUsd) : '',
      dateOfBirth: user.dateOfBirth ?? '',
      startDate: user.startDate ?? '',
      endDate: user.endDate ?? '',
      driveUrl: user.driveUrl ?? '',
      approvedHoursPerWeek: String(user.approvedHoursPerWeek ?? 15),
      schedulePhtStart: user.schedulePhtStart ?? '',
      schedulePhtEnd: user.schedulePhtEnd ?? '',
    });
  };
  const closeProfile = () => { setProfileUser(null); setError(''); };

  // Save the editable profile dialog → PATCH /api/admin/users (which already
  // accepts every one of these fields). Validates client-side first.
  const saveProfile = async () => {
    if (!profileUser) return;
    const invalid = validateEditForm(editForm);
    if (invalid) { setError(invalid); return; }
    const userId = profileUser.id;
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id:            userId,
          role:          editForm.role,
          isActive:      editForm.isActive ? 1 : 0,
          team:          editForm.team.trim() || null,
          memberCode:    editForm.memberCode.trim() || null,
          hourlyRateUsd: editForm.hourlyRateUsd.trim() === '' ? null : editForm.hourlyRateUsd.trim(),
          dateOfBirth:   editForm.dateOfBirth.trim() || null,
          startDate:     editForm.startDate.trim() || null,
          endDate:       editForm.endDate.trim() || null,
          driveUrl:      editForm.driveUrl.trim() || null,
          approvedHoursPerWeek: Number(editForm.approvedHoursPerWeek) || 15,
          schedulePhtStart: editForm.schedulePhtStart.trim() || null,
          schedulePhtEnd:   editForm.schedulePhtEnd.trim() || null,
        }),
      });
      const data = (await res.json()) as { user?: UserRow; error?: string };
      if (!res.ok) { setError(data.error ?? 'Failed to save'); return; }
      if (data.user) setUserList(prev => prev.map(u => u.id === userId ? data.user! : u));
      setProfileUser(null);
    } catch {
      setError('Request failed');
    } finally {
      setSaving(false);
    }
  };

  // Self-edit is role-only — the API rejects any other field on your own
  // account (see admin/users/route.ts), so this sends just { id, role }.
  const saveOwnRole = async () => {
    if (!profileUser) return;
    const userId = profileUser.id;
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: userId, role: editForm.role }),
      });
      const data = (await res.json()) as { user?: UserRow; error?: string };
      if (!res.ok) { setError(data.error ?? 'Failed to save'); return; }
      if (data.user) setUserList(prev => prev.map(u => u.id === userId ? data.user! : u));
      setProfileUser(null);
    } catch {
      setError('Request failed');
    } finally {
      setSaving(false);
    }
  };

  // Soft remove (deactivate) or restore via the partial PATCH endpoint.
  const setActive = async (user: UserRow, active: boolean) => {
    setTogglingActive(true);
    setError('');
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: user.id, isActive: active ? 1 : 0 }),
      });
      const data = (await res.json()) as { user?: UserRow; error?: string };
      if (!res.ok) { setError(data.error ?? 'Failed to update'); return; }
      if (data.user) setUserList(prev => prev.map(u => u.id === user.id ? data.user! : u));
      setPendingRemove(null);
    } catch {
      setError('Request failed');
    } finally {
      setTogglingActive(false);
    }
  };

  const openCreate = () => {
    setNewForm(EMPTY_FORM);
    setCreateError('');
    setShowCreate(true);
  };
  const closeCreate = () => { setShowCreate(false); setCreateError(''); };

  const submitCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCreateError('');
    try {
      const { sendSetupEmail, ...payload } = newForm;
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { user?: UserRow; error?: string };
      if (!res.ok) { setCreateError(data.error ?? 'Failed to create user'); return; }
      const created = data.user;
      if (created) setUserList(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      closeCreate();
      // "Send setup email now" — best-effort; the account was already created.
      if (sendSetupEmail && created) {
        try {
          const r2 = await fetch(`/api/admin/users/${created.id}/send-setup-email`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
          });
          const d2 = (await r2.json()) as { ok?: boolean; sentAt?: string; error?: string };
          if (r2.ok && d2.ok && d2.sentAt) {
            markSetupSent(created.id, d2.sentAt);
          } else {
            setError(`${created.name} was created, but the setup email could not be sent: ${d2.error ?? 'unknown error'}`);
          }
        } catch {
          setError(`${created.name} was created, but the setup email request failed.`);
        }
      }
    } catch {
      setCreateError('Request failed');
    } finally {
      setCreating(false);
    }
  };

  const handleImpersonate = async(targetUserId:number) =>{
    await changeView(targetUserId)
  }

  // Name + Actions are always shown; colSpan for the empty row counts them too.
  const totalColSpan = visibleCols.size + 2;

  return (
    <div className="space-y-3">
      {liveAlert && (
        <div className="flex items-center gap-2.5 bg-green-50 border border-green-200 text-green-700 px-4 py-2.5 rounded-lg text-sm">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
          </span>
          <Users className="w-4 h-4 shrink-0" />
          {liveAlert}
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
      )}

      <div className="flex justify-end gap-2">
        {/* Columns show/hide menu */}
        <div className="relative">
          <Button variant="outline" onClick={() => setColsMenuOpen(o => !o)} className="gap-2">
            <SlidersHorizontal className="w-4 h-4" />
            Columns
          </Button>
          {colsMenuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setColsMenuOpen(false)} />
              <div className="absolute right-0 z-20 mt-1 w-56 rounded-xl border border-(--rs-neutral-grey-200) bg-white shadow-lg p-1.5">
                <p className="px-2 py-1.5 text-[11px] font-bold uppercase tracking-wider text-(--rs-neutral-grey-400)">Show columns</p>
                {COLUMNS.map(c => (
                  <label key={c.key} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-(--rs-neutral-grey-50) cursor-pointer text-sm text-(--rs-neutral-grey-700)">
                    <input
                      type="checkbox"
                      checked={show(c.key)}
                      onChange={() => toggleCol(c.key)}
                      className="w-4 h-4 rounded accent-(--rs-primary-500)"
                    />
                    {c.label}
                  </label>
                ))}
              </div>
            </>
          )}
        </div>
        <Button onClick={openCreate} className="gap-2">
          <UserPlus className="w-4 h-4" />
          Add User
        </Button>
      </div>

      <div className="rounded-xl border border-(--rs-neutral-grey-200) bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-(--rs-neutral-grey-200) bg-(--rs-neutral-grey-50)">
                <SortableTh label="Name" k="name" sort={sort} onSort={toggleSort} width="w-48" />
                {show('role') && <SortableTh label="Role" k="role" sort={sort} onSort={toggleSort} width="w-28" />}
                {show('team') && <SortableTh label="Team" k="team" sort={sort} onSort={toggleSort} width="w-40" />}
                {show('approvedHoursPerWeek') && <SortableTh label="Approved Hours" k="approvedHoursPerWeek" sort={sort} onSort={toggleSort} width="w-32" align="center" />}
                {show('schedulePht') && <th className="text-left px-4 py-3 font-semibold text-(--rs-neutral-grey-600) w-36">Schedule PHT</th>}
                {show('schedulePst') && <th className="text-left px-4 py-3 font-semibold text-(--rs-neutral-grey-600) w-40">Schedule PST</th>}
                {show('isActive') && <SortableTh label="Active" k="isActive" sort={sort} onSort={toggleSort} width="w-20" align="center" />}
                {show('dateOfBirth') && <SortableTh label="Birth Date" k="dateOfBirth" sort={sort} onSort={toggleSort} width="w-32" />}
                {show('startDate') && <SortableTh label="Start Date" k="startDate" sort={sort} onSort={toggleSort} width="w-32" />}
                {show('endDate') && <SortableTh label="End Date" k="endDate" sort={sort} onSort={toggleSort} width="w-32" />}
                {show('driveUrl') && <th className="text-center px-4 py-3 font-semibold text-(--rs-neutral-grey-600) w-16">File</th>}
                {show('memberCode') && <SortableTh label="Member Code" k="memberCode" sort={sort} onSort={toggleSort} width="w-32" />}
                {show('hourlyRateUsd') && <SortableTh label="Rate (USD/hr)" k="hourlyRateUsd" sort={sort} onSort={toggleSort} width="w-32" align="right" />}
                <th className="text-right px-4 py-3 font-semibold text-(--rs-neutral-grey-600) w-28">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-(--rs-neutral-grey-100)">
              {sortedUsers.map(user => {
                const badge = ROLE_BADGE[user.role.toLowerCase()] ?? ROLE_BADGE.ic;
                const pst = pstLabel(user.schedulePhtStart, user.schedulePhtEnd);
                return (
                  <tr key={user.id} className={`hover:bg-(--rs-neutral-grey-50) transition-colors ${!user.isActive ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => openProfile(user)}
                        className="text-left font-medium text-(--rs-neutral-grey-900) hover:underline cursor-pointer"
                        title="View / edit profile"
                      >
                        {user.name}
                      </button>
                      <div className="text-xs text-(--rs-neutral-grey-400)">{user.username} · {user.email}</div>
                      {user.setupEmailSentAt && (
                        <div className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-(--rs-neutral-grey-400)">
                          <MailCheck className="w-3 h-3 text-(--rs-primary-500)" /> Setup email sent · {fmtSent(user.setupEmailSentAt)}
                        </div>
                      )}
                    </td>

                    {show('role') && (
                      <td className="px-4 py-3">
                        <span className={`inline-block text-xs px-2 py-0.5 rounded border font-medium ${badge}`}>
                          {roleDisplayLabel(user.role)}
                        </span>
                      </td>
                    )}

                    {show('team') && (
                      <td className="px-4 py-3">
                        {user.team ? (
                          <span className="text-xs text-(--rs-neutral-grey-700)">{user.team}</span>
                        ) : (
                          <span className="text-xs text-(--rs-neutral-grey-300) italic">No team</span>
                        )}
                      </td>
                    )}

                    {/* Approved Hours */}
                    {show('approvedHoursPerWeek') && (
                      <td className="px-4 py-3 text-center">
                        <span className="text-sm text-(--rs-neutral-grey-700) tabular-nums">{user.approvedHoursPerWeek} hrs</span>
                      </td>
                    )}

                    {/* Schedule PHT */}
                    {show('schedulePht') && (
                      <td className="px-4 py-3">
                        {user.schedulePhtStart && user.schedulePhtEnd ? (
                          <span className="text-xs text-(--rs-neutral-grey-700) tabular-nums whitespace-nowrap">{formatPhtRange(user.schedulePhtStart, user.schedulePhtEnd)}</span>
                        ) : (
                          <span className="text-xs text-(--rs-neutral-grey-300) italic">—</span>
                        )}
                      </td>
                    )}

                    {/* Schedule PST (derived, read-only) */}
                    {show('schedulePst') && (
                      <td className="px-4 py-3">
                        {pst ? (
                          <span className="text-xs text-(--rs-neutral-grey-600) tabular-nums whitespace-nowrap">
                            {pst.range}
                            <span className="ml-1 text-[10px] font-semibold text-(--rs-neutral-grey-400)">{pst.zone}</span>
                          </span>
                        ) : (
                          <span className="text-xs text-(--rs-neutral-grey-300) italic">—</span>
                        )}
                      </td>
                    )}

                    {show('isActive') && (
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-block w-2.5 h-2.5 rounded-full ${user.isActive ? 'bg-green-500' : 'bg-(--rs-neutral-grey-300)'}`}
                          title={user.isActive ? 'Active' : 'Inactive'}
                        />
                      </td>
                    )}

                    {/* Birth Date */}
                    {show('dateOfBirth') && (
                      <td className="px-4 py-3">
                        {user.dateOfBirth ? (
                          <span className="text-xs text-(--rs-neutral-grey-700) whitespace-nowrap">{fmtDate(user.dateOfBirth)}</span>
                        ) : (
                          <span className="text-xs text-(--rs-neutral-grey-300) italic">—</span>
                        )}
                      </td>
                    )}

                    {/* Start Date */}
                    {show('startDate') && (
                      <td className="px-4 py-3">
                        {user.startDate ? (
                          <span className="text-xs text-(--rs-neutral-grey-700) whitespace-nowrap">{fmtDate(user.startDate)}</span>
                        ) : (
                          <span className="text-xs text-(--rs-neutral-grey-300) italic">—</span>
                        )}
                      </td>
                    )}

                    {/* End Date */}
                    {show('endDate') && (
                      <td className="px-4 py-3">
                        {user.endDate ? (
                          <span className="text-xs text-(--rs-neutral-grey-700) whitespace-nowrap">{fmtDate(user.endDate)}</span>
                        ) : (
                          <span className="text-xs text-(--rs-neutral-grey-300) italic">—</span>
                        )}
                      </td>
                    )}

                    {/* Drive file */}
                    {show('driveUrl') && (
                      <td className="px-4 py-3 text-center">
                        {user.driveUrl ? (
                          <a href={user.driveUrl} target="_blank" rel="noopener noreferrer"
                            title="Open Google Drive file"
                            className="inline-flex text-(--rs-primary-600) hover:text-(--rs-primary-700)">
                            <FileText className="w-4 h-4" />
                          </a>
                        ) : (
                          <FileText className="w-4 h-4 mx-auto text-(--rs-neutral-grey-200)" />
                        )}
                      </td>
                    )}

                    {show('memberCode') && (
                      <td className="px-4 py-3">
                        {user.memberCode ? (
                          <code className="text-[11px] font-mono text-(--rs-neutral-grey-600)">{user.memberCode}</code>
                        ) : (
                          <span className="text-xs text-(--rs-neutral-grey-300) italic">Not set</span>
                        )}
                      </td>
                    )}

                    {show('hourlyRateUsd') && (
                      <td className="px-4 py-3 text-right">
                        {user.hourlyRateUsd != null ? (
                          <span className="text-sm font-medium text-(--rs-neutral-grey-800) tabular-nums">$ {formatUsd(user.hourlyRateUsd)}</span>
                        ) : (
                          <span className="text-xs text-(--rs-neutral-grey-300) italic">Not set</span>
                        )}
                      </td>
                    )}

                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {currentUserId !== user.id &&(
                        <Button size="sm" variant="ghost"
                          className="h-7 px-2.5 text-(--rs-neutral-grey-500) hover:text-(--rs-neutral-grey-900)"
                          onClick={() => handleImpersonate(user.id)}>
                          <Eye className="w-3.5 h-3.5 mr-1" />
                          View
                        </Button>
                        )}
                        <Button size="sm" variant="ghost"
                          className="h-7 px-2.5 text-(--rs-neutral-grey-500) hover:text-(--rs-neutral-grey-900)"
                          onClick={() => openProfile(user)}>
                          <Pencil className="w-3.5 h-3.5 mr-1" />Edit
                        </Button>
                        {user.isActive && (
                          <Button size="icon" variant="ghost"
                            className="w-7 h-7 text-(--rs-neutral-grey-400) hover:text-(--rs-primary-700) hover:bg-(--rs-primary-50)"
                            onClick={() => setSetupEmailUser({ id: user.id, name: user.name, email: user.email, role: user.role, team: user.team })}
                            title={user.setupEmailSentAt ? 'Resend account-setup email' : 'Send account-setup email'}>
                            {user.setupEmailSentAt ? <MailCheck className="w-3.5 h-3.5" /> : <Mail className="w-3.5 h-3.5" />}
                          </Button>
                        )}
                        {currentUserId !== user.id && (
                          user.isActive ? (
                            <Button size="sm" variant="ghost"
                              className="h-7 px-2.5 text-red-500 hover:text-red-700 hover:bg-red-50"
                              onClick={() => setPendingRemove(user)} title="Remove (deactivate)">
                              <UserMinus className="w-3.5 h-3.5 mr-1" />Remove
                            </Button>
                          ) : (
                            <Button size="sm" variant="ghost"
                              className="h-7 px-2.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                              onClick={() => setActive(user, true)} disabled={togglingActive} title="Restore (reactivate)">
                              <RotateCcw className="w-3.5 h-3.5 mr-1" />Restore
                            </Button>
                          )
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {userList.length === 0 && (
                <tr>
                  <td colSpan={totalColSpan} className="px-4 py-10 text-center text-(--rs-neutral-grey-400) italic text-sm">
                    No users found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Create User Modal ───────────────────────────────────────────── */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl border border-(--rs-neutral-grey-200) max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-(--rs-neutral-grey-100) px-6 py-4 sticky top-0 bg-white">
              <h2 className="font-serif text-lg font-bold text-(--rs-neutral-grey-900)">Add New User</h2>
              <button onClick={closeCreate} className="text-(--rs-neutral-grey-400) hover:text-(--rs-neutral-grey-700) rounded p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={submitCreate} className="px-6 py-5 space-y-4">
              {createError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2.5 rounded-lg text-sm">{createError}</div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Full Name" required>
                  <input autoFocus required value={newForm.name} onChange={e => setNewForm(f => ({ ...f, name: e.target.value }))}
                    className={inputCls} placeholder="e.g. Jane Dela Cruz" />
                </Field>
                <Field label="Username" required>
                  <input required value={newForm.username} onChange={e => setNewForm(f => ({ ...f, username: e.target.value }))}
                    className={inputCls} placeholder="e.g. jane_dc" />
                </Field>
              </div>

              <Field label="Email" required>
                <input required type="email" value={newForm.email} onChange={e => setNewForm(f => ({ ...f, email: e.target.value }))}
                  className={inputCls} placeholder="jane@romega-solutions.com" />
              </Field>

              <Field label="Temporary Password" required>
                <div className="relative">
                  <input required type={showPassword ? 'text' : 'password'} minLength={8}
                    value={newForm.password} onChange={e => setNewForm(f => ({ ...f, password: e.target.value }))}
                    className={`${inputCls} pr-10`} placeholder="Min 8 characters" />
                  <button type="button" tabIndex={-1} onClick={() => setShowPassword(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-(--rs-neutral-grey-400)">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </Field>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Role">
                  <select value={newForm.role} onChange={e => setNewForm(f => ({ ...f, role: e.target.value }))}
                    className={inputCls}>
                    {ROLE_OPTIONS.map(r => <option key={r} value={r}>{roleDisplayLabel(r)}</option>)}
                  </select>
                </Field>
                <Field label="Department">
                  <select value={newForm.team} onChange={e => setNewForm(f => ({ ...f, team: e.target.value }))}
                    className={inputCls}>
                    <option value="">— Select —</option>
                    {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </Field>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Job Title">
                  <input value={newForm.jobTitle} onChange={e => setNewForm(f => ({ ...f, jobTitle: e.target.value }))}
                    className={inputCls} placeholder="e.g. Software Engineer" />
                </Field>
                <Field label="Member Code">
                  <input value={newForm.memberCode} onChange={e => setNewForm(f => ({ ...f, memberCode: e.target.value }))}
                    className={inputCls} placeholder="e.g. ACNG-1" />
                </Field>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Approved Hours / week">
                  <input type="number" min={1} max={60} inputMode="numeric"
                    value={newForm.approvedHoursPerWeek} onChange={e => setNewForm(f => ({ ...f, approvedHoursPerWeek: e.target.value }))}
                    className={`${inputCls} tabular-nums`} placeholder="15" />
                </Field>
                <Field label="Hourly Rate (USD)">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-(--rs-neutral-grey-400)">$</span>
                    <input type="number" min="0" step="0.01" inputMode="decimal"
                      value={newForm.hourlyRateUsd} onChange={e => setNewForm(f => ({ ...f, hourlyRateUsd: e.target.value }))}
                      className={`${inputCls} pl-7 tabular-nums`} placeholder="0.00" />
                  </div>
                </Field>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Schedule start (PHT)">
                  <input type="time" value={newForm.schedulePhtStart}
                    onChange={e => setNewForm(f => ({ ...f, schedulePhtStart: e.target.value }))} className={inputCls} />
                </Field>
                <Field label="Schedule end (PHT)">
                  <input type="time" value={newForm.schedulePhtEnd}
                    onChange={e => setNewForm(f => ({ ...f, schedulePhtEnd: e.target.value }))} className={inputCls} />
                </Field>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Field label="Date of Birth">
                  <input type="date" value={newForm.dateOfBirth}
                    onChange={e => setNewForm(f => ({ ...f, dateOfBirth: e.target.value }))} className={inputCls} />
                </Field>
                <Field label="Start Date">
                  <input type="date" value={newForm.startDate}
                    onChange={e => setNewForm(f => ({ ...f, startDate: e.target.value }))} className={inputCls} />
                </Field>
                <Field label="End Date">
                  <input type="date" value={newForm.endDate}
                    onChange={e => setNewForm(f => ({ ...f, endDate: e.target.value }))} className={inputCls} />
                </Field>
              </div>

              <Field label="Google Drive File (link)">
                <input type="url" value={newForm.driveUrl}
                  onChange={e => setNewForm(f => ({ ...f, driveUrl: e.target.value }))}
                  className={inputCls} placeholder="https://drive.google.com/…" />
              </Field>

              <label className="flex items-center gap-2.5 text-sm text-(--rs-neutral-grey-700) cursor-pointer pt-1">
                <input type="checkbox" checked={newForm.sendSetupEmail}
                  onChange={e => setNewForm(f => ({ ...f, sendSetupEmail: e.target.checked }))}
                  className="w-4 h-4 rounded accent-(--rs-primary-500)" />
                Send the account-setup email now
              </label>

              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="ghost" onClick={closeCreate} disabled={creating}>Cancel</Button>
                <Button type="submit" disabled={creating} className="gap-2">
                  {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                  {creating ? 'Creating…' : 'Create User'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Profile editor (clicking a name / Edit) ─────────────────────── */}
      <Dialog open={profileUser !== null} onOpenChange={(o) => { if (!o) closeProfile(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {profileUser && (() => {
            // Self-edits are role-only — the API rejects every other field on
            // your own account (see admin/users/route.ts).
            const isSelf = currentUserId === profileUser.id;
            const pst = pstLabel(
              isSelf ? profileUser.schedulePhtStart : (editForm.schedulePhtStart || null),
              isSelf ? profileUser.schedulePhtEnd : (editForm.schedulePhtEnd || null),
            );
            return (
              <>
                <DialogHeader>
                  <DialogTitle>{profileUser.name}</DialogTitle>
                  {/* Identity — sourced from the org chart, not editable here. */}
                  <p className="text-sm text-(--rs-neutral-grey-500)">{profileUser.username} · {profileUser.email}</p>
                  {profileUser.jobTitle && (
                    <p className="text-xs text-(--rs-neutral-grey-400)">{profileUser.jobTitle}</p>
                  )}
                </DialogHeader>

                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2.5 rounded-lg text-sm">{error}</div>
                )}

                {isSelf ? (
                  <>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-(--rs-neutral-grey-400) mb-1">Role</p>
                        <select value={editForm.role} onChange={e => setEditForm(f => ({ ...f, role: e.target.value }))}
                          aria-label="Your role" className={inputCls}>
                          {ROLE_OPTIONS.map(r => <option key={r} value={r}>{roleDisplayLabel(r)}</option>)}
                        </select>
                      </div>
                      <ProfileField label="Team" value={profileUser.team ?? '—'} />
                      <ProfileField label="Member Code" value={profileUser.memberCode ?? '—'} />
                      <ProfileField label="Approved Hours" value={`${profileUser.approvedHoursPerWeek} hrs`} />
                      <ProfileField label="Status" value={profileUser.isActive ? 'Active' : 'Inactive'} />
                      <ProfileField label="Schedule (PHT)" value={(profileUser.schedulePhtStart && profileUser.schedulePhtEnd) ? formatPhtRange(profileUser.schedulePhtStart, profileUser.schedulePhtEnd) : '—'} />
                      <ProfileField label="Schedule (PST)" value={pst ? `${pst.range} ${pst.zone}` : '—'} />
                      <ProfileField label="Birth Date" value={profileUser.dateOfBirth ? fmtDate(profileUser.dateOfBirth) : '—'} />
                      <ProfileField label="Start Date" value={profileUser.startDate ? fmtDate(profileUser.startDate) : '—'} />
                      <ProfileField label="End Date" value={profileUser.endDate ? fmtDate(profileUser.endDate) : '—'} />
                      <ProfileField label="Rate (USD/hr)" value={profileUser.hourlyRateUsd != null ? `$ ${formatUsd(profileUser.hourlyRateUsd)}` : '—'} />
                    </div>
                    <p className="text-xs text-(--rs-neutral-grey-500)">Only your role is editable here — use the profile page for everything else.</p>
                    <DialogFooter>
                      <Button variant="ghost" onClick={closeProfile} disabled={saving}>Cancel</Button>
                      <Button onClick={saveOwnRole} disabled={saving || editForm.role === profileUser.role} className="gap-2">
                        {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                        {saving ? 'Saving…' : 'Save'}
                      </Button>
                    </DialogFooter>
                  </>
                ) : (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4">
                      <Field label="Role">
                        <select value={editForm.role} onChange={e => setEditForm(f => ({ ...f, role: e.target.value }))} className={inputCls}>
                          {ROLE_OPTIONS.map(r => <option key={r} value={r}>{roleDisplayLabel(r)}</option>)}
                        </select>
                      </Field>
                      <Field label="Team">
                        <select value={editForm.team} onChange={e => setEditForm(f => ({ ...f, team: e.target.value }))} aria-label="Team" className={inputCls}>
                          <option value="">— No team —</option>
                          {Array.from(new Set([editForm.team, ...DEPARTMENTS].filter(Boolean))).map(d => (
                            <option key={d} value={d}>{d}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Member Code">
                        <input value={editForm.memberCode} onChange={e => setEditForm(f => ({ ...f, memberCode: e.target.value }))}
                          placeholder="e.g. ACNG-1" className={`${inputCls} font-mono`} />
                      </Field>
                      <Field label="Approved Hours / week">
                        <input type="number" min={1} max={60} inputMode="numeric" value={editForm.approvedHoursPerWeek}
                          onChange={e => setEditForm(f => ({ ...f, approvedHoursPerWeek: e.target.value }))}
                          className={`${inputCls} tabular-nums`} placeholder="15" />
                      </Field>
                      <Field label="Hourly Rate (USD)">
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-(--rs-neutral-grey-400)">$</span>
                          <input type="number" min="0" step="0.01" inputMode="decimal" value={editForm.hourlyRateUsd}
                            onChange={e => setEditForm(f => ({ ...f, hourlyRateUsd: e.target.value }))}
                            className={`${inputCls} pl-7 tabular-nums`} placeholder="0.00" />
                        </div>
                      </Field>
                      <Field label="Status">
                        <label className="flex items-center gap-2.5 text-sm text-(--rs-neutral-grey-700) cursor-pointer h-[42px]">
                          <input type="checkbox" checked={editForm.isActive}
                            onChange={e => setEditForm(f => ({ ...f, isActive: e.target.checked }))}
                            className="w-4 h-4 rounded accent-(--rs-primary-500)" />
                          {editForm.isActive ? 'Active' : 'Inactive'}
                        </label>
                      </Field>
                      <Field label="Schedule start (PHT)">
                        <input type="time" aria-label="Schedule start (PHT)" value={editForm.schedulePhtStart}
                          onChange={e => setEditForm(f => ({ ...f, schedulePhtStart: e.target.value }))} className={inputCls} />
                      </Field>
                      <Field label="Schedule end (PHT)">
                        <input type="time" aria-label="Schedule end (PHT)" value={editForm.schedulePhtEnd}
                          onChange={e => setEditForm(f => ({ ...f, schedulePhtEnd: e.target.value }))} className={inputCls} />
                      </Field>
                      {pst && (
                        <p className="sm:col-span-2 -mt-2 text-xs text-(--rs-neutral-grey-500)">
                          Pacific time: <span className="font-medium tabular-nums">{pst.range} {pst.zone}</span>
                        </p>
                      )}
                      <Field label="Date of Birth">
                        <input type="date" aria-label="Birth date" value={editForm.dateOfBirth}
                          onChange={e => setEditForm(f => ({ ...f, dateOfBirth: e.target.value }))} className={inputCls} />
                      </Field>
                      <Field label="Start Date">
                        <input type="date" aria-label="Start date" value={editForm.startDate}
                          onChange={e => setEditForm(f => ({ ...f, startDate: e.target.value }))} className={inputCls} />
                      </Field>
                      <Field label="End Date">
                        <input type="date" aria-label="End date" value={editForm.endDate}
                          onChange={e => setEditForm(f => ({ ...f, endDate: e.target.value }))} className={inputCls} />
                      </Field>
                      <div className="sm:col-span-2">
                        <Field label="Google Drive File (link)">
                          <input type="url" aria-label="Google Drive link" value={editForm.driveUrl}
                            onChange={e => setEditForm(f => ({ ...f, driveUrl: e.target.value }))}
                            placeholder="https://drive.google.com/…" className={inputCls} />
                        </Field>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="ghost" onClick={closeProfile} disabled={saving}>Cancel</Button>
                      <Button onClick={saveProfile} disabled={saving} className="gap-2">
                        {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                        {saving ? 'Saving…' : 'Save'}
                      </Button>
                    </DialogFooter>
                  </>
                )}
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      <SendSetupEmailDialog
        user={setupEmailUser}
        open={setupEmailUser !== null}
        onOpenChange={(o) => { if (!o) setSetupEmailUser(null); }}
        onSent={markSetupSent}
      />

      <ConfirmDialog
        open={pendingRemove !== null}
        onOpenChange={(o) => { if (!o) setPendingRemove(null); }}
        destructive
        loading={togglingActive}
        title="Remove this user?"
        description={
          pendingRemove
            ? `${pendingRemove.name} will be deactivated — they won't be able to sign in, and they'll be removed from every project they're a member of or assigned work in. Their other data is preserved, and you can restore them anytime.`
            : ''
        }
        confirmLabel="Remove user"
        onConfirm={() => { if (pendingRemove) void setActive(pendingRemove, false); }}
      />
    </div>
  );
}

const inputCls = 'w-full rounded-lg border border-(--rs-neutral-grey-300) bg-white px-3 py-2 text-sm outline-none focus:border-(--rs-primary-400) focus:ring-2 focus:ring-(--rs-primary-100)';

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-(--rs-neutral-grey-700)">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

// One label/value pair in the profile popup.
function ProfileField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-(--rs-neutral-grey-400)">{label}</p>
      <p className="text-sm text-(--rs-neutral-grey-800)">{value}</p>
    </div>
  );
}

// Clickable column header — toggles ascending ↔ descending sort on its key.
function SortableTh({ label, k, sort, onSort, width, align = 'left' }: {
  label: string;
  k: SortKey;
  sort: { key: SortKey; dir: SortDir };
  onSort: (key: SortKey) => void;
  width?: string;
  align?: 'left' | 'right' | 'center';
}) {
  const active = sort.key === k;
  const Icon = !active ? ChevronsUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown;
  const alignTh = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';
  return (
    <th className={`${alignTh} px-4 py-3 ${width ?? ''}`}>
      <button
        type="button"
        onClick={() => onSort(k)}
        className="inline-flex items-center gap-1 font-semibold text-(--rs-neutral-grey-600) hover:text-(--rs-neutral-grey-900) transition-colors"
        title={`Sort by ${label} (${active && sort.dir === 'asc' ? 'descending' : 'ascending'})`}
        aria-label={`Sort by ${label}`}
      >
        <span>{label}</span>
        <Icon className={`w-3.5 h-3.5 ${active ? 'text-(--rs-primary-500)' : 'text-(--rs-neutral-grey-300)'}`} />
      </button>
    </th>
  );
}

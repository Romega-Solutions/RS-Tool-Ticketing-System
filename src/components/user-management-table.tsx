'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { Pencil, Check, X, Loader2, UserPlus, Eye, EyeOff, Users, UserMinus, RotateCcw, FileText, ArrowUp, ArrowDown, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { createClient } from '@/lib/supabase/client';

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
};

const ROLE_OPTIONS = ['intern', 'ic', 'lead', 'admin'];

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
};

const EMPTY_FORM: NewUserForm = {
  email: '', password: '', name: '', username: '', role: 'ic', team: '', jobTitle: '', memberCode: '', hourlyRateUsd: '',
  dateOfBirth: '', startDate: '', endDate: '', driveUrl: '',
};

// ── Column sorting ───────────────────────────────────────────────────────────
type SortKey = 'name' | 'role' | 'team' | 'dateOfBirth' | 'startDate' | 'endDate' | 'memberCode' | 'hourlyRateUsd' | 'isActive';
type SortDir = 'asc' | 'desc';

function compareUsers(a: UserRow, b: UserRow, key: SortKey): number {
  if (key === 'hourlyRateUsd') return (a.hourlyRateUsd ?? -1) - (b.hourlyRateUsd ?? -1);
  if (key === 'isActive') return (a.isActive ? 1 : 0) - (b.isActive ? 1 : 0);
  const av = (a[key] ?? '') as string;
  const bv = (b[key] ?? '') as string;
  // Empty values sort last in ascending order.
  if (!av && bv) return 1;
  if (av && !bv) return -1;
  return av.localeCompare(bv, undefined, { numeric: true, sensitivity: 'base' });
}

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

const dateInputCls = 'text-xs border border-(--rs-neutral-grey-300) rounded px-2 py-1 bg-white w-full';

export function UserManagementTable({ initialUsers, currentUserId }: { initialUsers: UserRow[]; currentUserId?: number }) {
  const [userList, setUserList] = useState<UserRow[]>(initialUsers);
  const [liveAlert, setLiveAlert] = useState<string | null>(null);
  const alertTimer = useRef<ReturnType<typeof setTimeout>>(null);

  // Soft remove (deactivate) / restore
  const [pendingRemove, setPendingRemove] = useState<UserRow | null>(null);
  const [togglingActive, setTogglingActive] = useState(false);

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

  // Edit existing user
  const [editingId, setEditingId]   = useState<number | null>(null);
  const [editForm, setEditForm]     = useState<EditState>({ role: '', isActive: true, team: '', memberCode: '', hourlyRateUsd: '', dateOfBirth: '', startDate: '', endDate: '', driveUrl: '' });
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

  const startEdit = (user: UserRow) => {
    setEditingId(user.id);
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
    });
    setError('');
  };
  const cancelEdit = () => { setEditingId(null); setError(''); };

  const saveEdit = async (userId: number) => {
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
        }),
      });
      const data = (await res.json()) as { user?: UserRow; error?: string };
      if (!res.ok) { setError(data.error ?? 'Failed to save'); return; }
      if (data.user) setUserList(prev => prev.map(u => u.id === userId ? data.user! : u));
      setEditingId(null);
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
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newForm),
      });
      const data = (await res.json()) as { user?: UserRow; error?: string };
      if (!res.ok) { setCreateError(data.error ?? 'Failed to create user'); return; }
      if (data.user) setUserList(prev => [...prev, data.user!].sort((a, b) => a.name.localeCompare(b.name)));
      closeCreate();
    } catch {
      setCreateError('Request failed');
    } finally {
      setCreating(false);
    }
  };

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

      <div className="flex justify-end">
        <Button onClick={openCreate} className="gap-2">
          <UserPlus className="w-4 h-4" />
          Add User
        </Button>
      </div>

      <div className="rounded-xl border border-(--rs-neutral-grey-200) bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[1180px]">
            <thead>
              <tr className="border-b border-(--rs-neutral-grey-200) bg-(--rs-neutral-grey-50)">
                <SortableTh label="Name"        k="name"          sort={sort} onSort={toggleSort} width="w-48" />
                <SortableTh label="Role"        k="role"          sort={sort} onSort={toggleSort} width="w-28" />
                <SortableTh label="Team"        k="team"          sort={sort} onSort={toggleSort} width="w-40" />
                <SortableTh label="Birth Date"  k="dateOfBirth"   sort={sort} onSort={toggleSort} width="w-32" />
                <SortableTh label="Start Date"  k="startDate"     sort={sort} onSort={toggleSort} width="w-32" />
                <SortableTh label="End Date"    k="endDate"       sort={sort} onSort={toggleSort} width="w-32" />
                <th className="text-center px-4 py-3 font-semibold text-(--rs-neutral-grey-600) w-16">File</th>
                <SortableTh label="Member Code" k="memberCode"    sort={sort} onSort={toggleSort} width="w-32" />
                <SortableTh label="Rate (USD/hr)" k="hourlyRateUsd" sort={sort} onSort={toggleSort} width="w-32" align="right" />
                <SortableTh label="Active"      k="isActive"      sort={sort} onSort={toggleSort} width="w-20" align="center" />
                <th className="text-right px-4 py-3 font-semibold text-(--rs-neutral-grey-600) w-28">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-(--rs-neutral-grey-100)">
              {sortedUsers.map(user => {
                const isEditing = editingId === user.id;
                const badge = ROLE_BADGE[user.role.toLowerCase()] ?? ROLE_BADGE.ic;
                return (
                  <tr key={user.id} className={`hover:bg-(--rs-neutral-grey-50) transition-colors ${!user.isActive ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-(--rs-neutral-grey-900)">{user.name}</div>
                      <div className="text-xs text-(--rs-neutral-grey-400)">{user.username} · {user.email}</div>
                    </td>

                    <td className="px-4 py-3">
                      {isEditing ? (
                        <select
                          value={editForm.role}
                          onChange={e => setEditForm(f => ({ ...f, role: e.target.value }))}
                          className="text-xs border border-(--rs-neutral-grey-300) rounded px-2 py-1 bg-white w-full"
                        >
                          {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                      ) : (
                        <span className={`inline-block text-xs px-2 py-0.5 rounded border font-medium ${badge}`}>
                          {user.role}
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      {isEditing ? (
                        <select
                          value={editForm.team}
                          onChange={e => setEditForm(f => ({ ...f, team: e.target.value }))}
                          aria-label="Team"
                          className="text-xs border border-(--rs-neutral-grey-300) rounded px-2 py-1 bg-white w-full"
                        >
                          <option value="">— No team —</option>
                          {/* Include the current value even if it's no longer canonical so the
                              admin can see and re-select it instead of losing context. */}
                          {Array.from(new Set([editForm.team, ...DEPARTMENTS].filter(Boolean))).map(d => (
                            <option key={d} value={d}>{d}</option>
                          ))}
                        </select>
                      ) : user.team ? (
                        <span className="text-xs text-(--rs-neutral-grey-700)">{user.team}</span>
                      ) : (
                        <span className="text-xs text-(--rs-neutral-grey-300) italic">No team</span>
                      )}
                    </td>

                    {/* Birth Date */}
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <input type="date" aria-label="Birth date" value={editForm.dateOfBirth}
                          onChange={e => setEditForm(f => ({ ...f, dateOfBirth: e.target.value }))} className={dateInputCls} />
                      ) : user.dateOfBirth ? (
                        <span className="text-xs text-(--rs-neutral-grey-700) whitespace-nowrap">{fmtDate(user.dateOfBirth)}</span>
                      ) : (
                        <span className="text-xs text-(--rs-neutral-grey-300) italic">—</span>
                      )}
                    </td>

                    {/* Start Date */}
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <input type="date" aria-label="Start date" value={editForm.startDate}
                          onChange={e => setEditForm(f => ({ ...f, startDate: e.target.value }))} className={dateInputCls} />
                      ) : user.startDate ? (
                        <span className="text-xs text-(--rs-neutral-grey-700) whitespace-nowrap">{fmtDate(user.startDate)}</span>
                      ) : (
                        <span className="text-xs text-(--rs-neutral-grey-300) italic">—</span>
                      )}
                    </td>

                    {/* End Date */}
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <input type="date" aria-label="End date" value={editForm.endDate}
                          onChange={e => setEditForm(f => ({ ...f, endDate: e.target.value }))} className={dateInputCls} />
                      ) : user.endDate ? (
                        <span className="text-xs text-(--rs-neutral-grey-700) whitespace-nowrap">{fmtDate(user.endDate)}</span>
                      ) : (
                        <span className="text-xs text-(--rs-neutral-grey-300) italic">—</span>
                      )}
                    </td>

                    {/* Drive file */}
                    <td className="px-4 py-3 text-center">
                      {isEditing ? (
                        <input type="url" aria-label="Google Drive link" value={editForm.driveUrl}
                          onChange={e => setEditForm(f => ({ ...f, driveUrl: e.target.value }))}
                          placeholder="https://drive.google.com/…"
                          className="text-xs border border-(--rs-neutral-grey-300) rounded px-2 py-1 bg-white w-full min-w-[10rem]" />
                      ) : user.driveUrl ? (
                        <a href={user.driveUrl} target="_blank" rel="noopener noreferrer"
                          title="Open Google Drive file"
                          className="inline-flex text-(--rs-primary-600) hover:text-(--rs-primary-700)">
                          <FileText className="w-4 h-4" />
                        </a>
                      ) : (
                        <FileText className="w-4 h-4 mx-auto text-(--rs-neutral-grey-200)" />
                      )}
                    </td>

                    <td className="px-4 py-3">
                      {isEditing ? (
                        <input
                          value={editForm.memberCode}
                          onChange={e => setEditForm(f => ({ ...f, memberCode: e.target.value }))}
                          placeholder="e.g. ACNG-1"
                          className="text-xs w-full border border-(--rs-neutral-grey-300) rounded px-2 py-1 font-mono"
                        />
                      ) : user.memberCode ? (
                        <code className="text-[11px] font-mono text-(--rs-neutral-grey-600)">{user.memberCode}</code>
                      ) : (
                        <span className="text-xs text-(--rs-neutral-grey-300) italic">Not set</span>
                      )}
                    </td>

                    <td className="px-4 py-3 text-right">
                      {isEditing ? (
                        <div className="relative">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-(--rs-neutral-grey-400)">$</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            inputMode="decimal"
                            value={editForm.hourlyRateUsd}
                            onChange={e => setEditForm(f => ({ ...f, hourlyRateUsd: e.target.value }))}
                            placeholder="0.00"
                            className="text-xs w-full border border-(--rs-neutral-grey-300) rounded pl-5 pr-2 py-1 text-right tabular-nums"
                          />
                        </div>
                      ) : user.hourlyRateUsd != null ? (
                        <span className="text-sm font-medium text-(--rs-neutral-grey-800) tabular-nums">$ {formatUsd(user.hourlyRateUsd)}</span>
                      ) : (
                        <span className="text-xs text-(--rs-neutral-grey-300) italic">Not set</span>
                      )}
                    </td>

                    <td className="px-4 py-3 text-center">
                      {isEditing ? (
                        <input
                          type="checkbox"
                          checked={editForm.isActive}
                          onChange={e => setEditForm(f => ({ ...f, isActive: e.target.checked }))}
                          className="w-4 h-4 rounded accent-(--rs-primary-500)"
                        />
                      ) : (
                        <span
                          className={`inline-block w-2.5 h-2.5 rounded-full ${user.isActive ? 'bg-green-500' : 'bg-(--rs-neutral-grey-300)'}`}
                          title={user.isActive ? 'Active' : 'Inactive'}
                        />
                      )}
                    </td>

                    <td className="px-4 py-3 text-right">
                      {isEditing ? (
                        <div className="flex items-center justify-end gap-1">
                          <Button size="icon" variant="ghost" className="w-7 h-7 text-green-600 hover:text-green-700 hover:bg-green-50"
                            onClick={() => saveEdit(user.id)} disabled={saving} title="Save">
                            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                          </Button>
                          <Button size="icon" variant="ghost" className="w-7 h-7 text-red-400 hover:text-red-600 hover:bg-red-50"
                            onClick={cancelEdit} disabled={saving} title="Cancel">
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-1">
                          <Button size="sm" variant="ghost"
                            className="h-7 px-2.5 text-(--rs-neutral-grey-500) hover:text-(--rs-neutral-grey-900)"
                            onClick={() => startEdit(user)}>
                            <Pencil className="w-3.5 h-3.5 mr-1" />Edit
                          </Button>
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
                      )}
                    </td>
                  </tr>
                );
              })}

              {userList.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-4 py-10 text-center text-(--rs-neutral-grey-400) italic text-sm">
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
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl border border-(--rs-neutral-grey-200)">
            <div className="flex items-center justify-between border-b border-(--rs-neutral-grey-100) px-6 py-4">
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
                    {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
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

              <Field label="Hourly Rate (USD)">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-(--rs-neutral-grey-400)">$</span>
                  <input type="number" min="0" step="0.01" inputMode="decimal"
                    value={newForm.hourlyRateUsd} onChange={e => setNewForm(f => ({ ...f, hourlyRateUsd: e.target.value }))}
                    className={`${inputCls} pl-7 tabular-nums`} placeholder="0.00" />
                </div>
              </Field>

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

      <ConfirmDialog
        open={pendingRemove !== null}
        onOpenChange={(o) => { if (!o) setPendingRemove(null); }}
        destructive
        loading={togglingActive}
        title="Remove this user?"
        description={
          pendingRemove
            ? `${pendingRemove.name} will be deactivated — they won't be able to sign in. Their data is preserved, and you can restore them anytime.`
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

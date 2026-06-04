'use client';

import { useMemo, useState, useTransition } from 'react';
import { Search, X, Loader2, Check, CalendarDays, UserCheck } from 'lucide-react';

export type PickerUser = {
  id:         number;
  name:       string;
  email:      string | null;
  team:       string | null;
  role:       string;        // normalized role value (intern/ic/lead/admin)
  roleLabel:  string;
  inAudience: boolean;       // would receive the course from its audience rule
  assigned:   boolean;       // already has an explicit assignment row
};

type DuePreset = 'none' | '1w' | '2w' | '30d' | 'custom';

const DUE_PRESETS: { value: DuePreset; label: string }[] = [
  { value: 'none', label: 'No due date' },
  { value: '1w',   label: '1 week' },
  { value: '2w',   label: '2 weeks' },
  { value: '30d',  label: '30 days' },
  { value: 'custom', label: 'Custom' },
];

function isoFromPreset(due: DuePreset, customDate: string): string | null {
  if (due === 'none') return null;
  if (due === 'custom') {
    if (!customDate) return null;
    const d = new Date(`${customDate}T23:59:59`);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  const days = due === '1w' ? 7 : due === '2w' ? 14 : 30;
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

export function AssignPicker({
  users,
  teams,
  roles,
  assignAction,
}: {
  users: PickerUser[];
  teams: string[];
  roles: { value: string; label: string }[];
  assignAction: (userIds: number[], dueAtIso: string | null) => Promise<void>;
}) {
  const [q, setQ] = useState('');
  const [team, setTeam] = useState('');
  const [role, setRole] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [due, setDue] = useState<DuePreset>('none');
  const [customDate, setCustomDate] = useState('');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [savedMsg, setSavedMsg] = useState('');

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return users.filter(u =>
      (!team || u.team === team) &&
      (!role || u.role === role) &&
      (!needle || u.name.toLowerCase().includes(needle) || (u.email ?? '').toLowerCase().includes(needle)),
    );
  }, [users, q, team, role]);

  const filteredIds = filtered.map(u => u.id);
  const allFilteredSelected = filteredIds.length > 0 && filteredIds.every(id => selected.has(id));

  function toggle(id: number) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(prev => {
      const next = new Set(prev);
      if (allFilteredSelected) filteredIds.forEach(id => next.delete(id));
      else filteredIds.forEach(id => next.add(id));
      return next;
    });
  }

  function submit() {
    if (selected.size === 0) { setError('Select at least one person to assign.'); return; }
    setError('');
    setSavedMsg('');
    const ids = [...selected];
    const dueAt = isoFromPreset(due, customDate);
    startTransition(async () => {
      try {
        await assignAction(ids, dueAt);
        setSavedMsg(`Assigned ${ids.length} ${ids.length === 1 ? 'person' : 'people'}.`);
        setSelected(new Set());
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Assign failed.');
      }
    });
  }

  const selectCls = 'rounded-md border border-(--rs-neutral-grey-300) bg-white px-2.5 py-2 text-sm text-(--rs-neutral-grey-700) focus:outline-none focus:border-(--rs-primary-500) focus:ring-2 focus:ring-(--rs-primary-100)';

  return (
    <div className="rounded-xl border border-(--rs-neutral-grey-200) bg-white">
      {/* Search + filters */}
      <div className="flex flex-wrap items-center gap-2 border-b border-(--rs-neutral-grey-100) p-3">
        <div className="relative min-w-50 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-(--rs-neutral-grey-400)" />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search name or email…"
            className="w-full rounded-md border border-(--rs-neutral-grey-200) bg-white pl-9 pr-8 py-2 text-sm placeholder:text-(--rs-neutral-grey-400) focus:outline-none focus:border-(--rs-primary-500) focus:ring-2 focus:ring-(--rs-primary-100)"
          />
          {q && (
            <button type="button" onClick={() => setQ('')} aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-(--rs-neutral-grey-400) hover:bg-(--rs-neutral-grey-100) hover:text-(--rs-neutral-grey-700)">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <select value={team} onChange={e => setTeam(e.target.value)} className={selectCls} aria-label="Filter by team">
          <option value="">All teams</option>
          {teams.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={role} onChange={e => setRole(e.target.value)} className={selectCls} aria-label="Filter by role">
          <option value="">All roles</option>
          {roles.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      </div>

      {/* Select-all bar */}
      <div className="flex items-center justify-between gap-3 border-b border-(--rs-neutral-grey-100) px-3 py-2">
        <label className="flex items-center gap-2 text-sm text-(--rs-neutral-grey-700) cursor-pointer select-none">
          <input
            type="checkbox"
            checked={allFilteredSelected}
            onChange={toggleAll}
            disabled={filteredIds.length === 0}
            className="h-4 w-4 rounded border-(--rs-neutral-grey-300) text-(--rs-primary-600) focus:ring-(--rs-primary-200)"
          />
          Select all <span className="text-(--rs-neutral-grey-400)">({filtered.length})</span>
        </label>
        <span className="text-xs font-medium text-(--rs-primary-700)">
          {selected.size} selected
        </span>
      </div>

      {/* User list */}
      <div className="max-h-96 overflow-y-auto divide-y divide-(--rs-neutral-grey-50)">
        {filtered.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm italic text-(--rs-neutral-grey-400)">
            No people match your search or filters.
          </p>
        ) : (
          filtered.map(u => {
            const checked = selected.has(u.id);
            return (
              <label
                key={u.id}
                className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors ${checked ? 'bg-(--rs-primary-50)/50' : 'hover:bg-(--rs-neutral-grey-50)'}`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(u.id)}
                  className="h-4 w-4 rounded border-(--rs-neutral-grey-300) text-(--rs-primary-600) focus:ring-(--rs-primary-200)"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-(--rs-neutral-grey-900)">{u.name}</div>
                  <div className="truncate text-xs text-(--rs-neutral-grey-400)">
                    {[u.team, u.roleLabel].filter(Boolean).join(' · ')}
                    {u.email ? ` · ${u.email}` : ''}
                  </div>
                </div>
                {u.assigned ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-(--rs-primary-50) px-2 py-0.5 text-[10px] font-semibold text-(--rs-primary-700)">
                    <UserCheck className="w-3 h-3" /> Assigned
                  </span>
                ) : u.inAudience ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-(--rs-neutral-grey-100) px-2 py-0.5 text-[10px] font-medium text-(--rs-neutral-grey-500)">
                    <Check className="w-3 h-3" /> In audience
                  </span>
                ) : null}
              </label>
            );
          })
        )}
      </div>

      {/* Due date + submit */}
      <div className="space-y-3 border-t border-(--rs-neutral-grey-100) p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-(--rs-neutral-grey-500)">
            <CalendarDays className="w-3.5 h-3.5" /> Due date
          </span>
          {DUE_PRESETS.map(p => (
            <button
              key={p.value}
              type="button"
              onClick={() => setDue(p.value)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                due === p.value
                  ? 'border-(--rs-primary-500) bg-(--rs-primary-500) text-white'
                  : 'border-(--rs-neutral-grey-200) text-(--rs-neutral-grey-600) hover:border-(--rs-neutral-grey-300) hover:bg-(--rs-neutral-grey-50)'
              }`}
            >
              {p.label}
            </button>
          ))}
          {due === 'custom' && (
            <input
              type="date"
              value={customDate}
              onChange={e => setCustomDate(e.target.value)}
              className="rounded-md border border-(--rs-neutral-grey-300) bg-white px-2.5 py-1 text-sm"
            />
          )}
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="text-xs">
            {error && <span className="text-red-600">{error}</span>}
            {savedMsg && !error && <span className="font-medium text-green-700">{savedMsg}</span>}
          </div>
          <button
            type="button"
            onClick={submit}
            disabled={pending || selected.size === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-(--rs-primary-500) px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-(--rs-primary-600) active:translate-y-px disabled:opacity-50 disabled:active:translate-y-0"
          >
            {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />}
            {pending ? 'Assigning…' : `Assign${selected.size ? ` ${selected.size}` : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}

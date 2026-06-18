'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Loader2, CheckSquare, FileText, Clock, CalendarCheck, BellRing, ShieldCheck,
  Activity as ActivityIcon, Search, Users as UsersIcon,
} from 'lucide-react';
import { roleLabel, type AppRole } from '@/lib/rbac';
import type { UserRow } from '@/components/user-management-table';

type ActivityType = 'ticket' | 'report' | 'clock' | 'attendance' | 'ping' | 'admin';

interface ActivityItem {
  id: string;
  userId: number;
  userName: string;
  role: AppRole;
  team: string | null;
  type: ActivityType;
  description: string;
  at: string;
}

const TYPE_META: Record<ActivityType, { icon: typeof Clock; tint: string }> = {
  ticket:     { icon: CheckSquare,   tint: 'bg-(--rs-primary-50) text-(--rs-primary-600)' },
  report:     { icon: FileText,      tint: 'bg-amber-50 text-amber-600' },
  clock:      { icon: Clock,         tint: 'bg-emerald-50 text-emerald-600' },
  attendance: { icon: CalendarCheck, tint: 'bg-violet-50 text-violet-600' },
  ping:       { icon: BellRing,      tint: 'bg-rose-50 text-rose-600' },
  admin:      { icon: ShieldCheck,   tint: 'bg-(--rs-neutral-grey-100) text-(--rs-neutral-grey-700)' },
};

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (isNaN(then)) return '';
  const diff = Date.now() - then;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function UserActivityPanel({ users }: { users: UserRow[] }) {
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null); // null = Everyone
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [items, setItems]     = useState<ActivityItem[]>([]);
  const [roles, setRoles]     = useState<AppRole[]>([]);
  const [teams, setTeams]     = useState<string[]>([]);
  const [roleFilter, setRoleFilter] = useState('');
  const [teamFilter, setTeamFilter] = useState('');

  useEffect(() => {
    let cancelled = false;
    const url = selectedUserId == null
      ? '/api/admin/activity'
      : `/api/admin/activity?userId=${selectedUserId}`;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const r = await fetch(url);
        const d = (await r.json()) as { activities?: ActivityItem[]; roles?: AppRole[]; teams?: string[]; error?: string };
        if (cancelled) return;
        if (d.error) { setError(d.error); setItems([]); return; }
        setItems(d.activities ?? []);
        setRoles((d.roles ?? []) as AppRole[]);
        setTeams((d.teams ?? []) as string[]);
      } catch {
        if (!cancelled) setError('Failed to load activity.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [selectedUserId]);

  const roster = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...users]
      .filter(u => !q || u.name.toLowerCase().includes(q) || (u.team ?? '').toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [users, query]);

  const filtered = useMemo(
    () => items.filter(a =>
      (selectedUserId != null || !roleFilter || a.role === roleFilter) &&
      (selectedUserId != null || !teamFilter || a.team === teamFilter)),
    [items, roleFilter, teamFilter, selectedUserId],
  );

  const selectedUser = selectedUserId == null ? null : users.find(u => u.id === selectedUserId) ?? null;
  const selectCls = 'rounded-md border border-(--rs-neutral-grey-200) bg-white px-2.5 py-1.5 text-sm text-(--rs-neutral-grey-700) focus:outline-none focus:border-(--rs-primary-500) focus:ring-2 focus:ring-(--rs-primary-100)';

  function rosterButton(id: number | null, label: string, sub?: string) {
    const active = selectedUserId === id;
    return (
      <button
        key={id ?? 'everyone'}
        onClick={() => setSelectedUserId(id)}
        className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--rs-primary-300) ${
          active
            ? 'bg-(--rs-primary-50) text-(--rs-primary-700) font-semibold'
            : 'text-(--rs-neutral-grey-700) hover:bg-(--rs-neutral-grey-50)'
        }`}
      >
        <span className="block truncate">{label}</span>
        {sub && <span className="block truncate text-[11px] text-(--rs-neutral-grey-400)">{sub}</span>}
      </button>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-[16rem_1fr]">
      {/* Roster (desktop) */}
      <aside className="hidden md:flex md:flex-col rounded-xl border border-(--rs-neutral-grey-200) bg-white">
        <div className="p-2 border-b border-(--rs-neutral-grey-100)">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-(--rs-neutral-grey-400)" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search people…"
              aria-label="Search people"
              className="w-full rounded-md border border-(--rs-neutral-grey-200) bg-white pl-8 pr-2 py-1.5 text-sm focus:outline-none focus:border-(--rs-primary-500) focus:ring-2 focus:ring-(--rs-primary-100)"
            />
          </div>
        </div>
        <div className="p-1.5 overflow-y-auto max-h-[28rem] space-y-0.5">
          {rosterButton(null, 'Everyone', 'All recent activity')}
          {roster.map(u =>
            rosterButton(u.id, u.isActive ? u.name : `${u.name} (inactive)`,
              [roleLabel(u.role as AppRole), u.team].filter(Boolean).join(' · ')))}
        </div>
      </aside>

      {/* Roster (mobile) */}
      <div className="md:hidden">
        <label htmlFor="activity-person" className="sr-only">Select person</label>
        <select
          id="activity-person"
          value={selectedUserId ?? ''}
          onChange={e => setSelectedUserId(e.target.value === '' ? null : Number(e.target.value))}
          className={`${selectCls} w-full`}
        >
          <option value="">Everyone</option>
          {roster.map(u => (
            <option key={u.id} value={u.id}>{u.isActive ? u.name : `${u.name} (inactive)`}</option>
          ))}
        </select>
      </div>

      {/* Timeline */}
      <section className="space-y-4 min-w-0">
        {selectedUser ? (
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-(--rs-primary-50) text-(--rs-primary-600)">
              <UsersIcon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-(--rs-neutral-grey-900) truncate">{selectedUser.name}</p>
              <p className="text-[11px] text-(--rs-neutral-grey-400) truncate">
                {[roleLabel(selectedUser.role as AppRole), selectedUser.team].filter(Boolean).join(' · ')}
              </p>
            </div>
            {!loading && !error && (
              <span className="ml-auto text-xs text-(--rs-neutral-grey-400)">{filtered.length} events</span>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-(--rs-neutral-grey-400)">Filter</label>
            <select aria-label="Filter by role" value={roleFilter} onChange={e => setRoleFilter(e.target.value)} className={selectCls}>
              <option value="">All roles</option>
              {roles.map(r => <option key={r} value={r}>{roleLabel(r)}</option>)}
            </select>
            <select aria-label="Filter by team" value={teamFilter} onChange={e => setTeamFilter(e.target.value)} className={selectCls}>
              <option value="">All teams</option>
              {teams.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            {(roleFilter || teamFilter) && (
              <button type="button" onClick={() => { setRoleFilter(''); setTeamFilter(''); }}
                className="text-xs text-(--rs-primary-600) hover:underline">Clear</button>
            )}
            {!loading && !error && (
              <span className="ml-auto text-xs text-(--rs-neutral-grey-400)">{filtered.length} of {items.length} events</span>
            )}
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 py-8 text-(--rs-neutral-grey-500)">
            <Loader2 className="w-4 h-4 animate-spin" /><span className="text-sm">Loading activity…</span>
          </div>
        ) : error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-(--rs-neutral-grey-200) py-12 text-(--rs-neutral-grey-400)">
            <ActivityIcon className="w-6 h-6" />
            <p className="text-sm">{items.length === 0 ? 'No recent activity.' : 'No activity matches this view.'}</p>
          </div>
        ) : (
          <ul className="rounded-xl border border-(--rs-neutral-grey-200) bg-white divide-y divide-(--rs-neutral-grey-100)">
            {filtered.map(a => {
              const meta = TYPE_META[a.type];
              const Icon = meta.icon;
              return (
                <li key={a.id} className="flex items-center gap-3 px-4 py-3">
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${meta.tint}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-(--rs-neutral-grey-800)">
                      {selectedUser
                        ? a.description
                        : <><span className="font-semibold text-(--rs-neutral-grey-900)">{a.userName}</span> · {a.description}</>}
                    </p>
                    {!selectedUser && (
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-(--rs-neutral-grey-400)">
                        <span className="rounded bg-(--rs-neutral-grey-100) px-1.5 py-0.5 font-medium text-(--rs-neutral-grey-600)">{roleLabel(a.role)}</span>
                        {a.team && <span className="rounded bg-(--rs-neutral-grey-100) px-1.5 py-0.5 font-medium text-(--rs-neutral-grey-600)">{a.team}</span>}
                      </div>
                    )}
                  </div>
                  <span className="shrink-0 text-xs text-(--rs-neutral-grey-400) tabular-nums" title={new Date(a.at).toLocaleString()}>
                    {relativeTime(a.at)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

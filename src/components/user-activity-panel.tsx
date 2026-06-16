'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, CheckSquare, FileText, Clock, CalendarCheck, BellRing, Activity as ActivityIcon } from 'lucide-react';
import { roleLabel, type AppRole } from '@/lib/rbac';

type ActivityType = 'ticket' | 'report' | 'clock' | 'attendance' | 'ping';

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

export function UserActivityPanel() {
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [items, setItems]       = useState<ActivityItem[]>([]);
  const [roles, setRoles]       = useState<AppRole[]>([]);
  const [teams, setTeams]       = useState<string[]>([]);
  const [roleFilter, setRoleFilter] = useState('');
  const [teamFilter, setTeamFilter] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/activity')
      .then(r => r.json())
      .then((d: { activities?: ActivityItem[]; roles?: AppRole[]; teams?: string[]; error?: string }) => {
        if (cancelled) return;
        if (d.error) { setError(d.error); return; }
        setItems(d.activities ?? []);
        setRoles(d.roles ?? []);
        setTeams(d.teams ?? []);
      })
      .catch(() => { if (!cancelled) setError('Failed to load activity.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(
    () => items.filter(a =>
      (!roleFilter || a.role === roleFilter) &&
      (!teamFilter || a.team === teamFilter)),
    [items, roleFilter, teamFilter],
  );

  const selectCls = 'rounded-md border border-(--rs-neutral-grey-200) bg-white px-2.5 py-1.5 text-sm text-(--rs-neutral-grey-700) focus:outline-none focus:border-(--rs-primary-500) focus:ring-2 focus:ring-(--rs-primary-100)';

  return (
    <div className="space-y-4">
      {/* Filters */}
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

      {loading ? (
        <div className="flex items-center gap-2 py-8 text-(--rs-neutral-grey-500)">
          <Loader2 className="w-4 h-4 animate-spin" /><span className="text-sm">Loading activity…</span>
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-(--rs-neutral-grey-200) py-12 text-(--rs-neutral-grey-400)">
          <ActivityIcon className="w-6 h-6" />
          <p className="text-sm">{items.length === 0 ? 'No recent activity.' : 'No activity matches these filters.'}</p>
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
                    <span className="font-semibold text-(--rs-neutral-grey-900)">{a.userName}</span> · {a.description}
                  </p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-(--rs-neutral-grey-400)">
                    <span className="rounded bg-(--rs-neutral-grey-100) px-1.5 py-0.5 font-medium text-(--rs-neutral-grey-600)">{roleLabel(a.role)}</span>
                    {a.team && <span className="rounded bg-(--rs-neutral-grey-100) px-1.5 py-0.5 font-medium text-(--rs-neutral-grey-600)">{a.team}</span>}
                  </div>
                </div>
                <span className="shrink-0 text-xs text-(--rs-neutral-grey-400) tabular-nums" title={new Date(a.at).toLocaleString()}>
                  {relativeTime(a.at)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Briefcase, ArrowUp, ArrowDown, ChevronsUpDown, Search } from 'lucide-react';
import { PositionTableRow, type Position } from './position-table-row';

type SortKey =
  | 'job_title' | 'placement_type' | 'location' | 'employment_type'
  | 'openings' | 'applicant_count' | 'created_by_name' | 'created_at' | 'is_open';
type SortDir = 'asc' | 'desc';

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'job_title',       label: 'Job title' },
  { key: 'placement_type',  label: 'Placement' },
  { key: 'location',        label: 'Location' },
  { key: 'employment_type', label: 'Type' },
  { key: 'openings',        label: 'Openings' },
  { key: 'applicant_count', label: 'Applicants' },
  { key: 'created_by_name', label: 'Created by' },
  { key: 'created_at',      label: 'Opened' },
  { key: 'is_open',         label: 'Status' },
];

function sortValue(p: Position, key: SortKey): string | number {
  switch (key) {
    case 'openings':   return p.openings ?? 0;
    case 'applicant_count': return p.applicant_count ?? 0;
    case 'is_open':    return p.is_open ? 1 : 0;
    case 'created_at': return new Date(p.created_at).getTime() || 0;
    case 'created_by_name': return (p.created_by_name ?? '').toLowerCase();
    default:           return String(p[key] ?? '').toLowerCase();
  }
}

const selectClass =
  'h-9 rounded-lg border border-(--rs-neutral-grey-200) bg-white px-2.5 text-xs text-(--rs-neutral-grey-700) focus:border-(--rs-primary-300) focus:outline-none';

export function PositionsTable({ positions }: { positions: Position[] }) {
  const [search, setSearch]       = useState('');
  const [status, setStatus]       = useState<'all' | 'open' | 'closed'>('all');
  const [placement, setPlacement] = useState<'all' | 'internal' | 'external'>('all');
  const [type, setType]           = useState<'all' | 'full_time' | 'part_time'>('all');
  const [sortKey, setSortKey]     = useState<SortKey>('created_at');
  const [sortDir, setSortDir]     = useState<SortDir>('desc');

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  const rows = useMemo(() => {
    let r = positions;
    const q = search.trim().toLowerCase();
    if (q) {
      r = r.filter(p =>
        p.job_title.toLowerCase().includes(q) ||
        (p.location ?? '').toLowerCase().includes(q) ||
        (p.compensation ?? '').toLowerCase().includes(q) ||
        (p.created_by_name ?? '').toLowerCase().includes(q),
      );
    }
    if (status !== 'all')    r = r.filter(p => (status === 'open' ? p.is_open : !p.is_open));
    if (placement !== 'all') r = r.filter(p => (p.placement_type ?? 'internal') === placement);
    if (type !== 'all')      r = r.filter(p => (p.employment_type ?? 'full_time') === type);

    return [...r].sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [positions, search, status, placement, type, sortKey, sortDir]);

  if (positions.length === 0) {
    return (
      <Card>
        <CardContent className="p-0">
          <div className="px-6 py-20 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-(--rs-primary-50) flex items-center justify-center mb-3">
              <Briefcase className="w-6 h-6 text-(--rs-primary-500)" />
            </div>
            <p className="text-sm font-semibold text-(--rs-neutral-grey-900)">No positions yet</p>
            <p className="text-sm text-(--rs-neutral-grey-500) mt-1 max-w-sm mx-auto">
              Click <strong>Add position</strong> to track an open role.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        {/* Filter toolbar */}
        <div className="flex flex-wrap items-center gap-2 border-b border-(--rs-neutral-grey-100) px-4 py-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-(--rs-neutral-grey-400)" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search title, location, compensation, creator…"
              className="h-9 w-full rounded-lg border border-(--rs-neutral-grey-200) bg-white pl-9 pr-3 text-sm placeholder:text-(--rs-neutral-grey-400) focus:border-(--rs-primary-300) focus:outline-none"
            />
          </div>
          <select aria-label="Filter by status" value={status} onChange={e => setStatus(e.target.value as typeof status)} className={selectClass}>
            <option value="all">All statuses</option>
            <option value="open">Open</option>
            <option value="closed">Closed</option>
          </select>
          <select aria-label="Filter by placement" value={placement} onChange={e => setPlacement(e.target.value as typeof placement)} className={selectClass}>
            <option value="all">All placements</option>
            <option value="internal">Internal</option>
            <option value="external">External</option>
          </select>
          <select aria-label="Filter by type" value={type} onChange={e => setType(e.target.value as typeof type)} className={selectClass}>
            <option value="all">All types</option>
            <option value="full_time">Full time</option>
            <option value="part_time">Part time</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-(--rs-neutral-grey-200) text-left text-xs uppercase tracking-wider text-(--rs-neutral-grey-500) bg-(--rs-neutral-grey-50)">
              <tr>
                {COLUMNS.map((c, i) => {
                  const isActive = sortKey === c.key;
                  return (
                    <th key={c.key} className={`${i === 0 ? 'px-6' : 'px-4'} py-3 font-semibold`}>
                      <button
                        type="button"
                        onClick={() => toggleSort(c.key)}
                        className="inline-flex items-center gap-1 uppercase tracking-wider hover:text-(--rs-neutral-grey-800)"
                      >
                        {c.label}
                        {isActive
                          ? (sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)
                          : <ChevronsUpDown className="h-3 w-3 opacity-40" />}
                      </button>
                    </th>
                  );
                })}
                <th className="px-4 py-3 font-semibold w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-(--rs-neutral-grey-100)">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={COLUMNS.length + 1} className="px-6 py-14 text-center text-sm text-(--rs-neutral-grey-500)">
                    No positions match your filters.
                  </td>
                </tr>
              ) : (
                rows.map(p => <PositionTableRow key={p.id} position={p} />)
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

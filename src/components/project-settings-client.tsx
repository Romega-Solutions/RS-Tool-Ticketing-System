'use client';

import { useEffect, useState } from 'react';
import { Loader2, Plus, X, Trash2 } from 'lucide-react';

interface Label   { id: number; project_id: number; name: string; color: string }
interface Member  { id: number; project_id: number; user_id: number; name: string; email: string; role: string }
interface Cycle   { id: number; project_id: number; name: string; start_date: string; end_date: string; archived: number }
interface UserRow { id: number; name: string; email: string }

const LABEL_COLORS = ['#ef4444','#f97316','#eab308','#22c55e','#3b82f6','#8b5cf6','#ec4899','#6b7280'];

export function ProjectSettingsClient({
  projectId,
  initialLabels,
  initialMembers,
  initialCycles,
}: {
  projectId: string;
  initialLabels: Label[];
  initialMembers: Member[];
  initialCycles: Cycle[];
}) {
  const [labels, setLabels]   = useState<Label[]>(initialLabels);
  const [members, setMembers] = useState<Member[]>(initialMembers);
  const [cycles, setCycles]   = useState<Cycle[]>(initialCycles);

  const [allUsers, setAllUsers] = useState<UserRow[]>([]);

  useEffect(() => {
    fetch('/api/tickets/users').then(r => r.json()).then(d => setAllUsers(d as UserRow[])).catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      <LabelsSection projectId={projectId} labels={labels} setLabels={setLabels} />
      <MembersSection projectId={projectId} members={members} setMembers={setMembers} allUsers={allUsers} />
      <CyclesSection projectId={projectId} cycles={cycles} setCycles={setCycles} />
    </div>
  );
}

// ── Labels ──────────────────────────────────────────────────────────────

function LabelsSection({
  projectId, labels, setLabels,
}: {
  projectId: string; labels: Label[]; setLabels: (l: Label[]) => void;
}) {
  const [name, setName]   = useState('');
  const [color, setColor] = useState(LABEL_COLORS[5]);
  const [busy, setBusy]   = useState(false);

  const add = async () => {
    if (!name.trim()) return;
    setBusy(true);
    const res = await fetch(`/api/tickets/projects/${projectId}/labels`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), color }),
    });
    if (res.ok) { setLabels([...labels, (await res.json()) as Label]); setName(''); }
    setBusy(false);
  };

  const remove = async (id: number) => {
    if (!confirm('Delete this label? It will be removed from all tasks.')) return;
    const res = await fetch(`/api/tickets/projects/${projectId}/labels/${id}`, { method: 'DELETE' });
    if (res.ok) setLabels(labels.filter(l => l.id !== id));
  };

  return (
    <Card title="Labels">
      <div className="flex flex-wrap gap-1.5 mb-3">
        {labels.length === 0 && <p className="text-xs text-(--rs-neutral-grey-400) italic">No labels yet.</p>}
        {labels.map(l => (
          <span key={l.id} className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full text-white" style={{ background: l.color }}>
            {l.name}
            <button onClick={() => remove(l.id)} className="opacity-70 hover:opacity-100">
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          value={name} onChange={e => setName(e.target.value)} placeholder="Label name…"
          className="text-sm flex-1 px-3 py-1.5 border border-(--rs-neutral-grey-200) rounded-md bg-white focus:outline-none focus:border-(--rs-primary-400)"
        />
        <div className="flex gap-1">
          {LABEL_COLORS.map(c => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={`w-5 h-5 rounded-full border-2 ${color === c ? 'border-(--rs-neutral-grey-900)' : 'border-transparent'}`}
              style={{ background: c }}
              aria-label={c}
            />
          ))}
        </div>
        <button
          onClick={add} disabled={busy || !name.trim()}
          className="flex items-center gap-1 text-sm font-medium text-white px-3 py-1.5 rounded-md disabled:opacity-50"
          style={{ background: 'var(--rs-primary-500)' }}
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          Add
        </button>
      </div>
    </Card>
  );
}

// ── Members ────────────────────────────────────────────────────────────

function MembersSection({
  projectId, members, setMembers, allUsers,
}: {
  projectId: string; members: Member[]; setMembers: (m: Member[]) => void; allUsers: UserRow[];
}) {
  const [userId, setUserId] = useState('');
  const [role, setRole]     = useState('member');
  const [busy, setBusy]     = useState(false);

  const memberIds = new Set(members.map(m => m.user_id));
  const candidates = allUsers.filter(u => !memberIds.has(u.id));

  const add = async () => {
    if (!userId) return;
    setBusy(true);
    const res = await fetch(`/api/tickets/projects/${projectId}/members`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: Number(userId), role }),
    });
    if (res.ok) {
      const u = allUsers.find(x => x.id === Number(userId));
      if (u) setMembers([...members, { id: Date.now(), project_id: Number(projectId), user_id: u.id, name: u.name, email: u.email, role }]);
      setUserId('');
    }
    setBusy(false);
  };

  const remove = async (userIdToRemove: number) => {
    if (!confirm('Remove this member from the project?')) return;
    const res = await fetch(`/api/tickets/projects/${projectId}/members/${userIdToRemove}`, { method: 'DELETE' });
    if (res.ok) setMembers(members.filter(m => m.user_id !== userIdToRemove));
  };

  return (
    <Card title="Members">
      <div className="space-y-1.5 mb-3">
        {members.length === 0 && <p className="text-xs text-(--rs-neutral-grey-400) italic">No members yet.</p>}
        {members.map(m => (
          <div key={m.id} className="flex items-center justify-between px-3 py-2 bg-white border border-(--rs-neutral-grey-100) rounded-lg">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-(--rs-neutral-grey-900) truncate">{m.name}</div>
              <div className="text-xs text-(--rs-neutral-grey-500) truncate">{m.email}</div>
            </div>
            <span className="text-xs px-2 py-0.5 rounded-full bg-(--rs-neutral-grey-100) text-(--rs-neutral-grey-700) capitalize">
              {m.role}
            </span>
            <button onClick={() => remove(m.user_id)} className="ml-2 text-(--rs-neutral-grey-400) hover:text-red-500">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <select
          value={userId} onChange={e => setUserId(e.target.value)}
          className="text-sm flex-1 px-2.5 py-1.5 border border-(--rs-neutral-grey-200) rounded-md bg-white"
        >
          <option value="">Choose user…</option>
          {candidates.map(u => <option key={u.id} value={u.id}>{u.name} · {u.email}</option>)}
        </select>
        <select
          value={role} onChange={e => setRole(e.target.value)}
          className="text-sm px-2.5 py-1.5 border border-(--rs-neutral-grey-200) rounded-md bg-white"
        >
          <option value="lead">Lead</option>
          <option value="member">Member</option>
          <option value="viewer">Viewer</option>
        </select>
        <button
          onClick={add} disabled={busy || !userId}
          className="flex items-center gap-1 text-sm font-medium text-white px-3 py-1.5 rounded-md disabled:opacity-50"
          style={{ background: 'var(--rs-primary-500)' }}
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          Add
        </button>
      </div>
    </Card>
  );
}

// ── Cycles ─────────────────────────────────────────────────────────────

function CyclesSection({
  projectId, cycles, setCycles,
}: {
  projectId: string; cycles: Cycle[]; setCycles: (c: Cycle[]) => void;
}) {
  const [name, setName]           = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate]     = useState('');
  const [busy, setBusy]           = useState(false);

  const add = async () => {
    if (!name.trim() || !startDate || !endDate) return;
    setBusy(true);
    const res = await fetch(`/api/tickets/projects/${projectId}/cycles`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), startDate, endDate }),
    });
    if (res.ok) {
      setCycles([(await res.json()) as Cycle, ...cycles]);
      setName(''); setStartDate(''); setEndDate('');
    }
    setBusy(false);
  };

  const archive = async (id: number) => {
    if (!confirm('Archive this cycle?')) return;
    const res = await fetch(`/api/tickets/projects/${projectId}/cycles/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived: 1 }),
    });
    if (res.ok) setCycles(cycles.filter(c => c.id !== id));
  };

  return (
    <Card title="Cycles (Sprints)">
      <div className="space-y-1.5 mb-3">
        {cycles.length === 0 && <p className="text-xs text-(--rs-neutral-grey-400) italic">No cycles yet.</p>}
        {cycles.map(c => (
          <div key={c.id} className="flex items-center justify-between px-3 py-2 bg-white border border-(--rs-neutral-grey-100) rounded-lg">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-(--rs-neutral-grey-900) truncate">{c.name}</div>
              <div className="text-xs text-(--rs-neutral-grey-500)">{c.start_date} → {c.end_date}</div>
            </div>
            <button onClick={() => archive(c.id)} className="text-(--rs-neutral-grey-400) hover:text-red-500">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center">
        <input
          value={name} onChange={e => setName(e.target.value)} placeholder="Cycle name (e.g. Sprint 14)…"
          className="text-sm px-3 py-1.5 border border-(--rs-neutral-grey-200) rounded-md bg-white"
        />
        <input
          type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
          className="text-sm px-2.5 py-1.5 border border-(--rs-neutral-grey-200) rounded-md bg-white"
        />
        <input
          type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
          className="text-sm px-2.5 py-1.5 border border-(--rs-neutral-grey-200) rounded-md bg-white"
        />
        <button
          onClick={add} disabled={busy || !name.trim() || !startDate || !endDate}
          className="flex items-center gap-1 text-sm font-medium text-white px-3 py-1.5 rounded-md disabled:opacity-50"
          style={{ background: 'var(--rs-primary-500)' }}
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          Add
        </button>
      </div>
    </Card>
  );
}

// ── Card wrapper ───────────────────────────────────────────────────────

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border border-(--rs-neutral-grey-100) bg-white rounded-xl p-5">
      <h2 className="text-base font-serif font-semibold text-(--rs-neutral-grey-900) mb-3">{title}</h2>
      {children}
    </section>
  );
}

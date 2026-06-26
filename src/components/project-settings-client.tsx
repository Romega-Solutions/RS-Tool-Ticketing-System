'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Edit3, Loader2, Plus, X, Trash2 } from 'lucide-react';

interface Label   { id: number; project_id: number; name: string; color: string }
interface Member  { id: number; project_id: number; user_id: number; name: string; email: string; role: string }
interface Cycle   { id: number; project_id: number; name: string; start_date: string; end_date: string; archived: number }
interface UserRow { id: number; name: string; email: string }
interface ProjectDetails { name: string; description: string; team: string | null; autoArchiveDoneDays: number | null }

// Choices for the auto-archive window (days a Done task waits before it's archived).
const AUTO_ARCHIVE_OPTIONS: { value: number; label: string }[] = [
  { value: 0,  label: 'Off — never auto-archive' },
  { value: 14, label: 'After 14 days' },
  { value: 30, label: 'After 30 days' },
  { value: 60, label: 'After 60 days' },
  { value: 90, label: 'After 90 days' },
];

const LABEL_COLORS = ['#ef4444','#f97316','#eab308','#22c55e','#3b82f6','#8b5cf6','#ec4899','#6b7280'];

export function ProjectSettingsClient({
  projectId,
  initialProject,
  canReteam,
  initialLabels,
  initialMembers,
  initialCycles,
}: {
  projectId: string;
  initialProject: ProjectDetails;
  canReteam: boolean;
  initialLabels: Label[];
  initialMembers: Member[];
  initialCycles: Cycle[];
}) {
  const [project, setProject] = useState<ProjectDetails>(initialProject);
  const [labels, setLabels]   = useState<Label[]>(initialLabels);
  const [members, setMembers] = useState<Member[]>(initialMembers);
  const [cycles, setCycles]   = useState<Cycle[]>(initialCycles);

  const [allUsers, setAllUsers] = useState<UserRow[]>([]);

  useEffect(() => {
    fetch('/api/tickets/users').then(r => r.json()).then(d => setAllUsers(d as UserRow[])).catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      <ProjectDetailsSection
        projectId={projectId}
        project={project}
        setProject={setProject}
        canReteam={canReteam}
      />
      <AutoArchiveSection
        projectId={projectId}
        value={project.autoArchiveDoneDays}
        onChange={(days) => setProject({ ...project, autoArchiveDoneDays: days })}
      />
      <LabelsSection projectId={projectId} labels={labels} setLabels={setLabels} />
      <MembersSection projectId={projectId} members={members} setMembers={setMembers} allUsers={allUsers} />
      <CyclesSection projectId={projectId} cycles={cycles} setCycles={setCycles} />
    </div>
  );
}

// ── Project details ─────────────────────────────────────────────────────

function ProjectDetailsSection({
  projectId,
  project,
  setProject,
  canReteam,
}: {
  projectId: string;
  project: ProjectDetails;
  setProject: (project: ProjectDetails) => void;
  canReteam: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description);
  const [team, setTeam] = useState(project.team ?? '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const resetForm = () => {
    setName(project.name);
    setDescription(project.description);
    setTeam(project.team ?? '');
    setMessage('');
    setError('');
  };

  const cancel = () => {
    resetForm();
    setEditing(false);
  };

  const save = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Project name cannot be blank');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');
    try {
      const body: { name: string; description: string | null; team?: string | null } = {
        name: trimmedName,
        description: description.trim() || null,
      };
      if (canReteam) body.team = team.trim() || null;

      const res = await fetch(`/api/tickets/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? 'Failed to update project');
        return;
      }

      const nextProject = {
        name: trimmedName,
        description: description.trim(),
        team: canReteam ? (team.trim() || null) : project.team,
        autoArchiveDoneDays: project.autoArchiveDoneDays,
      };
      setProject(nextProject);
      setMessage('Project details updated');
      setEditing(false);
      router.refresh();
    } catch {
      setError('Request failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card
      title="Project details"
      action={!editing && (
        <button
          type="button"
          onClick={() => { resetForm(); setEditing(true); }}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-(--rs-neutral-grey-200) bg-white px-3 py-1.5 text-xs font-medium text-(--rs-neutral-grey-600) transition-colors hover:border-(--rs-primary-300) hover:text-(--rs-primary-700)"
        >
          <Edit3 className="h-3.5 w-3.5" />
          Edit
        </button>
      )}
    >
      {!editing ? (
        <div className="space-y-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-(--rs-neutral-grey-400)">Name</p>
            <p className="mt-1 text-sm font-semibold text-(--rs-neutral-grey-900)">{project.name}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-(--rs-neutral-grey-400)">Description</p>
            <p className="mt-1 text-sm text-(--rs-neutral-grey-600)">
              {project.description || <span className="italic text-(--rs-neutral-grey-400)">No description yet.</span>}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-(--rs-neutral-grey-400)">Team</p>
            <p className="mt-1 text-sm text-(--rs-neutral-grey-600)">
              {project.team || <span className="italic text-(--rs-neutral-grey-400)">No team assigned.</span>}
            </p>
          </div>
          {message && (
            <p className="inline-flex items-center gap-1.5 text-xs font-medium text-green-600">
              <Check className="h-3.5 w-3.5" />
              {message}
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <label className="block">
            <span className="text-xs font-medium text-(--rs-neutral-grey-600)">Project name</span>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              className="mt-1 min-h-10 w-full rounded-md border border-(--rs-neutral-grey-200) bg-white px-3 py-2 text-sm focus:border-(--rs-primary-400) focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-(--rs-neutral-grey-600)">Description</span>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              className="mt-1 w-full resize-y rounded-md border border-(--rs-neutral-grey-200) bg-white px-3 py-2 text-sm focus:border-(--rs-primary-400) focus:outline-none"
            />
          </label>
          {canReteam && (
            <label className="block">
              <span className="text-xs font-medium text-(--rs-neutral-grey-600)">Team</span>
              <input
                value={team}
                onChange={e => setTeam(e.target.value)}
                placeholder="Team name"
                className="mt-1 min-h-10 w-full rounded-md border border-(--rs-neutral-grey-200) bg-white px-3 py-2 text-sm focus:border-(--rs-primary-400) focus:outline-none"
              />
            </label>
          )}
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={save}
              disabled={saving || !name.trim()}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              style={{ background: 'var(--rs-primary-500)' }}
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Save
            </button>
            <button
              type="button"
              onClick={cancel}
              disabled={saving}
              className="inline-flex min-h-10 items-center rounded-md px-3 py-2 text-sm text-(--rs-neutral-grey-500) transition-colors hover:bg-(--rs-neutral-grey-50) hover:text-(--rs-neutral-grey-800) disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}

// ── Automation: auto-archive Done ─────────────────────────────────────────

function AutoArchiveSection({
  projectId,
  value,
  onChange,
}: {
  projectId: string;
  value: number | null;
  onChange: (days: number | null) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const current = value && value > 0 ? value : 0;

  const save = async (days: number) => {
    setSaving(true);
    setMessage('');
    setError('');
    try {
      const res = await fetch(`/api/tickets/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoArchiveDoneDays: days === 0 ? null : days }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) { setError(data.error ?? 'Failed to update'); return; }
      onChange(days === 0 ? null : days);
      setMessage(days === 0 ? 'Auto-archive turned off.' : `Done tasks will auto-archive after ${days} days.`);
    } catch {
      setError('Request failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title="Auto-archive completed tasks">
      <div className="space-y-3">
        <p className="text-sm text-(--rs-neutral-grey-600)">
          Keep the Done column tidy: completed tasks older than this are moved to the
          project Archive automatically. You can still archive on demand from the Done
          column, and restore anything from the Archive.
        </p>
        <label className="block max-w-xs">
          <span className="text-xs font-medium text-(--rs-neutral-grey-600)">Archive Done tasks</span>
          <select
            value={current}
            disabled={saving}
            onChange={e => save(Number(e.target.value))}
            className="mt-1 min-h-10 w-full rounded-md border border-(--rs-neutral-grey-200) bg-white px-3 py-2 text-sm focus:border-(--rs-primary-400) focus:outline-none disabled:opacity-50"
          >
            {AUTO_ARCHIVE_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
        {saving && (
          <p className="inline-flex items-center gap-1.5 text-xs text-(--rs-neutral-grey-500)">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
          </p>
        )}
        {message && (
          <p className="inline-flex items-center gap-1.5 text-xs font-medium text-green-600">
            <Check className="h-3.5 w-3.5" /> {message}
          </p>
        )}
        {error && <p role="alert" className="text-xs text-red-500">{error}</p>}
      </div>
    </Card>
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
  const [savingId, setSavingId] = useState<number | null>(null);
  const [error, setError]   = useState('');

  const memberIds = new Set(members.map(m => m.user_id));
  const candidates = allUsers.filter(u => !memberIds.has(u.id));

  // Change an existing member's project role (optimistic; revert on failure).
  const changeRole = async (memberUserId: number, newRole: string) => {
    const snapshot = members;
    setSavingId(memberUserId);
    setError('');
    setMembers(members.map(m => (m.user_id === memberUserId ? { ...m, role: newRole } : m)));
    try {
      const res = await fetch(`/api/tickets/projects/${projectId}/members/${memberUserId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        setMembers(snapshot);
        setError(d.error ?? 'Could not change role.');
      }
    } catch {
      setMembers(snapshot);
      setError('Network error — role not changed.');
    } finally {
      setSavingId(null);
    }
  };

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
      <p className="mb-2 text-xs text-(--rs-neutral-grey-500)">
        <strong>Lead</strong> can edit everything incl. due dates, assignees &amp; settings ·{' '}
        <strong>Member</strong> edits items (not due date/assignees) ·{' '}
        <strong>Viewer</strong> can view &amp; comment only.
      </p>
      {error && <p className="mb-2 text-xs text-red-600" role="alert">{error}</p>}
      <div className="space-y-1.5 mb-3">
        {members.length === 0 && <p className="text-xs text-(--rs-neutral-grey-400) italic">No members yet.</p>}
        {members.map(m => (
          <div key={m.id} className="flex items-center gap-2 px-3 py-2 bg-white border border-(--rs-neutral-grey-100) rounded-lg">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-(--rs-neutral-grey-900) truncate">{m.name}</div>
              <div className="text-xs text-(--rs-neutral-grey-500) truncate">{m.email}</div>
            </div>
            <label htmlFor={`member-role-${m.user_id}`} className="sr-only">Project role for {m.name}</label>
            <select
              id={`member-role-${m.user_id}`}
              value={m.role}
              disabled={savingId === m.user_id}
              onChange={e => changeRole(m.user_id, e.target.value)}
              aria-label={`Project role for ${m.name}`}
              className="cursor-pointer rounded-md border border-(--rs-neutral-grey-200) bg-white px-2 py-1.5 text-xs capitalize outline-none focus:border-(--rs-primary-400) focus:ring-2 focus:ring-(--rs-primary-200) disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="lead">Lead</option>
              <option value="member">Member</option>
              <option value="viewer">Viewer</option>
            </select>
            {savingId === m.user_id ? (
              <Loader2 className="w-4 h-4 shrink-0 animate-spin text-(--rs-neutral-grey-400)" aria-label="Saving role" />
            ) : (
              <button
                onClick={() => remove(m.user_id)}
                aria-label={`Remove ${m.name} from project`}
                className="shrink-0 rounded-md p-1 text-(--rs-neutral-grey-400) transition-colors hover:bg-red-50 hover:text-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
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

function Card({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="border border-(--rs-neutral-grey-100) bg-white rounded-xl p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-serif font-semibold text-(--rs-neutral-grey-900)">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

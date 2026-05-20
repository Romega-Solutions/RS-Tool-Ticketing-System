'use client';

import { useEffect, useState } from 'react';
import { Plus, Loader2, X } from 'lucide-react';
import { useRouter } from 'next/navigation';

export function NewProjectButton({
  defaultTeam,
  canChooseTeam,
}: {
  /** Current user's team — surfaced in the modal so they know which team it'll be tagged with. */
  defaultTeam: string | null;
  /** Lead/admin can edit the team field. ICs/interns can't. */
  canChooseTeam: boolean;
}) {
  const router = useRouter();
  const [open, setOpen]               = useState(false);
  const [name, setName]               = useState('');
  const [identifier, setIdentifier]   = useState('');
  const [description, setDescription] = useState('');
  const [team, setTeam]               = useState(defaultTeam ?? '');
  const [busy, setBusy]               = useState(false);
  const [error, setError]             = useState('');
  const [teamOptions, setTeamOptions] = useState<string[]>([]);

  // Fetch the team list once when the modal opens. Distinct values from
  // users.team — so the dropdown reflects whoever is on a team right now.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch('/api/tickets/teams')
      .then(r => r.ok ? r.json() : [])
      .then((teams: string[]) => {
        if (cancelled) return;
        // Make sure the caller's own team is always selectable even if no
        // other active user has it set yet.
        const merged = defaultTeam && !teams.includes(defaultTeam)
          ? [defaultTeam, ...teams].sort((a, b) => a.localeCompare(b))
          : teams;
        setTeamOptions(merged);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [open, defaultTeam]);

  const reset = () => {
    setName(''); setIdentifier(''); setDescription('');
    setTeam(defaultTeam ?? ''); setError('');
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/tickets/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          identifier: identifier.trim() || undefined,
          description: description.trim() || undefined,
          // Only forward team if it differs from the user's own (server auto-fills).
          team: canChooseTeam ? (team.trim() || null) : undefined,
        }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        setError(d.error ?? 'Failed to create project');
        return;
      }
      reset();
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Create a new project"
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex items-center gap-1.5 text-sm font-medium text-white px-3 py-1.5 rounded-md"
        style={{ background: 'var(--rs-primary-500)' }}
      >
        <Plus className="w-3.5 h-3.5" aria-hidden="true" /> New project
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={() => !busy && setOpen(false)}
          role="presentation"
        >
          <form
            onClick={e => e.stopPropagation()}
            onSubmit={submit}
            aria-busy={busy}
            className="bg-white rounded-xl shadow-2xl w-full max-w-md p-5 space-y-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="np-title"
          >
            <div className="flex items-center justify-between">
              <h2 id="np-title" className="text-lg font-serif font-semibold text-(--rs-neutral-grey-900)">
                New project
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={busy}
                aria-label="Close dialog"
                className="text-(--rs-neutral-grey-400) hover:text-(--rs-neutral-grey-700)"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <div className="space-y-3">
              <Field label="Name" required htmlFor="np-name">
                <input
                  id="np-name"
                  autoFocus
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Internal AI Tools"
                  aria-required="true"
                  className="w-full text-sm px-3 py-2 border border-(--rs-neutral-grey-200) rounded-md bg-white focus:outline-none focus:border-(--rs-primary-400)"
                />
              </Field>

              <Field label="Identifier (optional)" htmlFor="np-identifier">
                <input
                  id="np-identifier"
                  value={identifier}
                  onChange={e => setIdentifier(e.target.value.toUpperCase().slice(0, 8))}
                  placeholder="Auto-generated from name if left blank"
                  aria-describedby="np-identifier-hint"
                  className="w-full text-sm px-3 py-2 border border-(--rs-neutral-grey-200) rounded-md bg-white focus:outline-none focus:border-(--rs-primary-400) font-mono"
                />
                <p id="np-identifier-hint" className="sr-only">
                  Short uppercase code, max 8 characters. Auto-generated from the name if blank.
                </p>
              </Field>

              <Field label="Description (optional)" htmlFor="np-description">
                <textarea
                  id="np-description"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  rows={3}
                  className="w-full text-sm px-3 py-2 border border-(--rs-neutral-grey-200) rounded-md bg-white focus:outline-none focus:border-(--rs-primary-400) resize-y"
                />
              </Field>

              <Field label="Team" htmlFor="np-team">
                {canChooseTeam ? (
                  <select
                    id="np-team"
                    aria-label="Project team"
                    value={team}
                    onChange={e => setTeam(e.target.value)}
                    className="w-full text-sm px-3 py-2 border border-(--rs-neutral-grey-200) rounded-md bg-white focus:outline-none focus:border-(--rs-primary-400)"
                  >
                    <option value="">Cross-team (no team tag)</option>
                    {teamOptions.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                ) : (
                  <div
                    id="np-team"
                    role="textbox"
                    aria-readonly="true"
                    aria-label="Project team (locked to your team)"
                    className="text-sm px-3 py-2 border border-(--rs-neutral-grey-100) rounded-md bg-(--rs-neutral-grey-50) text-(--rs-neutral-grey-600)"
                  >
                    {defaultTeam ?? '(no team)'}
                  </div>
                )}
                {!canChooseTeam && (
                  <p className="text-[11px] text-(--rs-neutral-grey-400) mt-1">
                    Auto-set to your team. Your team lead can change it later.
                  </p>
                )}
              </Field>
            </div>

            {error && (
              <div
                role="alert"
                aria-live="polite"
                className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2"
              >
                {error}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={busy}
                className="text-sm text-(--rs-neutral-grey-600) hover:text-(--rs-neutral-grey-900) px-3 py-1.5"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy || !name.trim()}
                className="flex items-center gap-1.5 text-sm font-medium text-white px-3 py-1.5 rounded-md disabled:opacity-50"
                style={{ background: 'var(--rs-primary-500)' }}
              >
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                Create
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

function Field({
  label,
  htmlFor,
  required = false,
  children,
}: {
  label: string;
  htmlFor?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="block text-xs font-medium text-(--rs-neutral-grey-500) mb-1"
      >
        {label}{required && <span aria-hidden="true" className="text-red-500"> *</span>}
      </label>
      {children}
    </div>
  );
}

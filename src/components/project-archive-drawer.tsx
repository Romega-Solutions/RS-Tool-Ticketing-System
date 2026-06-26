'use client';

import { useCallback, useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Archive, RotateCcw, Loader2, Inbox } from 'lucide-react';

type ArchivedItem = {
  id: string;
  sequence_id: number;
  name: string;
  priority: string;
  state_name: string;
  archived_at: string | null;
};

// Dot color by priority — mirrors the board's priority language.
const PRIORITY_DOT: Record<string, string> = {
  urgent: 'var(--rs-accent-600)',
  high:   'var(--rs-accent-500)',
  medium: 'var(--rs-primary-400)',
  low:    'var(--rs-neutral-grey-400)',
  none:   'var(--rs-neutral-grey-300)',
};

function relativeTime(iso: string | null): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const min = Math.round((Date.now() - then) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.round(hr / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

export function ProjectArchiveDrawer({
  open,
  onClose,
  projectId,
  canRestore,
  onOpenItem,
  onRestored,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  canRestore: boolean;
  onOpenItem: (id: string) => void;
  onRestored: () => void;
}) {
  const [items, setItems] = useState<ArchivedItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/tickets/projects/${projectId}/archived`, { cache: 'no-store' });
      if (!res.ok) throw new Error('Could not load the archive.');
      setItems((await res.json()) as ArchivedItem[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load.');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  // (Re)fetch each time the drawer opens. Defer out of the synchronous effect
  // body so the initial setState in load() doesn't trigger a cascading render.
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(t);
  }, [open, load]);

  async function restore(id: string) {
    setRestoringId(id);
    try {
      const res = await fetch(`/api/tickets/work-items/${id}/restore`, { method: 'POST' });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? 'Restore failed.');
      }
      setItems(prev => prev.filter(i => i.id !== id));
      onRestored(); // let the board pull the task back into its column
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Restore failed.');
    } finally {
      setRestoringId(null);
    }
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full max-w-md flex flex-col gap-0 p-0">
        <SheetHeader className="border-b border-(--rs-neutral-grey-100) px-5 py-4">
          <div className="flex items-center gap-2">
            <Archive className="h-4 w-4 text-(--rs-neutral-grey-500)" aria-hidden="true" />
            <SheetTitle className="text-base font-serif text-(--rs-neutral-grey-900)">
              Archived tasks
            </SheetTitle>
            {!loading && (
              <span className="rounded-full bg-(--rs-neutral-grey-100) px-2 py-0.5 text-xs font-semibold text-(--rs-neutral-grey-600)">
                {items.length}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-(--rs-neutral-grey-500)">
            Completed work that was cleared from the board. Restore anything to send it back to its column.
          </p>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-3 py-3">
          {loading && (
            <div className="flex items-center gap-2 px-2 py-6 text-sm text-(--rs-neutral-grey-500)">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading archive…
            </div>
          )}

          {error && (
            <div role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {!loading && !error && items.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 px-4 py-14 text-center">
              <Inbox className="h-7 w-7 text-(--rs-neutral-grey-300)" aria-hidden="true" />
              <p className="text-sm text-(--rs-neutral-grey-400)">Nothing archived yet.</p>
            </div>
          )}

          {!loading && items.length > 0 && (
            <ul className="space-y-1.5">
              {items.map(it => (
                <li
                  key={it.id}
                  className="group flex items-center gap-3 rounded-lg border border-(--rs-neutral-grey-100) bg-white p-2.5 transition-colors hover:border-(--rs-neutral-grey-200) hover:bg-(--rs-neutral-grey-50)"
                >
                  <button
                    type="button"
                    onClick={() => { onOpenItem(it.id); onClose(); }}
                    className="flex min-w-0 flex-1 items-center gap-2.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-(--rs-primary-400) rounded-md cursor-pointer"
                  >
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: PRIORITY_DOT[it.priority] ?? PRIORITY_DOT.none }}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-(--rs-neutral-grey-900)">
                        {it.name}
                      </span>
                      <span className="mt-0.5 flex items-center gap-2 text-[11px] text-(--rs-neutral-grey-400)">
                        <span className="font-mono">#{it.sequence_id}</span>
                        {it.state_name && <span className="truncate">· {it.state_name}</span>}
                        {it.archived_at && <span>· {relativeTime(it.archived_at)}</span>}
                      </span>
                    </span>
                  </button>

                  {canRestore && (
                    <button
                      type="button"
                      onClick={() => restore(it.id)}
                      disabled={restoringId === it.id}
                      aria-label={`Restore ${it.name}`}
                      className="flex min-h-9 shrink-0 items-center gap-1 rounded-md border border-(--rs-neutral-grey-200) px-2.5 py-1.5 text-xs font-medium text-(--rs-neutral-grey-600) transition-colors hover:border-(--rs-primary-300) hover:bg-(--rs-primary-50) hover:text-(--rs-primary-700) focus:outline-none focus-visible:ring-2 focus-visible:ring-(--rs-primary-400) disabled:opacity-50 cursor-pointer"
                    >
                      {restoringId === it.id
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <RotateCcw className="h-3.5 w-3.5" />}
                      Restore
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

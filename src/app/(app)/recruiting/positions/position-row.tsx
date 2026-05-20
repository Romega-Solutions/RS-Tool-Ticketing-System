'use client';

import { useTransition } from 'react';
import { Trash2 } from 'lucide-react';
import { updatePositionStatus, deletePosition } from './actions';

export function PositionStatusToggle({ id, isOpen }: { id: number; isOpen: boolean }) {
  const [isPending, start] = useTransition();
  const value = isOpen ? 'open' : 'closed';
  return (
    <select
      defaultValue={value}
      disabled={isPending}
      onChange={(e) => {
        const next = e.target.value === 'open';
        start(async () => {
          try { await updatePositionStatus(id, next); }
          catch (err) { console.error(err); alert(err instanceof Error ? err.message : 'Update failed'); }
        });
      }}
      className={`rounded-full px-3 py-1 text-xs font-semibold border-0 cursor-pointer ${
        isOpen ? 'bg-green-100 text-green-700' : 'bg-(--rs-neutral-grey-100) text-(--rs-neutral-grey-600)'
      }`}
    >
      <option value="open">Open</option>
      <option value="closed">Closed</option>
    </select>
  );
}

export function PositionDelete({ id }: { id: number }) {
  const [isPending, start] = useTransition();
  return (
    <button
      type="button"
      aria-label="Delete position"
      disabled={isPending}
      onClick={() => {
        if (!confirm('Delete this position? This cannot be undone.')) return;
        start(async () => {
          try { await deletePosition(id); }
          catch (err) { console.error(err); alert(err instanceof Error ? err.message : 'Delete failed'); }
        });
      }}
      className="rounded-md p-1.5 text-(--rs-neutral-grey-400) hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-50"
    >
      <Trash2 className="w-3.5 h-3.5" />
    </button>
  );
}

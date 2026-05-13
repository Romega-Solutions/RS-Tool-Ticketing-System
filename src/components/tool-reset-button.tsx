'use client';

import { useState, useTransition } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

type ResetResult = { ok: true; deleted: number };

export function ToolResetButton({
  label,
  description,
  confirmationText,
  action,
}: {
  label: string;
  description: string;
  confirmationText: string;
  action: (confirmation: string) => Promise<ResetResult>;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const dialog = open ? (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 px-4 backdrop-blur-xs animate-fade-in">
      <div className="w-full max-w-lg rounded-2xl border border-red-200 bg-white p-5 shadow-2xl animate-lead-card md:p-6">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-full bg-red-50 p-2 text-red-700">
            <AlertTriangle className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold text-(--rs-neutral-grey-900)">Delete Supabase data</p>
            <p className="mt-1 text-sm leading-relaxed text-(--rs-neutral-grey-600)">{description}</p>
            <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-red-700">
              Type <span className="rounded bg-red-50 px-1.5 py-0.5 normal-case tracking-normal">{confirmationText}</span> to confirm
            </p>
            <input
              value={value}
              onChange={e => setValue(e.target.value)}
              placeholder={confirmationText}
              className="mt-2 w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-sm text-(--rs-neutral-grey-900) outline-none transition-colors focus:border-red-300 focus:ring-3 focus:ring-red-100"
            />

            {error && <p className="mt-2 text-sm text-red-600 animate-slide-up">{error}</p>}
            {message && <p className="mt-2 text-sm text-(--rs-primary-700) animate-slide-up">{message}</p>}

            <div className="mt-5 flex items-center justify-end gap-2 border-t border-red-100 pt-4">
              <Button type="button" variant="ghost" onClick={() => {
                setOpen(false);
                setValue('');
                setError(null);
              }}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={isPending || value !== confirmationText}
                onClick={() => {
                  setError(null);
                  setMessage(null);
                  startTransition(async () => {
                    try {
                      const result = await action(value);
                      setMessage(`Deleted ${result.deleted} record${result.deleted === 1 ? '' : 's'}.`);
                      setValue('');
                      setOpen(false);
                    } catch (err) {
                      setError(err instanceof Error ? err.message : 'Delete failed');
                    }
                  });
                }}
              >
                {isPending ? 'Deleting…' : 'Delete data'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <div className="flex flex-col items-end gap-2">
      <Button type="button" variant="outline" className="gap-2 text-red-700 hover:bg-red-50 hover:text-red-800" onClick={() => {
        setOpen(true);
        setError(null);
        setMessage(null);
      }}>
        <Trash2 className="h-4 w-4" />
        {label}
      </Button>

      {dialog && typeof document !== 'undefined' ? createPortal(dialog, document.body) : null}
    </div>
  );
}

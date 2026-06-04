'use client';

import { useState, useTransition } from 'react';
import { Pencil, Building2, MapPin, AlertCircle, Briefcase } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PositionFields } from './position-fields';
import { PositionStatusToggle, PositionDelete } from './position-row';
import { CopyApplicationLinkButton } from './copy-link-button';
import { updatePosition } from './actions';

export type Position = {
  id:              number;
  job_title:       string;
  client:          string | null;
  location:        string | null;
  job_description: string | null;
  is_open:         boolean;
  created_at:      string;
};

function formatDate(iso: string) {
  try { return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }); }
  catch { return iso; }
}

export function PositionTableRow({ position }: { position: Position }) {
  const [editOpen, setEditOpen]  = useState(false);
  const [isPending, start]       = useTransition();
  const [errorMsg, setErrorMsg]  = useState<string | null>(null);

  async function onSubmit(formData: FormData) {
    setErrorMsg(null);
    start(async () => {
      try {
        await updatePosition(position.id, formData);
        setEditOpen(false);
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Failed to update position');
      }
    });
  }

  return (
    <tr className="hover:bg-(--rs-neutral-grey-50) transition-colors">
      <td className="px-6 py-3.5">
        {/* Clickable title — one of two ways HR can open the edit dialog. */}
        <button
          type="button"
          onClick={() => setEditOpen(true)}
          className="text-left font-medium text-(--rs-neutral-grey-900) hover:text-(--rs-primary-600) hover:underline underline-offset-2 cursor-pointer"
        >
          {position.job_title}
        </button>
        {position.job_description && (
          <div className="text-xs text-(--rs-neutral-grey-500) mt-0.5 line-clamp-1 max-w-md">
            {position.job_description}
          </div>
        )}
      </td>
      <td className="px-4 py-3.5 text-(--rs-neutral-grey-700)">
        {position.client ? (
          <span className="inline-flex items-center gap-1.5">
            <Building2 className="w-3 h-3 text-(--rs-neutral-grey-400)" />
            {position.client}
          </span>
        ) : '—'}
      </td>
      <td className="px-4 py-3.5 text-(--rs-neutral-grey-700)">
        {position.location ? (
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="w-3 h-3 text-(--rs-neutral-grey-400)" />
            {position.location}
          </span>
        ) : '—'}
      </td>
      <td className="px-4 py-3.5 text-(--rs-neutral-grey-500) whitespace-nowrap">{formatDate(position.created_at)}</td>
      <td className="px-4 py-3.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <PositionStatusToggle id={position.id} isOpen={position.is_open} />
          {position.is_open && <CopyApplicationLinkButton positionId={position.id} />}
        </div>
      </td>
      <td className="px-4 py-3.5">
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            aria-label="Edit position"
            onClick={() => setEditOpen(true)}
            className="rounded-md p-1.5 text-(--rs-neutral-grey-400) hover:bg-(--rs-primary-50) hover:text-(--rs-primary-600) transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <PositionDelete id={position.id} />
        </div>
      </td>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <div className="inline-flex items-center gap-2 w-fit px-2.5 py-1 rounded-full bg-(--rs-primary-50) text-(--rs-primary-700) text-[10px] font-bold uppercase tracking-wider mb-1">
              <Briefcase className="w-3 h-3" /> Edit role
            </div>
            <DialogTitle>Edit position</DialogTitle>
            <DialogDescription>
              Update this role&apos;s details. The application link and any linked candidates stay the same.
            </DialogDescription>
          </DialogHeader>

          <form action={onSubmit} className="space-y-5">
            <PositionFields defaults={position} />

            {errorMsg && (
              <div className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)} disabled={isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending} className="gap-2">
                {isPending ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Saving…
                  </>
                ) : 'Save changes'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </tr>
  );
}

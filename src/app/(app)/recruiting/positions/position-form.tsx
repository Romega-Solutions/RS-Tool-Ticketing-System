'use client';

import { useState, useTransition } from 'react';
import { Plus, Briefcase, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { PositionFields } from './position-fields';
import { createPosition } from './actions';

export function PositionForm() {
  const [open, setOpen]         = useState(false);
  const [isPending, start]      = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function onSubmit(formData: FormData) {
    setErrorMsg(null);
    start(async () => {
      try {
        await createPosition(formData);
        setOpen(false);
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Failed to create position');
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button className="gap-2" />}>
        <Plus className="w-4 h-4" /> Add position
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="inline-flex items-center gap-2 w-fit px-2.5 py-1 rounded-full bg-(--rs-primary-50) text-(--rs-primary-700) text-[10px] font-bold uppercase tracking-wider mb-1">
            <Briefcase className="w-3 h-3" /> Open role
          </div>
          <DialogTitle>Add a new position</DialogTitle>
          <DialogDescription>
            Track open roles inside the ATS. Candidates can be linked to a position from
            the Candidates tab.
          </DialogDescription>
        </DialogHeader>

        <form action={onSubmit} className="space-y-5">
          <PositionFields />

          {errorMsg && (
            <div className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
              Discard
            </Button>
            <Button type="submit" disabled={isPending} className="gap-2">
              {isPending ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Saving…
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" /> Save position
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

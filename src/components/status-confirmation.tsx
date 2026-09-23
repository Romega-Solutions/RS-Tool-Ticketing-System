'use client';

import { useState, useTransition, type ReactNode } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export function StatusConfirmation({ status, label, onConfirm, children, hiring = false }: {
  status: string;
  label: (status: string) => string;
  onConfirm: (status: string) => Promise<unknown>;
  children: (select: (status: string) => void, pending: boolean) => ReactNode;
  hiring?: boolean;
}) {
  const [next, setNext] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return <>
    {children(value => {
      if (value === status) return;
      setError(null);
      setNext(value);
    }, pending)}
    <Dialog open={next !== null} onOpenChange={open => { if (!open && !pending) setNext(null); }}>
      <DialogContent showCloseButton={!pending}>
        <DialogHeader>
          <DialogTitle>Confirm status change</DialogTitle>
          <DialogDescription>
            Change status from “{label(status)}” to “{next ? label(next) : ''}”?
            {hiring && next === 'hired'
              ? ' This will also attempt to create an onboarding record.'
              : ' This may trigger an automated email.'}
          </DialogDescription>
        </DialogHeader>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={() => setNext(null)}>Cancel</Button>
          <Button type="button" disabled={pending} onClick={() => {
            if (!next) return;
            setError(null);
            start(async () => {
              try { await onConfirm(next); setNext(null); }
              catch (err) { setError(err instanceof Error ? err.message : 'Could not update status'); }
            });
          }}>{pending ? 'Saving…' : 'Confirm change'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}

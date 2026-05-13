'use client';

import { useState, useTransition } from 'react';
import { Plus, X, UserPlus2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createCandidate } from './actions';

const SOURCES = [
  { value: '',           label: '— Select source —' },
  { value: 'referral',   label: 'Referral' },
  { value: 'linkedin',   label: 'LinkedIn' },
  { value: 'job_board',  label: 'Job board' },
  { value: 'direct',     label: 'Direct (website)' },
  { value: 'manual',     label: 'Manually added' },
];

export function CandidateForm() {
  const [open, setOpen]         = useState(false);
  const [isPending, start]      = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function onSubmit(formData: FormData) {
    setErrorMsg(null);
    start(async () => {
      try {
        await createCandidate(formData);
        setOpen(false);
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Failed to create candidate');
      }
    });
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} className="gap-2">
        <UserPlus2 className="w-4 h-4" /> Add candidate
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center bg-black/40 p-4 overflow-y-auto">
      <form
        action={onSubmit}
        className="mt-12 w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl space-y-5 animate-fade-in"
      >
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-serif text-xl font-bold text-(--rs-neutral-grey-900)">Add a new candidate</h3>
            <p className="text-xs text-(--rs-neutral-grey-500) mt-0.5">
              Starts in <strong>Applied</strong>. You can move them through the pipeline after.
            </p>
          </div>
          <button
            type="button"
            onClick={() => { setOpen(false); setErrorMsg(null); }}
            className="rounded-md p-1 text-(--rs-neutral-grey-500) hover:bg-(--rs-neutral-grey-100)"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="fullName">Full name *</Label>
            <Input id="fullName" name="fullName" required placeholder="Juan Dela Cruz" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="position">Position applied for</Label>
            <Input id="position" name="position" placeholder="Frontend Developer" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" placeholder="juan@example.com" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" name="phone" placeholder="+63 917 555 1234" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="linkedinUrl">LinkedIn URL</Label>
            <Input id="linkedinUrl" name="linkedinUrl" type="url" placeholder="https://linkedin.com/in/…" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="source">Source</Label>
            <select
              id="source"
              name="source"
              defaultValue=""
              className="flex h-10 w-full rounded-md border border-(--rs-neutral-grey-300) bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-(--rs-primary-500)"
            >
              {SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="notes">Notes</Label>
          <textarea
            id="notes"
            name="notes"
            rows={3}
            placeholder="Initial impressions, what stood out from their resume…"
            className="flex w-full rounded-md border border-(--rs-neutral-grey-300) bg-white px-3 py-2 text-sm placeholder:text-(--rs-neutral-grey-400) focus:outline-none focus:ring-2 focus:ring-(--rs-primary-500)"
          />
        </div>

        {errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button type="submit" disabled={isPending} className="gap-2">
            <Plus className="w-4 h-4" /> {isPending ? 'Saving…' : 'Save candidate'}
          </Button>
        </div>
      </form>
    </div>
  );
}

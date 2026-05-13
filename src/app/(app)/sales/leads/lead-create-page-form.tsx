'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { ArrowLeft, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createLead } from './actions';

export function LeadCreatePageForm() {
  const router = useRouter();
  const [isPending, start] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function onSubmit(formData: FormData) {
    setErrorMsg(null);
    start(async () => {
      try {
        await createLead(formData);
        router.push('/sales/leads');
        router.refresh();
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Failed to create lead');
      }
    });
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-14rem)] max-w-3xl items-center justify-center">
      <div className="w-full rounded-3xl border border-(--rs-neutral-grey-200) bg-white shadow-2xl animate-lead-card">
        <form action={onSubmit} className="space-y-6 p-6 md:p-8">
          <div className="flex flex-col gap-4 border-b border-(--rs-neutral-grey-100) pb-5 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-(--rs-primary-50) px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-(--rs-primary-700)">
                <Plus className="h-3.5 w-3.5" />
                Sales Lead
              </div>
              <h1 className="mt-3 font-serif text-2xl font-bold text-(--rs-neutral-grey-900)">Add a new lead</h1>
              <p className="mt-1 max-w-xl text-sm text-(--rs-neutral-grey-500)">
                Capture the contact, estimated value, and context before moving it through the pipeline.
              </p>
            </div>
            <Link
              href="/sales/leads"
              className="inline-flex h-8 items-center justify-center gap-2 rounded-lg border border-(--rs-neutral-grey-200) bg-white px-3 text-sm font-medium text-(--rs-neutral-grey-700) transition-colors hover:bg-(--rs-neutral-grey-50)"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to leads
            </Link>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="name">Name *</Label>
              <Input id="name" name="name" required placeholder="Jane Doe" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="company">Company</Label>
              <Input id="company" name="company" placeholder="Acme Inc." />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" placeholder="jane@acme.com" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="value">Estimated value (PHP)</Label>
              <Input id="value" name="value" type="number" min="0" step="1000" placeholder="50000" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <textarea
              id="notes"
              name="notes"
              rows={5}
              placeholder="Where they came from, their pain point, next step, or anything useful…"
              className="flex w-full rounded-2xl border border-(--rs-neutral-grey-300) bg-white px-3 py-3 text-sm placeholder:text-(--rs-neutral-grey-400) focus:outline-none focus:ring-2 focus:ring-(--rs-primary-500)"
            />
          </div>

          {errorMsg && <p className="text-sm text-red-600 animate-slide-up">{errorMsg}</p>}

          <div className="flex items-center justify-end gap-2 border-t border-(--rs-neutral-grey-100) pt-5">
            <Link
              href="/sales/leads"
              aria-disabled={isPending}
              className={`inline-flex h-8 items-center justify-center rounded-lg border border-(--rs-neutral-grey-200) bg-white px-3 text-sm font-medium text-(--rs-neutral-grey-700) transition-colors hover:bg-(--rs-neutral-grey-50) ${isPending ? 'pointer-events-none opacity-50' : ''}`}
            >
              Cancel
            </Link>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Saving…' : 'Save lead'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

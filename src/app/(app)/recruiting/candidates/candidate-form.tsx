'use client';

import { useState, useTransition } from 'react';
import { Plus, UserPlus2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button className="gap-2">
            <UserPlus2 className="w-4 h-4" /> Add candidate
          </Button>
        }
      />
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="inline-flex items-center gap-2 w-fit px-2.5 py-1 rounded-full bg-(--rs-primary-50) text-(--rs-primary-700) text-[10px] font-bold uppercase tracking-wider mb-1">
            <UserPlus2 className="w-3 h-3" /> Manual entry
          </div>
          <DialogTitle>Add a new candidate</DialogTitle>
          <DialogDescription>
            Enter candidate details manually. They will be added to the <strong>Applied</strong> stage.
          </DialogDescription>
        </DialogHeader>

        <form action={onSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="fullName" className="text-(--rs-neutral-grey-700) font-medium">Full name *</Label>
              <Input id="fullName" name="fullName" required placeholder="Juan Dela Cruz" className="h-11 rounded-xl border-(--rs-neutral-grey-200) focus:border-(--rs-primary-300) focus:ring-4 focus:ring-(--rs-primary-100)" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="position" className="text-(--rs-neutral-grey-700) font-medium">Position applied for</Label>
              <Input id="position" name="position" placeholder="Frontend Developer" className="h-11 rounded-xl border-(--rs-neutral-grey-200) focus:border-(--rs-primary-300) focus:ring-4 focus:ring-(--rs-primary-100)" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-(--rs-neutral-grey-700) font-medium">Email address</Label>
              <Input id="email" name="email" type="email" placeholder="juan@example.com" className="h-11 rounded-xl border-(--rs-neutral-grey-200) focus:border-(--rs-primary-300) focus:ring-4 focus:ring-(--rs-primary-100)" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone" className="text-(--rs-neutral-grey-700) font-medium">Phone number</Label>
              <Input id="phone" name="phone" placeholder="+63 917 555 1234" className="h-11 rounded-xl border-(--rs-neutral-grey-200) focus:border-(--rs-primary-300) focus:ring-4 focus:ring-(--rs-primary-100)" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="linkedinUrl" className="text-(--rs-neutral-grey-700) font-medium">LinkedIn profile</Label>
              <Input id="linkedinUrl" name="linkedinUrl" type="url" placeholder="https://linkedin.com/in/…" className="h-11 rounded-xl border-(--rs-neutral-grey-200) focus:border-(--rs-primary-300) focus:ring-4 focus:ring-(--rs-primary-100)" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="source" className="text-(--rs-neutral-grey-700) font-medium">Candidate source</Label>
              <select
                id="source"
                name="source"
                defaultValue=""
                className="flex h-11 w-full rounded-xl border border-(--rs-neutral-grey-200) bg-white px-3 py-2 text-sm outline-none transition-all focus:border-(--rs-primary-300) focus:ring-4 focus:ring-(--rs-primary-100)"
              >
                {SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes" className="text-(--rs-neutral-grey-700) font-medium">Internal notes</Label>
            <textarea
              id="notes"
              name="notes"
              rows={4}
              placeholder="Initial impressions, what stood out from their profile, why they might be a good fit…"
              className="flex w-full rounded-xl border border-(--rs-neutral-grey-200) bg-white px-4 py-3 text-sm placeholder:text-(--rs-neutral-grey-400) outline-none transition-all focus:border-(--rs-primary-300) focus:ring-4 focus:ring-(--rs-primary-100)"
            />
          </div>

          {errorMsg && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              <Plus className="w-4 h-4 rotate-45" /> {errorMsg}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isPending}
              className="h-11 px-6 rounded-xl border-(--rs-neutral-grey-200) hover:bg-(--rs-neutral-grey-50)"
            >
              Discard
            </Button>
            <Button
              type="submit"
              disabled={isPending}
              className="h-11 px-8 rounded-xl bg-(--rs-primary-600) hover:bg-(--rs-primary-700) shadow-lg shadow-(--rs-primary-100) gap-2 transition-all active:scale-[0.98]"
            >
              {isPending ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                  Saving…
                </span>
              ) : (
                <>
                  <Plus className="w-4 h-4" /> Save candidate
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

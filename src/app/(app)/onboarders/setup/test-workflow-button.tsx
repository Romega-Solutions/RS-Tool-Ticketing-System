'use client';

import { useState, useTransition } from 'react';
import { Send, ChevronDown, AlertCircle, CheckCircle2, Sparkles } from 'lucide-react';
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
import { triggerTestWorkflow } from '../actions';

type Result = { ok: true; message: string } | { ok: false; error: string };

export function TestWorkflowButton({
  template,
  label,
  configured,
}: {
  template:   string;
  label:      string;
  configured: boolean;
}) {
  const [open, setOpen]        = useState(false);
  const [isPending, start]     = useTransition();
  const [result, setResult]    = useState<Result | null>(null);
  const [email, setEmail]      = useState('');
  const [type, setType]        = useState<'contractor' | 'intern'>('contractor');

  const isWelcome = template === 'welcome';

  function onSubmit() {
    setResult(null);
    start(async () => {
      try {
        const r = await triggerTestWorkflow({
          template,
          recipientEmail: email,
          onboarderType:  isWelcome ? type : undefined,
        });
        setResult(r);
      } catch (err) {
        setResult({ ok: false, error: err instanceof Error ? err.message : 'Network error' });
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setResult(null); }}>
      <DialogTrigger render={
        <button
          type="button"
          disabled={!configured}
          title={configured ? `Send a test ${label} email` : 'Set the env var first to enable testing'}
          className="inline-flex items-center gap-1.5 rounded-lg border border-(--rs-primary-200) bg-(--rs-primary-50) px-2.5 py-1 text-[11px] font-semibold text-(--rs-primary-800) hover:bg-(--rs-primary-100) transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          <Send className="w-3 h-3" /> Test
        </button>
      } />
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="inline-flex items-center gap-2 w-fit px-2.5 py-1 rounded-full bg-(--rs-accent-50) text-(--rs-accent-700) text-[10px] font-bold uppercase tracking-wider mb-1">
            <Sparkles className="w-3 h-3" /> Workflow test
          </div>
          <DialogTitle>Send test: {label}</DialogTitle>
          <DialogDescription>
            Fires the n8n workflow with a synthetic payload. The recipient will receive a real email — use your own inbox.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="recipientEmail" className="text-(--rs-neutral-grey-700) font-medium">Recipient email *</Label>
            <Input
              id="recipientEmail"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@romega-solutions.com"
              className="h-11 rounded-xl border-(--rs-neutral-grey-200) focus:border-(--rs-primary-300) focus:ring-4 focus:ring-(--rs-primary-100)"
            />
          </div>

          {isWelcome && (
            <div className="space-y-1.5">
              <Label htmlFor="onboarderType" className="text-(--rs-neutral-grey-700) font-medium">Test as</Label>
              <div className="relative">
                <select
                  id="onboarderType"
                  value={type}
                  onChange={(e) => setType(e.target.value as 'contractor' | 'intern')}
                  className="appearance-none flex h-11 w-full rounded-xl border border-(--rs-neutral-grey-200) bg-white pl-3 pr-9 py-2 text-sm text-(--rs-neutral-grey-900) outline-none transition-all focus:border-(--rs-primary-300) focus:ring-4 focus:ring-(--rs-primary-100) cursor-pointer"
                >
                  <option value="contractor" style={{ backgroundColor: '#fff', color: '#0f172a' }}>Independent contractor</option>
                  <option value="intern"     style={{ backgroundColor: '#fff', color: '#0f172a' }}>Intern</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-(--rs-neutral-grey-400)" />
              </div>
            </div>
          )}

          {result && (
            <div className={
              result.ok
                ? 'flex items-start gap-2 rounded-lg border border-green-100 bg-green-50 p-3 text-sm text-green-800'
                : 'flex items-start gap-2 rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-800'
            }>
              {result.ok
                ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                : <AlertCircle  className="w-4 h-4 mt-0.5 shrink-0" />}
              <span>{result.ok ? result.message : result.error}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isPending}
            className="h-10 px-5 rounded-xl border-(--rs-neutral-grey-200) hover:bg-(--rs-neutral-grey-50)"
          >
            Close
          </Button>
          <Button
            type="button"
            onClick={onSubmit}
            disabled={isPending || !email}
            className="h-10 px-5 rounded-xl bg-(--rs-primary-600) hover:bg-(--rs-primary-700) gap-2"
          >
            {isPending
              ? <span className="flex items-center gap-2"><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" /> Sending…</span>
              : <><Send className="w-4 h-4" /> Send test</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

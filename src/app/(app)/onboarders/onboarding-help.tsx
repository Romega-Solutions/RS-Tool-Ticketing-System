'use client';

import { useState } from 'react';
import { HelpCircle, Zap, Send, Hand, Clock } from 'lucide-react';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

// "How this works" explainer for the Internal Onboarding board.
//
// Single source of truth for the human-facing description of the flow. The
// auto/you-send split below mirrors the real wiring in
// `onboarders/actions.ts` (updateOnboarderStatus) and `lib/n8n.ts` — keep it
// honest: only the four ⚡ lines actually fire on their own; everything under
// "You send" is a button a lead clicks; the two ⏳ notes are configured in
// n8n but not scheduled yet, so they stay manual for now.

type Step = {
  n:     number;
  stage: string;
  pill:  string;          // reuse the kanban STATUS_COLOR pill for continuity
  you:   string;
  auto?: string;          // ⚡ fires automatically on stage entry
  send?: string[];        // ✋ manual "Send" buttons available at this stage
  note?: string;          // neutral aside (no email, or not-yet-live)
};

const STEPS: Step[] = [
  {
    n: 1,
    stage: 'Offer signed',
    pill: 'bg-slate-100 text-slate-700',
    you: 'Create the record, then mark the SOW sent and signed.',
    note: 'No email here — the SOW itself is handled out-of-band.',
  },
  {
    n: 2,
    stage: 'Background check',
    pill: 'bg-amber-100 text-amber-800',
    you: 'Add the referees and prior-employer contacts.',
    auto: 'The background-check request email goes out the moment a card lands here.',
    send: ['Each character-reference request', 'Each employment-verification request'],
  },
  {
    n: 3,
    stage: 'Pre-onboarding',
    pill: 'bg-blue-100 text-blue-700',
    you: 'Confirm role, team, and start date.',
    auto: 'After you assign the Onboarding Lead and Direct Supervisor, confirm the handoff to send the matching welcome email and assign the Friday cohort.',
    send: ['Gmail + signature nudge', 'Group-chat announcement'],
  },
  {
    n: 4,
    stage: 'Day 1',
    pill: 'bg-(--rs-primary-100) text-(--rs-primary-800)',
    you: 'Run the Day-1 setup checklist — accounts, tooling, team intros.',
    note: 'The Day-1 calendar invite isn’t live yet, so schedule it by hand for now.',
  },
  {
    n: 5,
    stage: '30-day check-in',
    pill: 'bg-(--rs-primary-100) text-(--rs-primary-800)',
    you: 'Note how probation is tracking.',
    auto: 'The check-in email fires automatically when you move the card into this stage.',
  },
  {
    n: 6,
    stage: '90-day review → outcome',
    pill: 'bg-(--rs-primary-100) text-(--rs-primary-800)',
    you: 'Decide the outcome and set the closing stage.',
    auto: 'The outcome letter fires automatically the moment you choose Regularized or Failed probation.',
  },
];

export function OnboardingHelpButton() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <button
            type="button"
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-(--rs-neutral-grey-200) bg-white px-4 text-sm font-semibold text-(--rs-neutral-grey-700) transition-colors hover:bg-(--rs-neutral-grey-50)"
          />
        }
      >
        <HelpCircle className="h-4 w-4" /> How this works
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-(--rs-primary-50) text-(--rs-primary-600)">
              <HelpCircle className="h-4 w-4" />
            </span>
            <DialogTitle>How onboarding works</DialogTitle>
          </div>
          <DialogDescription>
            From offer-signed to regularized. Move a card to the right as each stage completes —
            some emails fire on their own, others you send with a button.
          </DialogDescription>
        </DialogHeader>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-(--rs-neutral-grey-600)">
          <span className="inline-flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5 text-(--rs-primary-600)" />
            <strong className="font-semibold text-(--rs-neutral-grey-800)">Automatic</strong> — fires on its own
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Send className="h-3.5 w-3.5 text-(--rs-accent-600)" />
            <strong className="font-semibold text-(--rs-neutral-grey-800)">You send</strong> — a button you click
          </span>
        </div>

        {/* Timeline of stages (single panel — rail + rows, no nested cards) */}
        <ol className="relative ml-1.5 space-y-5 border-l border-(--rs-neutral-grey-200) pl-6">
          {STEPS.map((s) => (
            <li key={s.n} className="relative">
              <span
                aria-hidden
                className="absolute -left-[2.05rem] flex h-6 w-6 items-center justify-center rounded-full border border-(--rs-neutral-grey-200) bg-white text-[11px] font-bold text-(--rs-neutral-grey-700)"
              >
                {s.n}
              </span>

              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${s.pill}`}>
                  {s.stage}
                </span>
              </div>

              <p className="mt-1.5 flex items-start gap-1.5 text-[13px] text-(--rs-neutral-grey-700)">
                <Hand className="mt-0.5 h-3.5 w-3.5 shrink-0 text-(--rs-neutral-grey-400)" />
                <span>{s.you}</span>
              </p>

              {s.auto && (
                <p className="mt-1 flex items-start gap-1.5 text-[13px] text-(--rs-neutral-grey-700)">
                  <Zap className="mt-0.5 h-3.5 w-3.5 shrink-0 text-(--rs-primary-600)" />
                  <span><strong className="font-semibold text-(--rs-primary-700)">Automatic:</strong> {s.auto}</span>
                </p>
              )}

              {s.send && s.send.length > 0 && (
                <p className="mt-1 flex items-start gap-1.5 text-[13px] text-(--rs-neutral-grey-700)">
                  <Send className="mt-0.5 h-3.5 w-3.5 shrink-0 text-(--rs-accent-600)" />
                  <span><strong className="font-semibold text-(--rs-accent-700)">You send:</strong> {s.send.join(' · ')}</span>
                </p>
              )}

              {s.note && (
                <p className="mt-1 text-[12px] italic text-(--rs-neutral-grey-500)">{s.note}</p>
              )}
            </li>
          ))}
        </ol>

        {/* Resolved + not-yet-live footnotes */}
        <div className="space-y-3 border-t border-(--rs-neutral-grey-100) pt-4">
          <p className="text-[12px] text-(--rs-neutral-grey-600)">
            <strong className="font-semibold text-(--rs-neutral-grey-800)">Resolved</strong> covers the closing
            states — <span className="font-medium text-green-700">Regularized</span>,{' '}
            <span className="font-medium text-red-700">Failed probation</span>, and{' '}
            <span className="font-medium text-(--rs-neutral-grey-700)">Withdrew</span>.
          </p>

          <div className="flex items-start gap-2 rounded-xl bg-(--rs-accent-50) px-3 py-2.5 text-[12px] text-(--rs-neutral-grey-700)">
            <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-(--rs-accent-700)" />
            <span>
              <strong className="font-semibold text-(--rs-accent-800)">Not automated yet:</strong> the daily
              SOW-reminder sweep and the Day-1 calendar invite are set up in n8n but not scheduled, so
              chase unsigned SOWs and book Day-1 calendars manually for now.
            </span>
          </div>
        </div>

        <div className="flex justify-end pt-1">
          <DialogClose
            render={
              <button
                type="button"
                className="inline-flex h-10 items-center rounded-xl bg-(--rs-primary-500) px-5 text-sm font-semibold text-white transition-colors hover:bg-(--rs-primary-600)"
              />
            }
          >
            Got it
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}

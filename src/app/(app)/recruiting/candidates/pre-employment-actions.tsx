'use client';

import { useTransition } from 'react';
import { Mail, Send } from 'lucide-react';
import { sendCandidateEmploymentVerificationEmails, sendCandidateReferenceEmails, sendPreEmploymentBgCheckEmail } from './actions';

export function SendPreEmploymentBgCheckButton({ candidateId }: { candidateId: number }) {
  const [isPending, start] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => {
        if (!window.confirm('Send the pre-employment background-check request email now?')) return;
        start(async () => {
          try {
            await sendPreEmploymentBgCheckEmail(candidateId);
          } catch (err) {
            console.error(err);
            alert(err instanceof Error ? err.message : 'Could not send the background-check email');
          }
        });
      }}
      className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-(--rs-primary-600) px-3 text-xs font-semibold text-white transition-colors hover:bg-(--rs-primary-700) disabled:cursor-not-allowed disabled:opacity-50"
    >
      {isPending
        ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
        : <Send className="w-3.5 h-3.5" />}
      {isPending ? 'Sending…' : 'Send BG-check email'}
    </button>
  );
}

export function SendCandidateReferenceEmailsButton({
  candidateId, remainingCount,
}: {
  candidateId: number;
  remainingCount: number;
}) {
  const [isPending, start] = useTransition();
  const label = remainingCount === 3 ? 'Send reference emails' : `Send ${remainingCount} remaining`;

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => {
        if (!window.confirm(`Send the reference-request email to ${remainingCount} character reference${remainingCount === 1 ? '' : 's'} now?`)) return;
        start(async () => {
          try {
            await sendCandidateReferenceEmails(candidateId);
          } catch (err) {
            console.error(err);
            alert(err instanceof Error ? err.message : 'Could not send the reference-request emails');
          }
        });
      }}
      className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-(--rs-primary-600) px-3 text-xs font-semibold text-white transition-colors hover:bg-(--rs-primary-700) disabled:cursor-not-allowed disabled:opacity-50"
    >
      {isPending
        ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
        : <Mail className="w-3.5 h-3.5" />}
      {isPending ? 'Sending…' : label}
    </button>
  );
}

export function SendCandidateEmploymentVerificationEmailsButton({ candidateId, remainingCount }: { candidateId: number; remainingCount: number }) {
  const [isPending, start] = useTransition();
  const label = remainingCount === 1 ? 'Send employment verification' : `Send ${remainingCount} employment verifications`;
  return (
    <button type="button" disabled={isPending} onClick={() => {
      if (!window.confirm(`Send employment-verification request email${remainingCount === 1 ? '' : 's'} now?`)) return;
      start(async () => { try { await sendCandidateEmploymentVerificationEmails(candidateId); } catch (err) { alert(err instanceof Error ? err.message : 'Could not send employment-verification emails'); } });
    }} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-(--rs-primary-600) px-3 text-xs font-semibold text-white transition-colors hover:bg-(--rs-primary-700) disabled:cursor-not-allowed disabled:opacity-50">
      {isPending ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : <Mail className="h-3.5 w-3.5" />}
      {isPending ? 'Sending…' : label}
    </button>
  );
}

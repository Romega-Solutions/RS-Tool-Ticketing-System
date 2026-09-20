'use client';

import { useTransition } from 'react';
import { Mail, Send } from 'lucide-react';
import { sendCandidateFormReminder, sendCandidateEmploymentVerificationEmails, sendCandidateReferenceEmails, sendPreEmploymentBgCheckEmail } from './actions';

export function SendPreEmploymentBgCheckButton({ candidateId, disabled = false, reminder = false }: { candidateId: number; disabled?: boolean; reminder?: boolean }) {
  const [isPending, start] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending || disabled}
      onClick={() => {
        const confirmation = reminder
          ? 'Send the candidate a reminder to complete the form with their character-reference and employment-verification contacts?'
          : 'Send the pre-employment background-check request email now?';
        if (!window.confirm(confirmation)) return;
        start(async () => {
          try {
            if (reminder) await sendCandidateFormReminder(candidateId, 'background_check');
            else await sendPreEmploymentBgCheckEmail(candidateId);
          } catch (err) {
            console.error(err);
            alert(err instanceof Error ? err.message : reminder ? 'Could not remind the candidate' : 'Could not send the background-check email');
          }
        });
      }}
      className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-(--rs-primary-600) px-3 text-xs font-semibold text-white transition-colors hover:bg-(--rs-primary-700) disabled:cursor-not-allowed disabled:opacity-50"
    >
      {isPending
        ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
        : reminder ? <Mail className="w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />}
      {isPending ? 'Sending…' : reminder ? 'Remind candidate' : 'Send BG-check email'}
    </button>
  );
}

export function SendCandidateReferenceEmailsButton({
  candidateId, remainingCount, reminder = false, disabled = false,
}: {
  candidateId: number;
  remainingCount: number;
  reminder?: boolean;
  disabled?: boolean;
}) {
  const [isPending, start] = useTransition();
  const label = reminder ? 'Remind references'
    : remainingCount === 0 || remainingCount === 3 ? 'Send reference emails' : `Send ${remainingCount} remaining`;

  return (
    <button
      type="button"
      disabled={isPending || disabled}
      onClick={() => {
        if (!window.confirm(reminder ? 'Send a reminder to outstanding references using their existing form link?' : `Send the reference-request email to ${remainingCount} character reference${remainingCount === 1 ? '' : 's'} now?`)) return;
        start(async () => {
          try {
            if (reminder) await sendCandidateFormReminder(candidateId, 'reference_check');
            else await sendCandidateReferenceEmails(candidateId);
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

export function SendCandidateEmploymentVerificationEmailsButton({ candidateId, remainingCount, reminder = false, disabled = false }: { candidateId: number; remainingCount: number; reminder?: boolean; disabled?: boolean }) {
  const [isPending, start] = useTransition();
  const label = reminder ? 'Remind employers'
    : remainingCount <= 1 ? 'Send employment verification' : `Send ${remainingCount} employment verifications`;
  return (
    <button type="button" disabled={isPending || disabled} onClick={() => {
      if (!window.confirm(reminder ? 'Send a reminder to outstanding employers using their existing form link?' : `Send employment-verification request email${remainingCount === 1 ? '' : 's'} now?`)) return;
      start(async () => { try { if (reminder) await sendCandidateFormReminder(candidateId, 'employment_verification'); else await sendCandidateEmploymentVerificationEmails(candidateId); } catch (err) { alert(err instanceof Error ? err.message : 'Could not send employment-verification emails'); } });
    }} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-(--rs-primary-600) px-3 text-xs font-semibold text-white transition-colors hover:bg-(--rs-primary-700) disabled:cursor-not-allowed disabled:opacity-50">
      {isPending ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : <Mail className="h-3.5 w-3.5" />}
      {isPending ? 'Sending…' : label}
    </button>
  );
}

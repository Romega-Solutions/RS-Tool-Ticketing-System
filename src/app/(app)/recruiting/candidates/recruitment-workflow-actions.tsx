'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Clock, Send } from 'lucide-react';
import { recruitmentWaitingLabel, type RecruitmentAction } from '@/lib/recruitment-progress';
import { formatReminderSentAt } from '@/lib/format';
import { sendPreEmploymentBgCheckEmail, sendCandidateReferenceEmails, sendCandidateEmploymentVerificationEmails } from './actions';

export function RecruitmentWorkflowActions({ candidateId, actions }: { candidateId: number; actions: RecruitmentAction[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  const buttonClass = 'inline-flex h-7 items-center gap-1 whitespace-nowrap rounded-md bg-(--rs-primary-600) px-2 text-[11px] font-semibold text-white hover:bg-(--rs-primary-700) disabled:opacity-50';
  const visibleActions = actions.filter(action => action.kind !== 'review');
  if (!visibleActions.length) return <span className="text-(--rs-neutral-grey-400)">—</span>;

  return <div className="space-y-2">
    <div className="flex flex-wrap gap-3">
      {visibleActions.map(action => <div key={`${action.group}-${action.kind}`} className="flex flex-col items-start gap-1">
        <span className="text-[11px] text-(--rs-neutral-grey-500)">{action.group}</span>
        {action.kind === 'remind' ? (
          <span className="text-[11px] font-semibold leading-tight text-(--rs-neutral-grey-700)">
            {recruitmentWaitingLabel(action)}
          </span>
        ) : <button type="button" disabled={pending} className={buttonClass} onClick={() => {
          if (!confirm(`${action.label}${action.count ? ` (${action.count} outstanding)` : ''}? This sends email now.`)) return;
          setError('');
          start(async () => {
            try {
              if (action.kind === 'send_background') await sendPreEmploymentBgCheckEmail(candidateId);
              else if (action.kind === 'send_references') await sendCandidateReferenceEmails(candidateId);
              else if (action.kind === 'send_verifications') await sendCandidateEmploymentVerificationEmails(candidateId);
            } catch (err) { setError(err instanceof Error ? err.message : 'Could not complete action'); }
            finally { router.refresh(); }
          });
        }}><Send className="h-3.5 w-3.5" />{pending ? 'Sending…' : action.label}</button>}
        {action.lastSentAt && <span className="inline-flex items-center gap-1 whitespace-nowrap text-[10px] text-(--rs-neutral-grey-500)">
          <Clock className="h-3 w-3" />Last sent {formatReminderSentAt(action.lastSentAt)}
        </span>}
      </div>)}
    </div>
    {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
  </div>;
}

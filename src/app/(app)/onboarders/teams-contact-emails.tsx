'use client';

import { useState, useTransition } from 'react';
import { MailCheck, Save } from 'lucide-react';
import { updateOnboardingTeamsEmails } from './actions';

export function TeamsContactEmails({
  onboarderId,
  leadUserId,
  leadName,
  supervisorUserId,
  supervisorName,
  onboardingLeadTeamsEmail,
  directSupervisorTeamsEmail,
}: {
  onboarderId: number;
  leadUserId: number | null;
  leadName: string | null;
  supervisorUserId: number | null;
  supervisorName: string | null;
  onboardingLeadTeamsEmail: string | null;
  directSupervisorTeamsEmail: string | null;
}) {
  const [leadEmail, setLeadEmail] = useState(onboardingLeadTeamsEmail ?? '');
  const [supervisorEmail, setSupervisorEmail] = useState(directSupervisorTeamsEmail ?? '');
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const sameUser = leadUserId !== null && leadUserId === supervisorUserId;

  function save() {
    setMessage(null);
    startTransition(async () => {
      try {
        await updateOnboardingTeamsEmails(onboarderId, {
          onboardingLeadTeamsEmail: leadEmail,
          directSupervisorTeamsEmail: supervisorEmail,
        });
        setMessage('Teams emails saved to the user profiles');
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Could not save Teams emails');
      }
    });
  }

  return (
    <div className="mt-3 space-y-2.5 border-t border-(--rs-neutral-grey-100) pt-3">
      <div className="flex items-center gap-1.5">
        <MailCheck className="h-3.5 w-3.5 text-(--rs-primary-600)" />
        <h4 className="text-[10px] font-bold uppercase tracking-widest text-(--rs-neutral-grey-500)">Microsoft Teams contact emails</h4>
      </div>
      <p className="text-[10px] leading-4 text-(--rs-neutral-grey-500)">
        Saved once per user and reused for every onboarding record.
      </p>
      <label className="block space-y-1 text-[11px] font-medium text-(--rs-neutral-grey-600)">
        Onboarding Lead{leadName ? ` · ${leadName}` : ''}
        <input
          type="email"
          value={leadEmail}
          disabled={!leadUserId || isPending}
          onChange={(event) => {
            setLeadEmail(event.target.value);
            if (sameUser) setSupervisorEmail(event.target.value);
          }}
          placeholder={leadUserId ? 'Uses user email when blank' : 'Assign lead first'}
          className="h-8 w-full rounded border border-(--rs-neutral-grey-200) bg-white px-2 text-xs text-(--rs-neutral-grey-800) outline-none focus:border-(--rs-primary-300) focus:ring-2 focus:ring-(--rs-primary-100) disabled:cursor-not-allowed disabled:bg-(--rs-neutral-grey-50)"
        />
      </label>
      <label className="block space-y-1 text-[11px] font-medium text-(--rs-neutral-grey-600)">
        Direct Supervisor{supervisorName ? ` · ${supervisorName}` : ''}
        <input
          type="email"
          value={supervisorEmail}
          disabled={!supervisorUserId || isPending}
          onChange={(event) => {
            setSupervisorEmail(event.target.value);
            if (sameUser) setLeadEmail(event.target.value);
          }}
          placeholder={supervisorUserId ? 'Uses user email when blank' : 'Assign supervisor first'}
          className="h-8 w-full rounded border border-(--rs-neutral-grey-200) bg-white px-2 text-xs text-(--rs-neutral-grey-800) outline-none focus:border-(--rs-primary-300) focus:ring-2 focus:ring-(--rs-primary-100) disabled:cursor-not-allowed disabled:bg-(--rs-neutral-grey-50)"
        />
      </label>
      <button
        type="button"
        disabled={isPending}
        onClick={save}
        className="inline-flex h-7 items-center gap-1.5 rounded bg-(--rs-primary-600) px-2.5 text-[11px] font-semibold text-white transition-colors hover:bg-(--rs-primary-700) disabled:opacity-60"
      >
        <Save className="h-3 w-3" /> {isPending ? 'Saving…' : 'Save user emails'}
      </button>
      {message && <p className="text-[11px] text-(--rs-neutral-grey-600)" role="status">{message}</p>}
    </div>
  );
}

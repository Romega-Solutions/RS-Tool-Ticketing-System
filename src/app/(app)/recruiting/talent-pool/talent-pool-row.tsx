'use client';

import { useTransition } from 'react';
import {
  Send, Check, Eye, EyeOff, XCircle, Clock, ShieldCheck, ShieldAlert,
} from 'lucide-react';
import {
  requestTalentConsent,
  markTalentConsentAgreed,
  revokeTalentConsent,
  updateCandidatePublicTalent,
} from '../candidates/actions';

export type ConsentStatus = 'none' | 'requested' | 'agreed' | 'revoked';

function fmt(iso: string | null): string {
  if (!iso) return '';
  try { return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }); }
  catch { return ''; }
}

export function ConsentChip({
  status, requestedAt, agreedAt, method,
}: {
  status: ConsentStatus;
  requestedAt: string | null;
  agreedAt: string | null;
  method: string | null;
}) {
  const map = {
    none:      { icon: <ShieldAlert className="w-3 h-3" />, text: 'Not requested', cls: 'bg-(--rs-neutral-grey-100) text-(--rs-neutral-grey-600)' },
    requested: { icon: <Clock className="w-3 h-3" />,       text: `Requested${requestedAt ? ` · ${fmt(requestedAt)}` : ''}`, cls: 'bg-(--rs-accent-50) text-(--rs-accent-800)' },
    agreed:    { icon: <ShieldCheck className="w-3 h-3" />, text: `Agreed${agreedAt ? ` · ${fmt(agreedAt)}` : ''}${method ? ` · ${method}` : ''}`, cls: 'bg-green-50 text-green-700' },
    revoked:   { icon: <ShieldAlert className="w-3 h-3" />, text: 'Withdrawn', cls: 'bg-red-50 text-red-700' },
  }[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${map.cls}`}>
      {map.icon}{map.text}
    </span>
  );
}

// Compact, state-driven action cell for the Talent Pool management table.
export function TalentPoolActions({
  id,
  email,
  isPublic,
  consentStatus,
}: {
  id: number;
  email: string | null;
  isPublic: boolean;
  consentStatus: ConsentStatus;
}) {
  const [isPending, start] = useTransition();

  const run = (fn: () => Promise<void>, confirmMsg?: string) => {
    if (confirmMsg && !confirm(confirmMsg)) return;
    start(async () => {
      try { await fn(); }
      catch (err) { alert(err instanceof Error ? err.message : 'Action failed'); }
    });
  };

  return (
    <div className="flex items-center justify-end gap-1.5">
      {(consentStatus === 'none' || consentStatus === 'revoked' || consentStatus === 'requested') && (
        <>
          <Btn
            onClick={() => run(() => requestTalentConsent(id), email ? undefined : 'This candidate has no email on file. Add one first.')}
            disabled={isPending || !email}
            variant="primary"
            icon={<Send className="w-3 h-3" />}
            title={email ? 'Email the candidate a one-click consent link' : 'No email on file'}
          >
            {consentStatus === 'requested' ? 'Resend' : 'Send consent'}
          </Btn>
          <Btn
            onClick={() => run(() => markTalentConsentAgreed(id), 'Mark consent as agreed manually? Only do this if you hold the candidate’s written consent. Recorded as a manual attestation under your name.')}
            disabled={isPending}
            variant="ghost"
            icon={<Check className="w-3 h-3" />}
            title="Mark agreed manually (you hold written consent)"
          >
            Mark agreed
          </Btn>
        </>
      )}

      {consentStatus === 'agreed' && (
        <>
          <Btn
            onClick={() => run(
              () => updateCandidatePublicTalent(id, !isPublic),
              isPublic
                ? 'Remove this candidate from the public Talent Pool?'
                : 'Publish this candidate to the public Talent Pool? Their first name + last initial, role, skills, and location will appear on romega-solutions.com/talent.',
            )}
            disabled={isPending}
            variant={isPublic ? 'success' : 'primary'}
            icon={isPublic ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
          >
            {isPublic ? 'Published' : 'Publish'}
          </Btn>
          <Btn
            onClick={() => run(() => revokeTalentConsent(id), 'Revoke consent and unpublish this candidate?')}
            disabled={isPending}
            variant="danger"
            icon={<XCircle className="w-3 h-3" />}
            title="Revoke consent + unpublish"
          >
            Revoke
          </Btn>
        </>
      )}
    </div>
  );
}

function Btn({
  children, onClick, disabled, variant, icon, title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant: 'primary' | 'success' | 'danger' | 'ghost';
  icon?: React.ReactNode;
  title?: string;
}) {
  const cls = {
    primary: 'bg-(--rs-primary-500) text-white hover:bg-(--rs-primary-600) border-transparent',
    success: 'bg-green-50 text-green-700 border-green-300 hover:bg-green-100',
    danger:  'bg-white text-red-600 border-(--rs-neutral-grey-200) hover:bg-red-50 hover:border-red-200',
    ghost:   'bg-white text-(--rs-neutral-grey-700) border-(--rs-neutral-grey-200) hover:bg-(--rs-neutral-grey-50)',
  }[variant];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors disabled:opacity-50 ${cls}`}
    >
      {icon}{children}
    </button>
  );
}

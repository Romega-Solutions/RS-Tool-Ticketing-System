'use client';

import { useTransition } from 'react';
import {
  Users, ShieldCheck, ShieldAlert,
  Eye, EyeOff, Send, Check, XCircle, Clock,
} from 'lucide-react';
import {
  requestTalentConsent,
  markTalentConsentAgreed,
  revokeTalentConsent,
  updateCandidatePublicTalent,
} from './actions';

type ConsentStatus = 'none' | 'requested' | 'agreed' | 'revoked';

function fmt(iso: string | null): string {
  if (!iso) return '';
  try { return new Date(iso).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return ''; }
}

// State-driven Talent Pool consent + publish control. Lives in the candidate
// detail right rail. Publishing is gated on consent_status === 'agreed'.
export function TalentConsentPanel({
  id,
  email,
  isPublic,
  consentStatus,
  consentRequestedAt,
  consentAgreedAt,
  consentMethod,
}: {
  id: number;
  email: string | null;
  isPublic: boolean;
  consentStatus: ConsentStatus;
  consentRequestedAt: string | null;
  consentAgreedAt: string | null;
  consentMethod: string | null;
}) {
  const [isPending, start] = useTransition();

  const run = (fn: () => Promise<void>, confirmMsg?: string) => {
    if (confirmMsg && !confirm(confirmMsg)) return;
    start(async () => {
      try { await fn(); }
      catch (err) { alert(err instanceof Error ? err.message : 'Action failed'); }
    });
  };

  const sendEmail = () =>
    run(() => requestTalentConsent(id),
      email ? undefined
            : 'This candidate has no email on file. Add one first.');

  const markAgreed = () =>
    run(() => markTalentConsentAgreed(id),
      'Mark consent as agreed manually? Only do this if you hold the candidate’s written consent (e.g. an email reply). This is recorded as a manual attestation under your name.');

  const revoke = () =>
    run(() => revokeTalentConsent(id),
      'Revoke consent and unpublish this candidate from the public Talent Pool?');

  const togglePublish = () =>
    run(() => updateCandidatePublicTalent(id, !isPublic),
      isPublic
        ? 'Remove this candidate from the public Talent Pool?'
        : 'Publish this candidate to the public Talent Pool? Their first name + last initial, role, skills, and location will appear on romega-solutions.com/talent.');

  return (
    <div className="rounded-xl border border-(--rs-neutral-grey-200) bg-white p-4 space-y-3">
      <div className="flex items-center gap-1.5">
        <Users className="w-3.5 h-3.5 text-(--rs-primary-600)" />
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-(--rs-neutral-grey-500)">Talent Pool</h3>
      </div>

      <ConsentChip status={consentStatus} requestedAt={consentRequestedAt} agreedAt={consentAgreedAt} method={consentMethod} />

      {!email && consentStatus !== 'agreed' && (
        <p className="text-[11px] text-(--rs-accent-700) bg-(--rs-accent-50)/60 rounded-md px-2 py-1.5">
          No email on file — add one to send the consent request.
        </p>
      )}

      <div className="space-y-2">
        {/* none / revoked → request consent */}
        {(consentStatus === 'none' || consentStatus === 'revoked') && (
          <>
            <Btn onClick={sendEmail} disabled={isPending || !email} variant="primary" icon={<Send className="w-3.5 h-3.5" />}>
              Send consent email
            </Btn>
            <Btn onClick={markAgreed} disabled={isPending} variant="ghost" icon={<Check className="w-3.5 h-3.5" />}>
              Mark agreed (have written consent)
            </Btn>
          </>
        )}

        {/* requested → resend / manual mark */}
        {consentStatus === 'requested' && (
          <>
            <Btn onClick={sendEmail} disabled={isPending || !email} variant="primary" icon={<Send className="w-3.5 h-3.5" />}>
              Resend consent email
            </Btn>
            <Btn onClick={markAgreed} disabled={isPending} variant="ghost" icon={<Check className="w-3.5 h-3.5" />}>
              Mark agreed (have written consent)
            </Btn>
          </>
        )}

        {/* agreed → publish toggle + revoke */}
        {consentStatus === 'agreed' && (
          <>
            <Btn
              onClick={togglePublish}
              disabled={isPending}
              variant={isPublic ? 'success' : 'primary'}
              icon={isPublic ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            >
              {isPublic ? 'Published — click to unpublish' : 'Publish to Talent Pool'}
            </Btn>
            <Btn onClick={revoke} disabled={isPending} variant="danger" icon={<XCircle className="w-3.5 h-3.5" />}>
              Revoke consent
            </Btn>
          </>
        )}
      </div>
    </div>
  );
}

function ConsentChip({
  status, requestedAt, agreedAt, method,
}: {
  status: ConsentStatus;
  requestedAt: string | null;
  agreedAt: string | null;
  method: string | null;
}) {
  const map = {
    none:      { icon: <ShieldAlert className="w-3.5 h-3.5" />, text: 'Consent not requested', cls: 'bg-(--rs-neutral-grey-100) text-(--rs-neutral-grey-700)' },
    requested: { icon: <Clock className="w-3.5 h-3.5" />,       text: `Consent requested${requestedAt ? ` · ${fmt(requestedAt)}` : ''}`, cls: 'bg-(--rs-accent-50) text-(--rs-accent-800)' },
    agreed:    { icon: <ShieldCheck className="w-3.5 h-3.5" />, text: `Consent agreed${agreedAt ? ` · ${fmt(agreedAt)}` : ''}${method ? ` · ${method}` : ''}`, cls: 'bg-green-50 text-green-700' },
    revoked:   { icon: <ShieldAlert className="w-3.5 h-3.5" />, text: 'Consent withdrawn', cls: 'bg-red-50 text-red-700' },
  }[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium ${map.cls}`}>
      {map.icon}{map.text}
    </span>
  );
}

function Btn({
  children, onClick, disabled, variant, icon,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant: 'primary' | 'success' | 'danger' | 'ghost';
  icon?: React.ReactNode;
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
      className={`w-full inline-flex items-center justify-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${cls}`}
    >
      {icon}{children}
    </button>
  );
}

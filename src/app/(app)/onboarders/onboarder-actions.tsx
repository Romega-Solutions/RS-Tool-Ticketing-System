'use client';

import { useTransition } from 'react';
import {
  Mail, Send, FileSignature, CheckCircle2, RefreshCw, MailWarning,
} from 'lucide-react';
import {
  sendBgCheckEmail,
  sendWelcomeEmail,
  sendReferenceRequest,
  sendEmploymentVerification,
  markSowSent,
  markSowSigned,
  resendOnboardingEmail,
} from './actions';

// ─────────────────────────────────────────────────────────────────────────────
// Single-source pattern for every async action button on the detail page.
// Disabled state + spinner share the same shell so the page stays calm under
// rapid clicks.
// ─────────────────────────────────────────────────────────────────────────────

type Variant = 'primary' | 'outline' | 'subtle' | 'danger';

function variantClass(v: Variant): string {
  switch (v) {
    case 'primary': return 'bg-(--rs-primary-600) text-white hover:bg-(--rs-primary-700)';
    case 'outline': return 'bg-white border border-(--rs-neutral-grey-200) text-(--rs-neutral-grey-800) hover:bg-(--rs-neutral-grey-50)';
    case 'subtle':  return 'bg-(--rs-primary-50) text-(--rs-primary-800) hover:bg-(--rs-primary-100)';
    case 'danger':  return 'bg-red-50 text-red-700 border border-red-100 hover:bg-red-100';
  }
}

function ActionButton({
  onClick, label, icon, variant = 'outline', confirm, disabled, size = 'sm',
}: {
  onClick:   () => Promise<void>;
  label:     string;
  icon:      React.ReactNode;
  variant?:  Variant;
  confirm?:  string;
  disabled?: boolean;
  size?:     'sm' | 'md';
}) {
  const [isPending, start] = useTransition();
  const sizeCls = size === 'md' ? 'h-10 px-4 text-sm' : 'h-8 px-3 text-xs';
  return (
    <button
      type="button"
      disabled={disabled || isPending}
      onClick={() => {
        if (confirm && !window.confirm(confirm)) return;
        start(async () => {
          try { await onClick(); }
          catch (err) {
            console.error(err);
            alert(err instanceof Error ? err.message : 'Action failed');
          }
        });
      }}
      className={`inline-flex items-center gap-1.5 rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${sizeCls} ${variantClass(variant)}`}
    >
      {isPending
        ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current/30 border-t-current" />
        : icon}
      {isPending ? 'Working…' : label}
    </button>
  );
}

// ── Detail-page overview actions ────────────────────────────────────────────

export function MarkSowSentButton({ id, alreadySent }: { id: number; alreadySent: boolean }) {
  return (
    <ActionButton
      onClick={() => markSowSent(id)}
      label={alreadySent ? 'SOW sent ✓' : 'Mark SOW sent'}
      icon={<FileSignature className="w-3.5 h-3.5" />}
      variant={alreadySent ? 'subtle' : 'outline'}
      disabled={alreadySent}
    />
  );
}

export function MarkSowSignedButton({ id, alreadySigned }: { id: number; alreadySigned: boolean }) {
  return (
    <ActionButton
      onClick={() => markSowSigned(id)}
      label={alreadySigned ? 'SOW signed ✓' : 'Mark SOW signed'}
      icon={<CheckCircle2 className="w-3.5 h-3.5" />}
      variant={alreadySigned ? 'subtle' : 'primary'}
      disabled={alreadySigned}
    />
  );
}

export function SendBgCheckButton({ id }: { id: number }) {
  return (
    <ActionButton
      onClick={() => sendBgCheckEmail(id)}
      label="Send BG-check email"
      icon={<Send className="w-3.5 h-3.5" />}
      variant="primary"
      size="md"
      confirm="Send the SOP §3 background-check request email now?"
    />
  );
}

export function SendWelcomeButton({ id, type }: { id: number; type: string }) {
  return (
    <ActionButton
      onClick={() => sendWelcomeEmail(id)}
      label={`Send welcome (${type})`}
      icon={<Mail className="w-3.5 h-3.5" />}
      variant="primary"
      size="md"
      confirm={`Send the ${type} welcome email (SOP §5) now?`}
    />
  );
}

// ── Row-level actions on the BG-check tab ───────────────────────────────────

export function SendReferenceRequestButton({ refId, alreadySent }: { refId: number; alreadySent: boolean }) {
  return (
    <ActionButton
      onClick={() => sendReferenceRequest(refId)}
      label={alreadySent ? 'Resend' : 'Send'}
      icon={alreadySent
        ? <RefreshCw className="w-3.5 h-3.5" />
        : <Send className="w-3.5 h-3.5" />}
      variant={alreadySent ? 'subtle' : 'primary'}
    />
  );
}

export function SendVerificationButton({ verId, alreadySent }: { verId: number; alreadySent: boolean }) {
  return (
    <ActionButton
      onClick={() => sendEmploymentVerification(verId)}
      label={alreadySent ? 'Resend' : 'Send'}
      icon={alreadySent
        ? <RefreshCw className="w-3.5 h-3.5" />
        : <Send className="w-3.5 h-3.5" />}
      variant={alreadySent ? 'subtle' : 'primary'}
    />
  );
}

// ── Manual resend button (when last_email failed) ───────────────────────────

export function ResendLastEmailButton({ id, template }: { id: number; template: string }) {
  return (
    <ActionButton
      onClick={() => resendOnboardingEmail(id, template)}
      label={`Resend ${template}`}
      icon={<MailWarning className="w-3.5 h-3.5" />}
      variant="danger"
    />
  );
}

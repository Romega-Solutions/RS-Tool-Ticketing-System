'use client';

import { useState, useTransition } from 'react';
import {
  Mail, Send, FileSignature, CheckCircle2, RefreshCw, MailWarning,
  MessageSquare, PenSquare,
} from 'lucide-react';
import {
  sendBgCheckEmail,
  sendWelcomeEmail,
  sendReferenceRequest,
  sendEmploymentVerification,
  markSowSent,
  markSowSigned,
  resendOnboardingEmail,
  sendGmailSignatureNudge,
  sendGroupChatAnnouncement,
  toggleChecklistItem,
  updateOnboarderNotes,
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

// ── Post-MVP email buttons (Phase C) ────────────────────────────────────────

export function SendGmailNudgeButton({ id, type }: { id: number; type: string }) {
  return (
    <ActionButton
      onClick={() => sendGmailSignatureNudge(id)}
      label="Send Gmail + signature nudge"
      icon={<Mail className="w-3.5 h-3.5" />}
      variant="outline"
      size="md"
      confirm={`Send the SOP §6 ${type} Gmail/signature nudge now?`}
    />
  );
}

export function SendGroupChatButton({ id }: { id: number }) {
  return (
    <ActionButton
      onClick={() => sendGroupChatAnnouncement(id)}
      label="Announce new hire"
      icon={<MessageSquare className="w-3.5 h-3.5" />}
      variant="outline"
      size="md"
      confirm="Generate & send the team-wide announcement now?"
    />
  );
}

// ── Day-1 checklist toggle ──────────────────────────────────────────────────

export function ChecklistToggle({
  id, fieldKey, label, value,
}: {
  id:       number;
  fieldKey: string;
  label:    string;
  value:    string | null;
}) {
  const [optimistic, setOptimistic] = useState<boolean>(!!value);
  const [isPending, start] = useTransition();
  const done = isPending ? optimistic : !!value;

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => {
        const next = !done;
        setOptimistic(next);
        start(async () => {
          try { await toggleChecklistItem(id, fieldKey, next); }
          catch (err) {
            setOptimistic(!next);
            alert(err instanceof Error ? err.message : 'Toggle failed');
          }
        });
      }}
      className={`group flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors cursor-pointer disabled:cursor-wait ${
        done
          ? 'border-green-200 bg-green-50/60 hover:bg-green-50'
          : 'border-(--rs-neutral-grey-200) bg-white hover:bg-(--rs-neutral-grey-50)'
      }`}
    >
      <span className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
        done
          ? 'border-green-500 bg-green-500 text-white'
          : 'border-(--rs-neutral-grey-300) bg-white'
      }`}>
        {done && <CheckCircle2 className="w-3.5 h-3.5" />}
      </span>
      <span className={`text-sm font-medium ${done ? 'text-(--rs-neutral-grey-700) line-through decoration-(--rs-neutral-grey-400)' : 'text-(--rs-neutral-grey-900)'}`}>
        {label}
      </span>
      {value && (
        <span className="ml-auto text-[10px] text-(--rs-neutral-grey-500)">
          {new Date(value).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
        </span>
      )}
    </button>
  );
}

// ── Notes editor ────────────────────────────────────────────────────────────

export function NotesEditor({ id, initial }: { id: number; initial: string | null }) {
  const [value, setValue] = useState(initial ?? '');
  const [saved, setSaved] = useState<string | null>(initial ?? '');
  const [isPending, start] = useTransition();
  const dirty = value !== (saved ?? '');

  return (
    <div className="space-y-2">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={8}
        maxLength={8000}
        placeholder="Anything HR or the Onboarding Lead should remember about this person — concerns, accommodations, references context, etc."
        className="w-full resize-y rounded-lg border border-(--rs-neutral-grey-200) bg-white p-3 text-sm text-(--rs-neutral-grey-900) placeholder:text-(--rs-neutral-grey-400) focus:outline-none focus:ring-2 focus:ring-(--rs-primary-200)"
      />
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="text-(--rs-neutral-grey-500)">
          {value.length} / 8000 characters
          {dirty && <span className="ml-2 inline-flex items-center gap-1 text-(--rs-accent-700)"><PenSquare className="w-3 h-3" /> Unsaved</span>}
        </span>
        <button
          type="button"
          disabled={!dirty || isPending}
          onClick={() => {
            start(async () => {
              try {
                await updateOnboarderNotes(id, value);
                setSaved(value);
              } catch (err) {
                alert(err instanceof Error ? err.message : 'Save failed');
              }
            });
          }}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-(--rs-primary-600) px-4 text-xs font-semibold text-white hover:bg-(--rs-primary-700) disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {isPending
            ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            : <CheckCircle2 className="w-3.5 h-3.5" />}
          {isPending ? 'Saving…' : 'Save notes'}
        </button>
      </div>
    </div>
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

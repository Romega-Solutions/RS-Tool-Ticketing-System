'use client';

import type { ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import { Loader2 } from 'lucide-react';

// Shared submit button for the admin-learning server-action forms. Reads the
// parent <form>'s pending state via useFormStatus so every save/add/delete shows
// a spinner and disables itself while the (often multi-second) action runs —
// no more dead clicks. `confirm` guards destructive actions; `pendingText`
// swaps the label while in flight.
export function SubmitButton({
  children,
  className = '',
  pendingText,
  confirm,
  spinnerClassName = 'w-4 h-4',
}: {
  children: ReactNode;
  className?: string;
  pendingText?: string;
  confirm?: string;
  spinnerClassName?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      onClick={
        confirm
          ? (e) => { if (!window.confirm(confirm)) e.preventDefault(); }
          : undefined
      }
      className={`inline-flex items-center justify-center gap-1.5 transition-colors active:translate-y-px disabled:opacity-60 disabled:cursor-not-allowed disabled:active:translate-y-0 ${className}`}
    >
      {pending && <Loader2 className={`${spinnerClassName} animate-spin`} aria-hidden />}
      <span>{pending && pendingText ? pendingText : children}</span>
    </button>
  );
}

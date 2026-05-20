'use client';

import { useTransition } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { resendLastEmail } from '../actions';

export function ResendEmailButton({ candidateId, template }: { candidateId: number; template: string }) {
  const [isPending, start] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => {
        start(async () => {
          try {
            await resendLastEmail(candidateId, template);
          } catch (err) {
            alert(err instanceof Error ? err.message : 'Resend failed');
          }
        });
      }}
      className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-(--rs-primary-600) px-3 py-1.5 text-xs font-semibold text-white hover:bg-(--rs-primary-700) transition-colors disabled:opacity-50"
    >
      {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
      {isPending ? 'Resending…' : 'Resend last email'}
    </button>
  );
}

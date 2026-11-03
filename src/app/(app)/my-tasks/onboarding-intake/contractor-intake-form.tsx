'use client';

import { useState, useTransition, type FormEvent, type ReactNode } from 'react';
import { directUpload } from '@/lib/direct-upload-client';
import { checkUploadFile } from '@/lib/direct-upload';
import { prepareIntakeW8Upload, submitContractorIntake } from './actions';

/**
 * Wraps the contractor intake fields. On submit the W-8 goes straight from the
 * browser to storage (signed upload URL), then the rest of the form is sent
 * with only the uploaded file's path, so large W-8 scans don't hit the server
 * action size limit.
 */
export function ContractorIntakeForm({ children, className }: { children: ReactNode; className?: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setError(null);
    const formData = new FormData(event.currentTarget);
    const file = formData.get('w8File');
    const legalName = String(formData.get('legalName') ?? '').trim();
    if (!(file instanceof File) || file.size === 0) { setError('W-8 form (PDF) is required'); return; }
    const check = checkUploadFile(file, 'onboarder_document');
    if (!check.ok) { setError(check.error); return; }
    formData.delete('w8File');

    start(async () => {
      try {
        await directUpload({
          file,
          policy:  'onboarder_document',
          prepare: meta => prepareIntakeW8Upload({ legalName, ...meta }),
          record:  async receipt => {
            formData.set('w8Path', receipt.path);
            formData.set('w8Name', receipt.fileName);
            formData.set('w8Size', String(receipt.size));
            formData.set('w8Type', receipt.type);
            formData.set('w8Check', receipt.check);
            // On success the action redirects to My Tasks.
            return (await submitContractorIntake(formData)) ?? { ok: true };
          },
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not submit the form');
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className={className} aria-busy={pending}>
      {children}
      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
      {pending && <p className="text-right text-xs text-(--rs-neutral-grey-500)">Uploading your W-8 and submitting…</p>}
    </form>
  );
}

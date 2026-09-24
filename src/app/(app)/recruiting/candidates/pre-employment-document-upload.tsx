'use client';

import { useRef, useState, useTransition } from 'react';
import { CheckCircle2, Upload } from 'lucide-react';
import { markCandidateSowSigned, sendCandidateDocumentPackage, uploadPreEmploymentDocument } from './actions';

export function PreEmploymentDocumentUpload({ candidateId, kind, canUpload }: { candidateId: number; kind: 'sow' | 'job_description' | 'ai_policy' | 'nda'; canUpload: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  if (!canUpload) return null;
  return <div className="flex flex-col items-end gap-1">
    <input ref={inputRef} type="file" accept="application/pdf,.pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden" onChange={event => {
      const file = event.target.files?.[0];
      if (!file) return;
      setError('');
      start(async () => {
        const formData = new FormData(); formData.set('file', file);
        try { await uploadPreEmploymentDocument(candidateId, kind, formData); }
        catch (err) { setError(err instanceof Error ? err.message : 'Upload failed'); }
        finally { if (inputRef.current) inputRef.current.value = ''; }
      });
    }} />
    <button type="button" disabled={pending} onClick={() => inputRef.current?.click()} className="inline-flex items-center gap-1 rounded-lg border border-(--rs-neutral-grey-200) bg-white px-2.5 py-1 text-[11px] font-semibold text-(--rs-neutral-grey-700) hover:bg-(--rs-neutral-grey-50) disabled:opacity-50">
      <Upload className="h-3.5 w-3.5" /> {pending ? 'Uploading…' : 'Upload PDF / DOCX'}
    </button>
    {error && <p className="max-w-48 text-right text-[10px] text-red-600">{error}</p>}
  </div>;
}

export function SendCandidateDocumentPackageButton({ candidateId, alreadySent }: { candidateId: number; alreadySent: boolean }) {
  const [pending, start] = useTransition();
  return <button type="button" disabled={pending} onClick={() => {
    if (!window.confirm(`${alreadySent ? 'Resend' : 'Send'} all pre-employment documents to the candidate?`)) return;
    start(async () => { try { await sendCandidateDocumentPackage(candidateId); } catch (err) { alert(err instanceof Error ? err.message : 'Could not send the document package'); } });
  }} className="inline-flex items-center gap-1 rounded-lg bg-(--rs-primary-600) px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-(--rs-primary-700) disabled:opacity-50">
    {pending ? 'Sending…' : alreadySent ? 'Resend package' : 'Send document package'}
  </button>;
}

export function MarkCandidateSowSignedButton({ candidateId }: { candidateId: number }) {
  const [pending, start] = useTransition();
  return <button type="button" disabled={pending} onClick={() => {
    if (!window.confirm('Confirm that the candidate has signed the Statement of Work? This will mark them hired and create their onboarding record.')) return;
    start(async () => { try { await markCandidateSowSigned(candidateId); } catch (err) { alert(err instanceof Error ? err.message : 'Could not mark the SOW signed'); } });
  }} className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-green-700 disabled:opacity-50">
    <CheckCircle2 className="h-3.5 w-3.5" /> {pending ? 'Completing…' : 'Mark SOW signed'}
  </button>;
}

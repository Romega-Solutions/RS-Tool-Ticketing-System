'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { Upload, CheckCircle2, AlertCircle, Send, Loader2 } from 'lucide-react';
import { submitPublicApplication, type PublicApplicationResult } from './actions';

type Status = 'idle' | 'submitting' | 'success' | 'error';

export function ApplyForm({ positionId, jobTitle }: { positionId: number; jobTitle: string }) {
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [appCode, setAppCode] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [isPending, start] = useTransition();
  const [fileName, setFileName] = useState<string>('');
  const loadedAtRef = useRef<number>(0);

  useEffect(() => { loadedAtRef.current = Date.now(); }, []);

  async function onSubmit(formData: FormData) {
    setStatus('submitting');
    setErrorMsg('');
    const submittedName = String(formData.get('fullName') ?? '');
    setName(submittedName);
    formData.set('loadedAt', String(loadedAtRef.current));
    start(async () => {
      let result: PublicApplicationResult;
      try {
        result = await submitPublicApplication(positionId, formData);
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Submission failed');
        setStatus('error');
        return;
      }
      if (result.ok) {
        setAppCode(result.applicationCode);
        setStatus('success');
      } else {
        setErrorMsg(result.error);
        setStatus('error');
      }
    });
  }

  if (status === 'success') {
    return (
      <div className="rounded-2xl border border-(--rs-primary-200) bg-(--rs-primary-50)/60 p-6 sm:p-8 text-center">
        <div className="mx-auto w-12 h-12 rounded-full bg-(--rs-primary-100) text-(--rs-primary-700) flex items-center justify-center mb-4">
          <CheckCircle2 className="w-7 h-7" />
        </div>
        <h2 className="font-serif text-2xl font-bold text-(--rs-neutral-grey-900)">
          Thanks{name ? `, ${name.split(' ')[0]}` : ''}!
        </h2>
        <p className="mt-2 text-sm text-(--rs-neutral-grey-600) max-w-md mx-auto leading-relaxed">
          Your application for <strong>{jobTitle}</strong> has been received.
          {appCode && (
            <>
              {' '}Your application code is{' '}
              <span className="inline-block font-mono text-(--rs-primary-700) font-semibold">{appCode}</span>.
            </>
          )}
        </p>
        <p className="mt-3 text-xs text-(--rs-neutral-grey-500)">
          We&apos;ve sent a confirmation email. Our recruitment team will review your application and reach out within 5–7 business days.
        </p>
      </div>
    );
  }

  return (
    <form action={onSubmit} className="space-y-5">
      {/* Honeypot — invisible to humans, naive bots fill every input. */}
      <div aria-hidden="true" className="absolute left-[-9999px] top-[-9999px] w-px h-px overflow-hidden" style={{ position: 'absolute' }}>
        <label htmlFor="company_website">Company website (leave blank)</label>
        <input
          id="company_website"
          name="company_website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      <Field label="Full name *" htmlFor="fullName">
        <input
          id="fullName" name="fullName" required autoComplete="name"
          placeholder="Juan Dela Cruz"
          className={inputCls}
        />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Email *" htmlFor="email">
          <input
            id="email" name="email" type="email" required autoComplete="email"
            placeholder="you@example.com"
            className={inputCls}
          />
        </Field>
        <Field label="Phone *" htmlFor="phone">
          <input
            id="phone" name="phone" required autoComplete="tel"
            placeholder="0917 555 1234"
            className={inputCls}
          />
        </Field>
      </div>

      <Field label="LinkedIn (optional)" htmlFor="linkedinUrl">
        <input
          id="linkedinUrl" name="linkedinUrl" type="url"
          placeholder="https://linkedin.com/in/…"
          className={inputCls}
        />
      </Field>

      <Field label="Resume (PDF, max 10 MB) *" htmlFor="resume">
        <label
          htmlFor="resume"
          className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-(--rs-neutral-grey-300) bg-(--rs-neutral-grey-50) px-4 py-6 text-sm text-(--rs-neutral-grey-600) hover:bg-(--rs-neutral-grey-100) transition-colors"
        >
          <Upload className="w-4 h-4" />
          {fileName ? <span className="font-medium text-(--rs-neutral-grey-800)">{fileName}</span> : 'Click to upload PDF'}
        </label>
        <input
          id="resume" name="resume" type="file" accept="application/pdf,.pdf" required
          onChange={e => setFileName(e.target.files?.[0]?.name ?? '')}
          className="sr-only"
        />
      </Field>

      <Field label="Anything else we should know? (optional)" htmlFor="message">
        <textarea
          id="message" name="message" rows={4}
          placeholder="Why this role, availability, salary expectations…"
          className={`${inputCls} min-h-24`}
        />
      </Field>

      {status === 'error' && errorMsg && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-(--rs-primary-600) px-5 py-3 text-sm font-semibold text-white hover:bg-(--rs-primary-700) transition-colors disabled:opacity-50"
      >
        {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        {isPending ? 'Submitting…' : 'Submit application'}
      </button>

      <p className="text-[11px] text-(--rs-neutral-grey-500) text-center">
        By submitting, you agree to be contacted by Romega Solutions about this role.
      </p>
    </form>
  );
}

const inputCls =
  'w-full rounded-lg border border-(--rs-neutral-grey-200) bg-white px-3 py-2.5 text-sm placeholder:text-(--rs-neutral-grey-400) outline-none focus:border-(--rs-primary-300) focus:ring-4 focus:ring-(--rs-primary-100) transition-all';

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-xs font-semibold text-(--rs-neutral-grey-700)">
        {label}
      </label>
      {children}
    </div>
  );
}

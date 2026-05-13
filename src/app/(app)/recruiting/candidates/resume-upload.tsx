'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { FileUp, Loader2, Sparkles, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createCandidateFromResume, parseResumeForCandidate, type ParseResumeResult } from './actions';

type Mode = 'create' | 'reparse';

const HINT: Record<string, string> = {
  EMPTY_FILE:           'The file is empty.',
  FILE_TOO_LARGE:       'Resume exceeds 10 MB. Compress it and try again.',
  INVALID_FILE_TYPE:    'Only PDF files are accepted.',
  DOCX_NOT_SUPPORTED:   'Word documents can’t be parsed yet — save the resume as PDF and try again.',
  NETWORK_ERROR:        'Could not reach the n8n parser. Is the workflow active?',
  INVALID_RESPONSE:     'n8n returned an unexpected response.',
  EXTRACTION_FAILED:    'Could not read text from this file. If it’s a scanned PDF, OCR is required.',
  AI_JSON_PARSE_FAILED: 'AI returned malformed JSON. Try again.',
  AI_EXTRACTION_EMPTY:  'Parsed but found no name or email — file may not be a resume.',
  NO_FILE:              'No file selected.',
  NOT_FOUND:            'Candidate not found.',
  DB_ERROR:             'Database error while saving.',
  INVALID_ID:           'Invalid candidate id.',
  UNKNOWN_ERROR:        'Unknown error from n8n.',
};

export function ResumeUploadButton({
  mode,
  candidateId,
  variant = 'default',
  label,
}: {
  mode:         Mode;
  candidateId?: number;
  variant?:     'default' | 'outline' | 'ghost';
  label?:       string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPending, start] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  function handlePick() {
    inputRef.current?.click();
  }

  function handleFile(file: File | null) {
    if (!file) return;
    setErrorMsg(null);
    setErrorCode(null);

    start(async () => {
      const fd = new FormData();
      fd.append('resume', file);

      let res: ParseResumeResult;
      try {
        if (mode === 'create') {
          res = await createCandidateFromResume(fd);
        } else {
          if (!candidateId) {
            setErrorMsg('Missing candidate id'); return;
          }
          res = await parseResumeForCandidate(candidateId, fd);
        }
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Unexpected failure');
        return;
      }

      // Reset the input so picking the same file again still triggers onChange
      if (inputRef.current) inputRef.current.value = '';

      if (!res.ok) {
        setErrorCode(res.code);
        setErrorMsg(HINT[res.code] ?? res.error);
        return;
      }

      if (mode === 'create') {
        router.push(`/recruiting/candidates/${res.candidateId}`);
      } else {
        router.refresh();
      }
    });
  }

  const buttonLabel = label ?? (mode === 'create' ? 'Add from resume' : 'Re-parse resume');
  const Icon = mode === 'create' ? Sparkles : RotateCcw;

  return (
    <div className="inline-flex flex-col items-end gap-1">
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
        disabled={isPending}
      />
      <Button
        type="button"
        variant={variant}
        onClick={handlePick}
        disabled={isPending}
        className="gap-2"
      >
        {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Icon className="w-4 h-4" />}
        {isPending ? (mode === 'create' ? 'Parsing resume…' : 'Re-parsing…') : buttonLabel}
      </Button>
      {errorMsg && (
        <p className="text-xs text-red-600 max-w-xs text-right">
          <strong>{errorCode}</strong> {errorMsg}
        </p>
      )}
    </div>
  );
}

export function ResumeUploadCard({ candidateId }: { candidateId: number }) {
  return (
    <div className="rounded-xl border border-dashed border-(--rs-primary-300) bg-(--rs-primary-50)/40 p-4">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-(--rs-primary-100) text-(--rs-primary-700) flex items-center justify-center shrink-0">
          <FileUp className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-(--rs-neutral-grey-900)">Parse resume with AI</p>
          <p className="text-xs text-(--rs-neutral-grey-600) mt-0.5">
            Upload a PDF (max 10 MB). Extracts name, contact, skills, experience, and education.
          </p>
        </div>
        <ResumeUploadButton mode="reparse" candidateId={candidateId} variant="outline" />
      </div>
    </div>
  );
}

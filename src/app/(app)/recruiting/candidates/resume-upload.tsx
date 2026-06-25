'use client';

import { useRef, useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { FileUp, Loader2, Sparkles, RotateCcw, FileText, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { createCandidateFromResume, parseResumeForCandidate, type ParseResumeResult } from './actions';

type Mode = 'create' | 'reparse';
type Parser = 'ai' | 'regex';

const HINT: Record<string, string> = {
  EMPTY_FILE:            'The file is empty.',
  FILE_TOO_LARGE:        'Resume exceeds 10 MB. Compress it and try again.',
  INVALID_FILE_TYPE:     'Only PDF files are accepted.',
  DOCX_NOT_SUPPORTED:    'Word documents can’t be parsed yet — save the resume as PDF and try again.',
  NETWORK_ERROR:         'Could not reach the n8n parser. Is the workflow active?',
  INVALID_RESPONSE:      'n8n returned an unexpected response.',
  EXTRACTION_FAILED:     'Could not read text from this file. If it’s a scanned PDF, OCR is required.',
  AI_JSON_PARSE_FAILED:  'AI returned malformed JSON. Try again.',
  AI_EXTRACTION_EMPTY:   'Parsed but found no name or email — file may not be a resume.',
  AI_NOT_CONFIGURED:     'AI parser isn’t configured. Set N8N_RESUME_PARSER_AI_URL, or use Standard.',
  PARSER_NOT_CONFIGURED: 'Resume parser isn’t configured. Set N8N_RESUME_PARSER_URL.',
  NO_FILE:               'No file selected.',
  NOT_FOUND:             'Candidate not found.',
  DB_ERROR:              'Database error while saving.',
  INVALID_ID:            'Invalid candidate id.',
  UNKNOWN_ERROR:         'Unknown error from n8n.',
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
  // Holds the parser picked in the popup so handleFile reads the latest value
  // (avoids a stale closure between "choose" and the file input's onChange).
  const parserRef = useRef<Parser>('ai');
  const [isPending, start] = useTransition();
  const [chooserOpen, setChooserOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  function openChooser() {
    setErrorMsg(null);
    setErrorCode(null);
    setChooserOpen(true);
  }

  function choose(parser: Parser) {
    parserRef.current = parser;
    setChooserOpen(false);
    // Let the dialog close before opening the native file picker.
    setTimeout(() => inputRef.current?.click(), 0);
  }

  function handleFile(file: File | null) {
    if (!file) return;
    setErrorMsg(null);
    setErrorCode(null);

    start(async () => {
      const fd = new FormData();
      fd.append('resume', file);
      fd.append('parser', parserRef.current);

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
        onClick={openChooser}
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

      <Dialog open={chooserOpen} onOpenChange={setChooserOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>How should we read this resume?</DialogTitle>
            <DialogDescription>
              Pick a parser, then choose the PDF (max 10 MB).
            </DialogDescription>
          </DialogHeader>

          <div className="mt-1 flex flex-col gap-2.5">
            <ParserChoice
              onClick={() => choose('ai')}
              icon={<Sparkles className="w-4 h-4" />}
              title="AI parser (Groq)"
              badge="Recommended"
              desc="Understands any layout — pulls skills, full work history, education, and languages accurately."
            />
            <ParserChoice
              onClick={() => choose('regex')}
              icon={<FileText className="w-4 h-4" />}
              title="Standard parser"
              desc="Fast, pattern-based, no AI. Best for simple, plainly-formatted resumes."
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ParserChoice({
  onClick, icon, title, desc, badge,
}: {
  onClick: () => void;
  icon:    ReactNode;
  title:   string;
  desc:    string;
  badge?:  string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-start gap-3 rounded-xl border border-(--rs-neutral-grey-200) bg-white p-3.5 text-left transition-colors hover:border-(--rs-primary-300) hover:bg-(--rs-primary-50)/40 focus:outline-none focus:ring-2 focus:ring-(--rs-primary-100)"
    >
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-(--rs-primary-100) text-(--rs-primary-700)">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-(--rs-neutral-grey-900)">{title}</span>
          {badge && (
            <span className="rounded-full bg-(--rs-accent-100) px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-(--rs-accent-700)">
              {badge}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-(--rs-neutral-grey-600)">{desc}</p>
      </div>
      <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-(--rs-neutral-grey-300) transition-transform group-hover:translate-x-0.5 group-hover:text-(--rs-primary-500)" />
    </button>
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

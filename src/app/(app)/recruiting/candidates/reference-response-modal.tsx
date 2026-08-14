'use client';

import { Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

const RESPONSE_FIELDS = [
  [['feedback_acceptance', 'q4_q4_feedback_acceptance'], 'Feedback acceptance'],
  [['punctuality', 'q5_q5_punctuality'], 'Punctuality'],
  [['deadlines', 'q6_q6_deadlines'], 'Meeting deadlines'],
  [['ownership', 'q7_q7_ownership'], 'Ownership'],
  [['instructions', 'q8_q8_instructions'], 'Following instructions'],
  [['performance', 'q9_q9_performance'], 'Performance'],
  [['output', 'q10_q10_output'], 'Quality of output'],
  [['disciplinary', 'q11_q11_disciplinary'], 'Disciplinary history'],
  [['issues', 'q12_q12_issues'], 'Known issues'],
  [['strengths', 'q13_q13_strengths'], 'Strengths'],
  [['weakness', 'q14_q14_weakness'], 'Areas for improvement'],
  [['rehire', 'q15_q15_rehire'], 'Would rehire'],
  [['comments', 'q16_q16_comments'], 'Additional comments'],
  [['feedback_date', 'q20_q20_datetime18'], 'Form date'],
] as const;

function valueFor(payload: unknown, keys: readonly string[]): string {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return '';
  const data = payload as Record<string, unknown>;
  for (const key of keys) {
    const value = data[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const date = value as Record<string, unknown>;
      if (typeof date.month === 'string' && typeof date.day === 'string' && typeof date.year === 'string') {
        return `${date.month}/${date.day}/${date.year}`;
      }
    }
  }
  return '';
}

export function ReferenceResponseModal({ refereeName, payload }: { refereeName: string; payload: unknown }) {
  const fields = RESPONSE_FIELDS.map(([keys, label]) => ({ label, value: valueFor(payload, keys) }))
    .filter(field => field.value);

  if (fields.length === 0) return null;

  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" size="sm" className="mt-3 h-8 gap-1.5 text-xs" />}>
        <Eye className="h-3.5 w-3.5" />
        View response
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Reference response</DialogTitle>
          <DialogDescription>{refereeName || 'Character reference'} questionnaire</DialogDescription>
        </DialogHeader>
        <dl className="space-y-4 text-sm">
          {fields.map(field => (
            <div key={field.label} className="rounded-lg border border-(--rs-neutral-grey-200) bg-(--rs-neutral-grey-50)/60 p-3">
              <dt className="text-xs font-semibold text-(--rs-neutral-grey-700)">{field.label}</dt>
              <dd className="mt-1 whitespace-pre-wrap leading-relaxed text-(--rs-neutral-grey-900)">{field.value}</dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}

function humanizeKey(key: string): string {
  return key.replace(/^q\d+_/, '').replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}

function displayValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const date = value as Record<string, unknown>;
    if (typeof date.month === 'string' && typeof date.day === 'string' && typeof date.year === 'string') return `${date.month}/${date.day}/${date.year}`;
  }
  return value == null ? '' : String(value);
}

export function EmploymentVerificationResponseModal({ company, payload }: { company: string; payload: unknown }) {
  const fields = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? Object.entries(payload as Record<string, unknown>)
      .map(([key, value]) => ({ label: humanizeKey(key), value: displayValue(value) }))
      .filter(field => field.value)
    : [];
  if (!fields.length) return null;
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" size="sm" className="mt-3 h-8 gap-1.5 text-xs" />}>
        <Eye className="h-3.5 w-3.5" /> View response
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Employment verification response</DialogTitle>
          <DialogDescription>{company || 'Employer'} questionnaire</DialogDescription>
        </DialogHeader>
        <dl className="space-y-4 text-sm">
          {fields.map(field => <div key={field.label} className="rounded-lg border border-(--rs-neutral-grey-200) bg-(--rs-neutral-grey-50)/60 p-3">
            <dt className="text-xs font-semibold text-(--rs-neutral-grey-700)">{field.label}</dt>
            <dd className="mt-1 whitespace-pre-wrap leading-relaxed text-(--rs-neutral-grey-900)">{field.value}</dd>
          </div>)}
        </dl>
      </DialogContent>
    </Dialog>
  );
}

'use client';

import { useState } from 'react';
import { CourseSummary } from '@/components/lms/course-summary';

// Markdown editor for a course summary with a live Preview tab. The textarea
// (name="description") stays mounted in both tabs so it always submits with the
// parent <form action={saveCourse}>; Preview just renders it the way learners
// will see it.
export function CourseSummaryEditor({ name, defaultValue }: { name: string; defaultValue: string }) {
  const [value, setValue] = useState(defaultValue);
  const [tab, setTab] = useState<'write' | 'preview'>('write');

  const tabBtn = (active: boolean) =>
    `px-3 py-1 text-xs font-medium rounded-md transition-colors ${
      active ? 'bg-white text-(--rs-primary-700) shadow-sm' : 'text-(--rs-neutral-grey-500) hover:text-(--rs-neutral-grey-700)'
    }`;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label className="block text-sm font-medium text-(--rs-neutral-grey-800)">
          Description <span className="text-(--rs-neutral-grey-400) font-normal">(Markdown)</span>
        </label>
        <div className="inline-flex items-center gap-0.5 rounded-lg bg-(--rs-neutral-grey-100) p-0.5">
          <button type="button" onClick={() => setTab('write')} className={tabBtn(tab === 'write')}>Write</button>
          <button type="button" onClick={() => setTab('preview')} className={tabBtn(tab === 'preview')}>Preview</button>
        </div>
      </div>

      {/* Always mounted so the field submits regardless of the active tab. */}
      <div className={tab === 'write' ? '' : 'hidden'}>
        <textarea
          name={name}
          value={value}
          onChange={e => setValue(e.target.value)}
          rows={8}
          placeholder={'Give learners a clear overview.\n\n**What you’ll learn**\n- Point one\n- Point two\n\nKeep paragraphs short and scannable.'}
          className="block w-full rounded-md border border-(--rs-neutral-grey-300) bg-white px-3 py-2 font-mono text-sm leading-relaxed outline-none focus:border-(--rs-primary-300) focus:ring-4 focus:ring-(--rs-primary-100)"
        />
      </div>

      {tab === 'preview' && (
        <div className="min-h-[12rem] rounded-md border border-(--rs-neutral-grey-200) bg-(--rs-neutral-grey-50) p-4">
          {value.trim()
            ? <CourseSummary md={value} />
            : <p className="text-sm italic text-(--rs-neutral-grey-400)">Nothing to preview yet.</p>}
        </div>
      )}

      <p className="text-xs text-(--rs-neutral-grey-400)">
        Markdown supported — <code className="text-(--rs-neutral-grey-600)">**bold**</code>, bullet lists, line breaks, and links.
        This renders as the “About this course” section learners see.
      </p>
    </div>
  );
}

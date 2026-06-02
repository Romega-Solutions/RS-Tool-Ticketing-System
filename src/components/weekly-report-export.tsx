'use client';

import { useState } from 'react';
import { FileSpreadsheet, ChevronDown, ChevronUp } from 'lucide-react';
import { MyReportButton } from '@/components/my-report-button';
import { GenerateReportButton } from '@/components/generate-report-button';

interface Props {
  /** `self` = download own report; `member` = pick any member (lead/admin). */
  variant: 'self' | 'member';
  /** Used for the download filename fallback in the `self` variant. */
  memberName?: string;
}

/**
 * Collapsible "Export to Excel" panel. Wraps the existing (tested) generate +
 * download logic so the legacy .xlsx capability lives inside the combined
 * Weekly Reports page without dominating the layout.
 */
export function ExcelExportPanel({ variant, memberName }: Props) {
  const [open, setOpen] = useState(false);

  const hint =
    variant === 'self'
      ? 'Download this week’s report as a formatted Excel (.xlsx) file.'
      : 'Generate a formatted Excel (.xlsx) report for any team member.';

  return (
    <div className="rounded-xl border border-(--rs-neutral-grey-200) bg-white overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left cursor-pointer hover:bg-(--rs-neutral-grey-50) transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--rs-primary-400)"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-green-50 text-green-600">
            <FileSpreadsheet className="w-4 h-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-(--rs-neutral-grey-900)">Export to Excel</p>
            <p className="text-xs text-(--rs-neutral-grey-500) truncate">{hint}</p>
          </div>
        </div>
        {open
          ? <ChevronUp className="w-4 h-4 shrink-0 text-(--rs-neutral-grey-400)" />
          : <ChevronDown className="w-4 h-4 shrink-0 text-(--rs-neutral-grey-400)" />
        }
      </button>

      {open && (
        <div className="border-t border-(--rs-neutral-grey-100) px-4 py-4">
          {variant === 'self'
            ? <MyReportButton memberName={memberName ?? 'Unknown'} />
            : <GenerateReportButton />}
        </div>
      )}
    </div>
  );
}

'use client';

import { useMemo, useState } from 'react';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Download, FileText, FileJson, FileSpreadsheet, Check, Users, ChevronDown, Loader2 } from 'lucide-react';
import {
  downloadTextFile,
  rowsToCsv,
  rowsToMarkdown,
  buildTimesheetCsv,
  buildWiseCsv,
  type ExportRow,
  type TimesheetMemberRow,
  type TimesheetMeta,
} from '@/lib/export-utils';

type ExportFormat = 'csv' | 'md' | 'json';
type DurationFormat = 'human' | 'decimal' | 'hms';
type CsvTemplate = 'standard' | 'timesheet' | 'wise';

interface Props {
  mode: 'weekly' | 'monthly';
  baseName: string;
  rows: ExportRow[];
  /** Metadata only (no row-array fields). Will be merged with filtered rows in the JSON payload. */
  jsonMeta?: Record<string, unknown>;
  rangeLabel: string;
  /** Weekly only — structured per-day hours for the Romega timesheet template. */
  timesheet?: { rows: TimesheetMemberRow[]; meta: TimesheetMeta };
  /** Payment reference written into the Wise payout template. */
  wisePaymentReference?: string;
  /** Member name → computed USD gross for the period (null = no rate set). */
  wiseAmounts?: Record<string, number | null>;
  /** Live USD→PHP snapshot applied to the timesheet template. */
  fx?: { rate: number; label: string };
}

const FORMAT_CARDS: { value: ExportFormat; label: string; icon: typeof FileText }[] = [
  { value: 'csv',  label: 'CSV',      icon: FileSpreadsheet },
  { value: 'md',   label: 'Markdown', icon: FileText        },
  { value: 'json', label: 'JSON',     icon: FileJson        },
];

const DURATION_LABEL: Record<DurationFormat, string> = {
  human:   'Xh Ym  (7h 50m)',
  decimal: 'Decimal hours  (7.83 h)',
  hms:     'HH:MM:SS  (07:50:00)',
};

const DURATION_KEYS_WEEKLY  = ['saturday_hours', 'sunday_hours', 'week_total_hours'] as const;
const DURATION_KEYS_MONTHLY = ['total_hours'] as const;

function reformatDurationCell(value: string, target: DurationFormat): string {
  if (target === 'human') return value;
  const hMatch = value.match(/(\d+)\s*h/);
  const mMatch = value.match(/(\d+)\s*m/);
  if (!hMatch && !mMatch) return value;
  const hours   = hMatch ? parseInt(hMatch[1], 10) : 0;
  const minutes = mMatch ? parseInt(mMatch[1], 10) : 0;
  const totalMin = hours * 60 + minutes;
  if (target === 'decimal') return `${(totalMin / 60).toFixed(2)} h`;
  const hh = String(Math.floor(totalMin / 60)).padStart(2, '0');
  const mm = String(totalMin % 60).padStart(2, '0');
  return `${hh}:${mm}:00`;
}

export function AttendanceExportSheet({ mode, baseName, rows, jsonMeta, rangeLabel, timesheet, wisePaymentReference, wiseAmounts, fx }: Props) {
  const [open, setOpen] = useState(false);
  const [exporting, setExporting]                 = useState(false);
  const [format, setFormat]                       = useState<ExportFormat>('csv');
  const [csvTemplate, setCsvTemplate]             = useState<CsvTemplate>('standard');
  const [includeNotes, setIncludeNotes]           = useState(true);
  const [includeWeekendHours, setIncludeWeekendHours] = useState(true);
  const [includeTotals, setIncludeTotals]         = useState(true);
  const [durationFormat, setDurationFormat]       = useState<DurationFormat>('human');
  const [memberPickerOpen, setMemberPickerOpen]   = useState(false);
  // `null` ⇒ "all members selected" (the default, tracks upstream list automatically).
  // Set<string> ⇒ user has made a custom selection.
  const [customSelection, setCustomSelection]     = useState<Set<string> | null>(null);

  const allMembers = useMemo(
    () => Array.from(new Set(rows.map(r => String(r.member ?? '')).filter(Boolean))).sort(),
    [rows],
  );

  const selectedMembers = useMemo(
    () => customSelection ?? new Set(allMembers),
    [customSelection, allMembers],
  );
  const allSelected = customSelection === null || (customSelection.size === allMembers.length && allMembers.every(m => customSelection.has(m)));

  const triggerLabel = mode === 'weekly' ? 'Export Week' : 'Export Month';
  const sheetTitle   = mode === 'weekly' ? 'Export Weekly Attendance Data' : 'Export Monthly Attendance Data';

  const durationKeys: readonly string[] = mode === 'weekly' ? DURATION_KEYS_WEEKLY : DURATION_KEYS_MONTHLY;

  const filteredRows = useMemo(() => {
    let out = rows.filter(r => selectedMembers.has(String(r.member ?? '')));

    out = out.map(r => {
      const next: ExportRow = {};
      for (const [key, val] of Object.entries(r)) {
        // Drop notes when excluded — only meaningful in weekly mode.
        if (mode === 'weekly' && !includeNotes && key === 'notes') continue;
        // Drop weekend-hours columns when excluded (weekly only).
        if (mode === 'weekly' && !includeWeekendHours && (key === 'saturday_hours' || key === 'sunday_hours')) continue;
        // Drop totals when excluded.
        if (!includeTotals && (key === 'week_total_hours' || key === 'total_hours')) continue;

        // Reformat duration cells.
        if (durationKeys.includes(key) && typeof val === 'string' && val.trim() !== '') {
          next[key] = reformatDurationCell(val, durationFormat);
        } else {
          next[key] = val;
        }
      }
      return next;
    });

    return out;
  }, [rows, mode, includeNotes, includeWeekendHours, includeTotals, durationFormat, selectedMembers, durationKeys]);

  // Templates only apply to CSV; Markdown/JSON always use the standard shape.
  const activeTemplate: CsvTemplate = format === 'csv' ? csvTemplate : 'standard';
  const canTimesheet = mode === 'weekly' && !!timesheet;

  const selectedTimesheetRows = useMemo(
    () => (timesheet ? timesheet.rows.filter(r => selectedMembers.has(r.name)) : []),
    [timesheet, selectedMembers],
  );
  const selectedMemberNames = useMemo(
    () => allMembers.filter(m => selectedMembers.has(m)),
    [allMembers, selectedMembers],
  );

  const rowCount =
    activeTemplate === 'timesheet' ? selectedTimesheetRows.length
    : activeTemplate === 'wise'    ? selectedMemberNames.length
    : filteredRows.length;
  const disabled = rowCount === 0;

  // Builds the file synchronously. Kept separate so handleExport can yield a
  // frame first — that lets the button paint its busy state before a large
  // dataset is serialized, avoiding a frozen-looking UI on big exports.
  function buildAndDownload() {
    const dateSuffix = new Date().toISOString().slice(0, 10);

    if (format === 'csv' && activeTemplate === 'timesheet' && timesheet) {
      downloadTextFile(
        buildTimesheetCsv(selectedTimesheetRows, timesheet.meta, fx),
        `${baseName}_timesheet_${dateSuffix}.csv`,
        'text/csv',
      );
      return;
    }
    if (format === 'csv' && activeTemplate === 'wise') {
      const recipients = selectedMemberNames.map(name => ({
        name,
        amountUsd: wiseAmounts?.[name] ?? null,
      }));
      downloadTextFile(
        buildWiseCsv(recipients, { paymentReference: wisePaymentReference ?? rangeLabel }),
        `${baseName}_wise_${dateSuffix}.csv`,
        'text/csv',
      );
      return;
    }

    const filename = `${baseName}_${dateSuffix}.${format}`;
    if (format === 'csv') {
      downloadTextFile(rowsToCsv(filteredRows), filename, 'text/csv');
    } else if (format === 'md') {
      downloadTextFile(rowsToMarkdown(filteredRows), filename, 'text/markdown');
    } else {
      const payload = { ...(jsonMeta ?? {}), rows: filteredRows };
      downloadTextFile(JSON.stringify(payload, null, 2), filename, 'application/json');
    }
  }

  async function handleExport() {
    if (exporting) return;
    setExporting(true);
    // Yield one frame so the "Exporting…" state renders before the (possibly
    // heavy) serialization runs on the main thread.
    await new Promise(resolve => setTimeout(resolve, 0));
    try {
      buildAndDownload();
      setOpen(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  }

  function toggleMember(name: string) {
    setCustomSelection(prev => {
      const base = prev ?? new Set(allMembers);
      const next = new Set(base);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function toggleAllMembers() {
    setCustomSelection(allSelected ? new Set() : null);
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button variant="outline" size="sm" disabled={rows.length === 0}>
            <Download className="w-4 h-4" />
            {triggerLabel}
          </Button>
        }
      />
      <SheetContent
        side="right"
        className="w-full sm:max-w-md flex flex-col bg-white"
      >
        <SheetHeader className="border-b border-(--rs-neutral-grey-200) px-5 py-4">
          <SheetTitle className="text-lg font-serif text-(--rs-neutral-grey-900)">
            {sheetTitle}
          </SheetTitle>
          <SheetDescription className="text-xs text-(--rs-neutral-grey-500)">
            {rangeLabel}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
          {/* File format */}
          <section className="space-y-2.5">
            <h3 className="text-sm font-semibold text-(--rs-neutral-grey-800)">File format</h3>
            <div className="grid grid-cols-3 gap-2.5">
              {FORMAT_CARDS.map(card => {
                const Icon = card.icon;
                const active = format === card.value;
                return (
                  <button
                    key={card.value}
                    type="button"
                    onClick={() => setFormat(card.value)}
                    className={`relative flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 px-3 py-4 transition-all ${
                      active
                        ? 'border-(--rs-accent-500) bg-(--rs-accent-50)'
                        : 'border-(--rs-neutral-grey-200) bg-white hover:border-(--rs-neutral-grey-300) hover:bg-(--rs-neutral-grey-50)'
                    }`}
                  >
                    {active && (
                      <span className="absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-(--rs-accent-500) text-white">
                        <Check className="w-2.5 h-2.5" strokeWidth={3} />
                      </span>
                    )}
                    <Icon className={`w-7 h-7 ${active ? 'text-(--rs-accent-600)' : 'text-(--rs-neutral-grey-400)'}`} />
                    <span className={`text-xs font-medium ${active ? 'text-(--rs-accent-700)' : 'text-(--rs-neutral-grey-600)'}`}>
                      {card.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* CSV template */}
          {format === 'csv' && (
            <section className="space-y-2.5">
              <h3 className="text-sm font-semibold text-(--rs-neutral-grey-800)">CSV template</h3>
              <div className="relative">
                <select
                  value={csvTemplate}
                  onChange={e => setCsvTemplate(e.target.value as CsvTemplate)}
                  className="w-full appearance-none rounded-md border border-(--rs-neutral-grey-200) bg-white px-3 py-2 pr-8 text-sm text-(--rs-neutral-grey-900) hover:border-(--rs-neutral-grey-300) focus:outline-none focus:border-(--rs-primary-500) focus:ring-2 focus:ring-(--rs-primary-100)"
                >
                  <option value="standard">Standard (one row per member)</option>
                  {canTimesheet && <option value="timesheet">Weekly Timesheet — Romega payroll layout</option>}
                  <option value="wise">Wise payout — Selected-recipients template</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-(--rs-neutral-grey-400)" />
              </div>
              {activeTemplate === 'timesheet' && (
                <p className="text-[11px] text-(--rs-neutral-grey-400)">
                  Per-day clocked hours Mon–Sun with totals footer. RATE/GROSS use each member’s USD rate (blank if no rate set)
                  {fx ? `, plus live PHP columns at ₱${fx.rate.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/$1.` : '. (Live PHP rate unavailable — USD only.)'}
                </p>
              )}
              {activeTemplate === 'wise' && (
                <p className="text-[11px] text-(--rs-neutral-grey-400)">
                  Wise upload — amount is the computed USD gross (hours × rate); blank if no rate set. recipientId stays blank — confirm recipients before sending. Reference: “{wisePaymentReference ?? rangeLabel}”.
                </p>
              )}
            </section>
          )}

          {/* Include (optional) */}
          {activeTemplate === 'standard' && (
          <section className="space-y-2.5">
            <h3 className="text-sm font-semibold text-(--rs-neutral-grey-800)">Include (optional)</h3>
            <div className="space-y-2">
              <CheckOption
                checked={includeTotals}
                onChange={setIncludeTotals}
                label={mode === 'weekly' ? 'Weekly total hours' : 'Monthly total hours'}
              />
              {mode === 'weekly' && (
                <>
                  <CheckOption
                    checked={includeWeekendHours}
                    onChange={setIncludeWeekendHours}
                    label="Saturday / Sunday hours columns"
                  />
                  <CheckOption
                    checked={includeNotes}
                    onChange={setIncludeNotes}
                    label="Attendance notes"
                  />
                </>
              )}
            </div>
          </section>
          )}

          {/* Date range (read-only display) */}
          <section className="space-y-2.5">
            <h3 className="text-sm font-semibold text-(--rs-neutral-grey-800)">Date range</h3>
            <div className="rounded-md border border-(--rs-neutral-grey-200) bg-(--rs-neutral-grey-50) px-3 py-2.5">
              <div className="text-[10px] font-bold uppercase tracking-wide text-(--rs-neutral-grey-400)">
                {mode === 'weekly' ? 'Week' : 'Month'}
              </div>
              <div className="text-sm font-medium text-(--rs-neutral-grey-900) mt-0.5">
                {rangeLabel}
              </div>
            </div>
            <p className="text-[11px] text-(--rs-neutral-grey-400)">
              Change the range from the {mode === 'weekly' ? 'week' : 'month'} navigator on the page.
            </p>
          </section>

          {/* Filter by — Members */}
          <section className="space-y-2.5">
            <h3 className="text-sm font-semibold text-(--rs-neutral-grey-800)">Filter by</h3>
            <div className="rounded-md border border-(--rs-neutral-grey-200) bg-white">
              <button
                type="button"
                onClick={() => setMemberPickerOpen(o => !o)}
                className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-(--rs-neutral-grey-50)"
              >
                <span className="flex items-center gap-2 text-(--rs-neutral-grey-700)">
                  <Users className="w-3.5 h-3.5 text-(--rs-neutral-grey-400)" />
                  Members
                  <span className="ml-1 inline-flex items-center justify-center rounded-full bg-(--rs-primary-50) px-1.5 text-[10px] font-semibold text-(--rs-primary-700)">
                    {allSelected ? 'All' : `${selectedMembers.size}/${allMembers.length}`}
                  </span>
                </span>
                <ChevronDown
                  className={`w-3.5 h-3.5 text-(--rs-neutral-grey-400) transition-transform ${memberPickerOpen ? 'rotate-180' : ''}`}
                />
              </button>
              {memberPickerOpen && (
                <div className="border-t border-(--rs-neutral-grey-200) max-h-56 overflow-y-auto">
                  <button
                    type="button"
                    onClick={toggleAllMembers}
                    className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-(--rs-primary-600) hover:bg-(--rs-neutral-grey-50) border-b border-(--rs-neutral-grey-100)"
                  >
                    {allSelected ? 'Clear all' : 'Select all'}
                  </button>
                  {allMembers.length === 0 ? (
                    <p className="px-3 py-2 text-xs italic text-(--rs-neutral-grey-400)">No members available.</p>
                  ) : (
                    allMembers.map(name => {
                      const checked = selectedMembers.has(name);
                      return (
                        <button
                          key={name}
                          type="button"
                          onClick={() => toggleMember(name)}
                          className="flex w-full items-center gap-2.5 px-3 py-2 text-sm hover:bg-(--rs-neutral-grey-50) text-left"
                        >
                          <span
                            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                              checked
                                ? 'border-(--rs-primary-500) bg-(--rs-primary-500)'
                                : 'border-(--rs-neutral-grey-300) bg-white'
                            }`}
                          >
                            {checked && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                          </span>
                          <span className="truncate text-(--rs-neutral-grey-800)">{name}</span>
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          </section>

          {/* Duration format */}
          {activeTemplate === 'standard' && (
          <section className="space-y-2.5">
            <h3 className="text-sm font-semibold text-(--rs-neutral-grey-800)">Duration format</h3>
            <div className="relative">
              <select
                value={durationFormat}
                onChange={e => setDurationFormat(e.target.value as DurationFormat)}
                className="w-full appearance-none rounded-md border border-(--rs-neutral-grey-200) bg-white px-3 py-2 pr-8 text-sm text-(--rs-neutral-grey-900) hover:border-(--rs-neutral-grey-300) focus:outline-none focus:border-(--rs-primary-500) focus:ring-2 focus:ring-(--rs-primary-100)"
              >
                {(['human', 'decimal', 'hms'] as DurationFormat[]).map(opt => (
                  <option key={opt} value={opt}>{DURATION_LABEL[opt]}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-(--rs-neutral-grey-400)" />
            </div>
          </section>
          )}

          <div className="text-[11px] text-(--rs-neutral-grey-400) pt-2 border-t border-(--rs-neutral-grey-100)">
            {activeTemplate === 'timesheet'
              ? `${rowCount} ${rowCount === 1 ? 'member' : 'members'} will be exported (2 rows each + totals).`
              : `${rowCount} ${rowCount === 1 ? 'row' : 'rows'} will be exported.`}
          </div>
        </div>

        <SheetFooter className="flex-row items-center justify-end gap-2 border-t border-(--rs-neutral-grey-200) px-5 py-3.5">
          <SheetClose
            render={
              <Button variant="ghost" size="sm">Cancel</Button>
            }
          />
          <Button
            size="sm"
            onClick={handleExport}
            disabled={disabled || exporting}
            className="bg-(--rs-accent-500) text-white hover:bg-(--rs-accent-600)"
          >
            {exporting
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Download className="w-3.5 h-3.5" />}
            {exporting ? 'Exporting…' : 'Export'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function CheckOption({
  checked, onChange, label,
}: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2.5 cursor-pointer group">
      <span
        className={`relative flex h-4 w-4 items-center justify-center rounded border transition-colors ${
          checked
            ? 'border-(--rs-primary-500) bg-(--rs-primary-500)'
            : 'border-(--rs-neutral-grey-300) bg-white group-hover:border-(--rs-neutral-grey-400)'
        }`}
      >
        {checked && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="sr-only"
      />
      <span className="text-sm text-(--rs-neutral-grey-700)">{label}</span>
    </label>
  );
}

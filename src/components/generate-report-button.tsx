'use client';

import { useState, useEffect } from 'react';
import { FileText, Loader2, Users, Check, ChevronDown, ChevronUp, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';

type WorkspaceMember = { id: string; display_name: string; email: string };
type MembersResponse = { members?: WorkspaceMember[]; error?: string };

function initials(name: string): string {
  return name.split(' ').map(w => w[0] ?? '').join('').toUpperCase().slice(0, 2);
}

export function GenerateReportButton({ onGenerated }: { onGenerated?: () => void | Promise<void> }) {
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [membersError, setMembersError] = useState('');
  const [pickerOpen, setPickerOpen] = useState(true);

  const [selected, setSelected] = useState<WorkspaceMember | null>(null);
  const [generating, setGenerating] = useState(false);
  const [successName, setSuccessName] = useState('');
  const [genError, setGenError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setMembersLoading(true);
      setMembersError('');
      try {
        const res = await fetch('/api/reports/members');
        const data = (await res.json()) as MembersResponse;
        if (cancelled) return;
        if (!res.ok) { setMembersError(data.error || 'Failed to load members.'); return; }
        setMembers(data.members ?? []);
      } catch {
        if (!cancelled) setMembersError('Failed to load workspace members.');
      } finally {
        if (!cancelled) setMembersLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const handleGenerate = async () => {
    if (!selected) return;
    setGenerating(true);
    setSuccessName('');
    setGenError('');

    try {
      const res = await fetch('/api/reports/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetMemberId: selected.id,
          targetMemberName: selected.display_name,
        }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setGenError(data.error || 'Failed to generate report.');
        return;
      }

      // Extract filename from Content-Disposition header
      const disposition = res.headers.get('Content-Disposition') ?? '';
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] ?? `${selected.display_name}_Weekly_Report.xlsx`;

      // Trigger browser download from the binary response
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);

      setSuccessName(selected.display_name);
      await onGenerated?.();
    } catch {
      setGenError('Request failed. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 w-full md:max-w-xl">
      {/* Member picker */}
      <div className="rounded-xl border border-(--rs-neutral-grey-200) bg-white overflow-hidden">
        <button
          type="button"
          onClick={() => setPickerOpen(o => !o)}
          className="w-full flex items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-(--rs-neutral-grey-700) hover:bg-(--rs-neutral-grey-50) transition-colors"
        >
          <div className="flex items-center gap-2 min-w-0">
            {membersLoading
              ? <Loader2 className="w-4 h-4 text-(--rs-primary-500) shrink-0 animate-spin" />
              : <Users className="w-4 h-4 text-(--rs-primary-500) shrink-0" />
            }
            {selected ? (
              <span className="truncate">
                <span className="text-(--rs-neutral-grey-900) font-semibold">{selected.display_name}</span>
                <span className="text-(--rs-neutral-grey-400) ml-1.5">{selected.email}</span>
              </span>
            ) : membersLoading ? (
              <span className="text-(--rs-neutral-grey-400)">Loading members…</span>
            ) : (
              <span className="text-(--rs-neutral-grey-400)">Select a member to generate report for…</span>
            )}
          </div>
          {pickerOpen
            ? <ChevronUp className="w-4 h-4 shrink-0 text-(--rs-neutral-grey-400)" />
            : <ChevronDown className="w-4 h-4 shrink-0 text-(--rs-neutral-grey-400)" />
          }
        </button>

        {pickerOpen && (
          <div className="border-t border-(--rs-neutral-grey-100) max-h-56 overflow-y-auto divide-y divide-(--rs-neutral-grey-100)">
            {membersLoading && (
              <div className="flex items-center gap-2 px-4 py-3 text-(--rs-neutral-grey-400) text-sm">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading members…
              </div>
            )}
            {membersError && (
              <div className="px-4 py-3 text-sm text-red-600">{membersError}</div>
            )}
            {!membersLoading && !membersError && members.length === 0 && (
              <div className="px-4 py-3 text-sm text-(--rs-neutral-grey-400) italic">No members found.</div>
            )}
            {members.map(m => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  setSelected(m);
                  setPickerOpen(false);
                  setSuccessName('');
                  setGenError('');
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                  selected?.id === m.id
                    ? 'bg-(--rs-primary-50)'
                    : 'hover:bg-(--rs-neutral-grey-50)'
                }`}
              >
                <div className="w-8 h-8 rounded-full bg-(--rs-primary-100) text-(--rs-primary-700) flex items-center justify-center text-xs font-bold shrink-0">
                  {initials(m.display_name)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-(--rs-neutral-grey-900)">{m.display_name}</div>
                  <div className="text-xs text-(--rs-neutral-grey-400) truncate">{m.email}</div>
                </div>
                {selected?.id === m.id && (
                  <Check className="w-4 h-4 text-(--rs-primary-500) shrink-0" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Generate button */}
      <Button onClick={handleGenerate} disabled={generating || !selected} className="self-start">
        {generating
          ? <Loader2 className="w-4 h-4 animate-spin" />
          : <FileText className="w-4 h-4" />
        }
        {generating
          ? `Generating for ${selected?.display_name}…`
          : selected
          ? `Generate Report for ${selected.display_name}`
          : 'Select a member first'}
      </Button>

      {/* Success */}
      {successName && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900 flex items-center gap-2">
          <Download className="w-4 h-4 shrink-0 text-green-600" />
          <span>
            <span className="font-medium">Report downloaded</span> for {successName}. Check your Downloads folder.
          </span>
        </div>
      )}

      {/* Error */}
      {genError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
          <p className="font-medium">{genError}</p>
        </div>
      )}
    </div>
  );
}

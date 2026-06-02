'use client';

import { useState } from 'react';
import { FileSpreadsheet, Loader2, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function MyReportButton({
  memberName,
}: {
  memberName: string;
}) {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleGenerate = async () => {
    setGenerating(true);
    setError('');
    setSuccess(false);
    try {
      const res = await fetch('/api/reports/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error || 'Failed to generate report.');
        return;
      }

      const disposition = res.headers.get('Content-Disposition') ?? '';
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] ?? `${memberName}_Weekly_Report.xlsx`;

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);

      setSuccess(true);
    } catch {
      setError('Request failed. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-3">
      <Button
        onClick={handleGenerate}
        disabled={generating}
        className="bg-(--rs-primary-500) hover:bg-(--rs-primary-600) text-white"
      >
        {generating
          ? <Loader2 className="w-4 h-4 animate-spin" />
          : <FileSpreadsheet className="w-4 h-4" />}
        {generating ? 'Generating…' : 'Download My Report (.xlsx)'}
      </Button>

      {success && (
        <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 px-3 py-2.5 rounded-lg">
          <Download className="w-4 h-4 shrink-0" />
          Report downloaded. Check your Downloads folder.
        </div>
      )}

      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 px-3 py-2.5 rounded-lg">
          {error}
        </div>
      )}
    </div>
  );
}

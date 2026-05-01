'use client';

import { useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

type GenerateResponse = {
  success?: boolean;
  message?: string;
  savedPath?: string | null;
  stdout?: string;
  stderr?: string;
  error?: string;
};

type GenerateReportButtonProps = {
  onGenerated?: () => void | Promise<void>;
};

export function GenerateReportButton({ onGenerated }: GenerateReportButtonProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GenerateResponse | null>(null);
  const [error, setError] = useState('');

  const handleGenerate = async () => {
    setLoading(true);
    setResult(null);
    setError('');

    try {
      const res = await fetch('/api/reports/generate', {
        method: 'POST',
      });
      const data = (await res.json()) as GenerateResponse;

      if (!res.ok) {
        setError(data.error || 'Failed to generate report.');
        return;
      }

      setResult(data);
      await onGenerated?.();
    } catch {
      setError('Request failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-start gap-2 w-full md:max-w-xl">
      <Button onClick={handleGenerate} disabled={loading}>
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
        {loading ? 'Generating...' : 'Generate My Weekly Report'}
      </Button>

      {result ? (
        <div className="w-full rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-900 space-y-2">
          <p className="font-medium">{result.message || 'Report generated successfully.'}</p>
          {result.savedPath ? <p className="break-all">Saved to: {result.savedPath}</p> : null}
          {result.stdout ? (
            <details>
              <summary className="cursor-pointer font-medium">Generation details</summary>
              <pre className="mt-2 whitespace-pre-wrap text-xs bg-white/80 rounded border border-green-100 p-2">{result.stdout}</pre>
            </details>
          ) : null}
          {result.stderr ? (
            <details>
              <summary className="cursor-pointer font-medium text-amber-700">Warnings</summary>
              <pre className="mt-2 whitespace-pre-wrap text-xs bg-amber-50 rounded border border-amber-200 p-2 text-amber-800">{result.stderr}</pre>
            </details>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}

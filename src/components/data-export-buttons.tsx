'use client';

import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { downloadTextFile, rowsToCsv, rowsToMarkdown, type ExportRow } from '@/lib/export-utils';

interface Props {
  baseName: string;
  rows: ExportRow[];
  jsonData?: unknown;
  title?: string;
}

export function DataExportButtons({ baseName, rows, jsonData, title = 'Export' }: Props) {
  const disabled = rows.length === 0;

  function handleExport(format: 'csv' | 'md' | 'json') {
    const dateSuffix = new Date().toISOString().slice(0, 10);
    const filename = `${baseName}_${dateSuffix}.${format}`;

    if (format === 'csv') {
      downloadTextFile(rowsToCsv(rows), filename, 'text/csv');
      return;
    }

    if (format === 'md') {
      downloadTextFile(rowsToMarkdown(rows), filename, 'text/markdown');
      return;
    }

    downloadTextFile(JSON.stringify(jsonData ?? rows, null, 2), filename, 'application/json');
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-(--rs-neutral-grey-400) uppercase tracking-wide">{title}</span>
      <Button variant="outline" size="sm" onClick={() => handleExport('csv')} disabled={disabled}>
        <Download className="w-4 h-4" />
        CSV
      </Button>
      <Button variant="outline" size="sm" onClick={() => handleExport('md')} disabled={disabled}>
        <Download className="w-4 h-4" />
        Markdown
      </Button>
      <Button variant="outline" size="sm" onClick={() => handleExport('json')} disabled={disabled}>
        <Download className="w-4 h-4" />
        JSON
      </Button>
    </div>
  );
}

'use client';

import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { downloadTextFile, rowsToCsv, type ExportRow } from '@/lib/export-utils';

type LeadExportRow = {
  name: string;
  email: string;
  company: string;
  stage: string;
  value: string;
  added: string;
  notes: string;
};

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function buildDocumentHtml(rows: LeadExportRow[], title: string, summary: { total: number; open: number; won: number; lost: number }) {
  const bodyRows = rows.map(row => `
    <tr>
      <td>${escapeHtml(row.name)}</td>
      <td>${escapeHtml(row.company)}</td>
      <td>${escapeHtml(row.email)}</td>
      <td>${escapeHtml(row.stage)}</td>
      <td>${escapeHtml(row.value)}</td>
      <td>${escapeHtml(row.added)}</td>
      <td>${escapeHtml(row.notes)}</td>
    </tr>
  `).join('');

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(title)}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 24px; color: #0f172a; }
          h1 { margin: 0 0 8px; font-size: 24px; }
          p { margin: 0 0 16px; color: #475569; }
          .summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin: 20px 0 24px; }
          .summary div { border: 1px solid #cbd5e1; border-radius: 10px; padding: 12px; }
          .summary strong { display: block; font-size: 11px; text-transform: uppercase; color: #64748b; margin-bottom: 4px; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; vertical-align: top; }
          th { background: #f8fafc; text-transform: uppercase; font-size: 11px; letter-spacing: .04em; }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(title)}</h1>
        <p>Exported ${new Date().toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}</p>
        <div class="summary">
          <div><strong>Total leads</strong>${summary.total}</div>
          <div><strong>Open</strong>${summary.open}</div>
          <div><strong>Won</strong>${summary.won}</div>
          <div><strong>Lost</strong>${summary.lost}</div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Company</th>
              <th>Email</th>
              <th>Stage</th>
              <th>Value</th>
              <th>Added</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>${bodyRows}</tbody>
        </table>
      </body>
    </html>
  `;
}

export function SalesLeadExportButtons({
  title,
  rows,
}: {
  title: string;
  rows: LeadExportRow[];
}) {
  const disabled = rows.length === 0;
  const csvRows: ExportRow[] = rows;
  const summary = {
    total: rows.length,
    open: rows.filter(row => !['won', 'lost'].includes(row.stage.toLowerCase())).length,
    won: rows.filter(row => row.stage.toLowerCase() === 'won').length,
    lost: rows.filter(row => row.stage.toLowerCase() === 'lost').length,
  };

  function handleExport(format: 'csv' | 'doc' | 'pdf') {
    const dateSuffix = new Date().toISOString().slice(0, 10);
    const baseName = `sales_leads_${dateSuffix}`;

    if (format === 'csv') {
      downloadTextFile(rowsToCsv(csvRows), `${baseName}.csv`, 'text/csv');
      return;
    }

    const html = buildDocumentHtml(rows, title, summary);

    if (format === 'doc') {
      downloadTextFile(html, `${baseName}.doc`, 'application/msword');
      return;
    }

    const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=1100,height=800');
    if (!printWindow) return;
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    window.setTimeout(() => {
      printWindow.print();
    }, 250);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium uppercase tracking-wide text-(--rs-neutral-grey-400)">Export current view</span>
      <Button variant="outline" size="sm" onClick={() => handleExport('csv')} disabled={disabled}>
        <Download className="w-4 h-4" />
        CSV
      </Button>
      <Button variant="outline" size="sm" onClick={() => handleExport('doc')} disabled={disabled}>
        <Download className="w-4 h-4" />
        Word
      </Button>
      <Button variant="outline" size="sm" onClick={() => handleExport('pdf')} disabled={disabled}>
        <Download className="w-4 h-4" />
        PDF
      </Button>
    </div>
  );
}

export type ExportCell = string | number | boolean | null | undefined;
export type ExportRow = Record<string, ExportCell>;

function stringifyCell(value: ExportCell): string {
  if (value == null) return '';
  return String(value);
}

function escapeCsvCell(value: ExportCell): string {
  const cell = stringifyCell(value);
  if (/[",\n]/.test(cell)) {
    return `"${cell.replace(/"/g, '""')}"`;
  }
  return cell;
}

export function rowsToCsv(rows: ExportRow[]): string {
  if (rows.length === 0) return '';

  const headers = Array.from(new Set(rows.flatMap(row => Object.keys(row))));
  const lines = [
    headers.join(','),
    ...rows.map(row => headers.map(header => escapeCsvCell(row[header])).join(',')),
  ];
  return lines.join('\n');
}

export function rowsToMarkdown(rows: ExportRow[]): string {
  if (rows.length === 0) return '_No data_';

  const headers = Array.from(new Set(rows.flatMap(row => Object.keys(row))));
  const headerRow = `| ${headers.join(' | ')} |`;
  const separatorRow = `| ${headers.map(() => '---').join(' | ')} |`;
  const bodyRows = rows.map(row => {
    const cells = headers.map(header => stringifyCell(row[header]).replace(/\n/g, '<br />').replace(/\|/g, '\\|'));
    return `| ${cells.join(' | ')} |`;
  });

  return [headerRow, separatorRow, ...bodyRows].join('\n');
}

export function downloadTextFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}


'use client';

import { useState } from 'react';
import { Download, Loader2, RefreshCcw, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';

type ReportFile = {
  name: string;
  size: number;
  modifiedAt: string;
};

type FilesResponse = {
  files?: ReportFile[];
  error?: string;
};

type MembersResponse = {
  success?: boolean;
  stdout?: string;
  stderr?: string;
  error?: string;
};

type ReportsManagementPanelProps = {
  initialFiles?: ReportFile[];
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ReportsManagementPanel({ initialFiles = [] }: ReportsManagementPanelProps) {
  const [files, setFiles] = useState<ReportFile[]>(initialFiles);
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesError, setFilesError] = useState('');

  const [membersLoading, setMembersLoading] = useState(false);
  const [membersOutput, setMembersOutput] = useState('');
  const [membersWarnings, setMembersWarnings] = useState('');
  const [membersError, setMembersError] = useState('');

  const loadFiles = async () => {
    setFilesLoading(true);
    setFilesError('');
    try {
      const res = await fetch('/api/reports/history', { cache: 'no-store' });
      const data = (await res.json()) as FilesResponse;
      if (!res.ok) {
        setFilesError(data.error || 'Failed to load generated files.');
        return;
      }
      setFiles(data.files || []);
    } catch {
      setFilesError('Failed to load generated files.');
    } finally {
      setFilesLoading(false);
    }
  };

  const loadMembers = async () => {
    setMembersLoading(true);
    setMembersOutput('');
    setMembersWarnings('');
    setMembersError('');
    try {
      const res = await fetch('/api/reports/members', { method: 'POST' });
      const data = (await res.json()) as MembersResponse;
      if (!res.ok) {
        setMembersError(data.error || 'Failed to load members.');
        return;
      }
      setMembersOutput(data.stdout || '');
      setMembersWarnings(data.stderr || '');
    } catch {
      setMembersError('Failed to load members.');
    } finally {
      setMembersLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-md border border-slate-200 bg-white p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-serif text-lg font-bold text-(--rs-neutral-grey-900)">Generated Files</h2>
          <Button variant="outline" onClick={loadFiles} disabled={filesLoading}>
            {filesLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
            Refresh
          </Button>
        </div>

        {filesError ? <p className="text-sm text-red-600">{filesError}</p> : null}
        {!filesLoading && !filesError && files.length === 0 ? (
          <p className="text-sm text-slate-600">No reports found yet.</p>
        ) : null}

        {files.length > 0 ? (
          <div className="space-y-2">
            {files.map((file) => (
              <div
                key={file.name}
                className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 rounded border border-slate-200 p-3"
              >
                <div className="min-w-0">
                  <p className="font-medium text-sm break-all">{file.name}</p>
                  <p className="text-xs text-slate-500">
                    {formatBytes(file.size)} • {new Date(file.modifiedAt).toLocaleString()}
                  </p>
                </div>
                <a
                  href={`/api/reports/download?name=${encodeURIComponent(file.name)}`}
                  className="inline-flex items-center gap-2 text-sm text-(--rs-primary-500) hover:underline"
                >
                  <Download className="w-4 h-4" />
                  Download
                </a>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-serif text-lg font-bold text-(--rs-neutral-grey-900)">Workspace Users (Plane)</h2>
          <Button variant="outline" onClick={loadMembers} disabled={membersLoading}>
            {membersLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
            Load Users
          </Button>
        </div>

        {membersError ? <p className="text-sm text-red-600">{membersError}</p> : null}
        {membersOutput ? (
          <pre className="whitespace-pre-wrap text-xs bg-slate-50 rounded border border-slate-200 p-3">{membersOutput}</pre>
        ) : null}
        {membersWarnings ? (
          <pre className="whitespace-pre-wrap text-xs bg-amber-50 rounded border border-amber-200 p-3 text-amber-800">{membersWarnings}</pre>
        ) : null}
      </section>
    </div>
  );
}

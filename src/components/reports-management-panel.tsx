'use client';

import { useState } from 'react';
import { Download, Loader2, RefreshCcw, Users, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataExportButtons } from '@/components/data-export-buttons';

type ReportFile = {
  name: string;
  size: number;
  modifiedAt: string;
};

type WorkspaceMember = {
  id: string;
  display_name: string;
  email: string;
};

type FilesResponse = { files?: ReportFile[]; error?: string };
type MembersResponse = { members?: WorkspaceMember[]; error?: string };

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function initials(name: string): string {
  return name
    .split(' ')
    .map(w => w[0] ?? '')
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      onClick={handleCopy}
      title="Copy ID"
      className="inline-flex items-center gap-1 text-xs text-(--rs-primary-600) hover:text-(--rs-primary-800) transition-colors"
    >
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      {copied ? 'Copied!' : 'Copy ID'}
    </button>
  );
}

export function ReportsManagementPanel({ initialFiles = [] }: { initialFiles?: ReportFile[] }) {
  const [files, setFiles] = useState<ReportFile[]>(initialFiles);
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesError, setFilesError] = useState('');

  const [members, setMembers] = useState<WorkspaceMember[] | null>(null);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState('');

  const fileExportRows = files.map(file => ({
    name: file.name,
    size_bytes: file.size,
    modified_at: file.modifiedAt,
  }));

  const memberExportRows = (members ?? []).map(member => ({
    id: member.id,
    display_name: member.display_name,
    email: member.email,
  }));

  const loadFiles = async () => {
    setFilesLoading(true);
    setFilesError('');
    try {
      const res = await fetch('/api/reports/history', { cache: 'no-store' });
      const data = (await res.json()) as FilesResponse;
      if (!res.ok) { setFilesError(data.error || 'Failed to load files.'); return; }
      setFiles(data.files || []);
    } catch {
      setFilesError('Failed to load files.');
    } finally {
      setFilesLoading(false);
    }
  };

  const loadMembers = async () => {
    setMembersLoading(true);
    setMembersError('');
    try {
      const res = await fetch('/api/reports/members');
      const data = (await res.json()) as MembersResponse;
      if (!res.ok) { setMembersError(data.error || 'Failed to load members.'); return; }
      setMembers(data.members || []);
    } catch {
      setMembersError('Failed to load members.');
    } finally {
      setMembersLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Generated Files */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle className="text-lg font-serif">Generated Files</CardTitle>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <DataExportButtons
                baseName="generated_report_files"
                rows={fileExportRows}
                jsonData={{ files }}
                title="Export Files"
              />
              <Button variant="outline" size="sm" onClick={loadFiles} disabled={filesLoading}>
                {filesLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filesError && <p className="text-sm text-red-600 mb-3">{filesError}</p>}
          {!filesLoading && !filesError && files.length === 0 && (
            <p className="text-sm text-(--rs-neutral-grey-500) italic">No reports generated yet.</p>
          )}
          {files.length > 0 && (
            <div className="space-y-2">
              {files.map(file => (
                <div
                  key={file.name}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-lg border border-(--rs-neutral-grey-200) p-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-sm text-(--rs-neutral-grey-900) break-all">{file.name}</p>
                    <p className="text-xs text-(--rs-neutral-grey-400) mt-0.5">
                      {formatBytes(file.size)} · {new Date(file.modifiedAt).toLocaleString()}
                    </p>
                  </div>
                  <a
                    href={`/api/reports/download?name=${encodeURIComponent(file.name)}`}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-(--rs-primary-500) hover:text-(--rs-primary-700) shrink-0 transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    Download
                  </a>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Workspace Members */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle className="text-lg font-serif">Workspace Members</CardTitle>
              <p className="text-xs text-(--rs-neutral-grey-400) mt-0.5">
                Browse the active workspace roster used for report generation.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <DataExportButtons
                baseName="plane_workspace_members"
                rows={memberExportRows}
                jsonData={{ members: members ?? [] }}
                title="Export Members"
              />
              <Button variant="outline" size="sm" onClick={loadMembers} disabled={membersLoading}>
                {membersLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
                {members === null ? 'Load Members' : 'Refresh'}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {membersError && <p className="text-sm text-red-600">{membersError}</p>}

          {members === null && !membersLoading && !membersError && (
            <p className="text-sm text-(--rs-neutral-grey-500) italic">
              Click &ldquo;Load Members&rdquo; to fetch the workspace roster.
            </p>
          )}

          {members !== null && members.length === 0 && (
            <p className="text-sm text-(--rs-neutral-grey-500) italic">No members found in workspace.</p>
          )}

          {members !== null && members.length > 0 && (
            <div className="space-y-2">
              {members.map(m => (
                <div
                  key={m.id}
                  className="flex items-center gap-3 p-3 rounded-lg border border-(--rs-neutral-grey-200) hover:bg-(--rs-neutral-grey-50) transition-colors"
                >
                  {/* Avatar */}
                  <div className="w-9 h-9 rounded-full bg-(--rs-primary-100) text-(--rs-primary-700) flex items-center justify-center text-sm font-bold shrink-0">
                    {initials(m.display_name)}
                  </div>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm text-(--rs-neutral-grey-900)">{m.display_name}</div>
                    <div className="text-xs text-(--rs-neutral-grey-400) truncate">{m.email}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <code className="text-[10px] bg-(--rs-neutral-grey-100) text-(--rs-neutral-grey-600) px-1.5 py-0.5 rounded font-mono truncate max-w-[200px] sm:max-w-none">
                        {m.id}
                      </code>
                      <CopyButton text={m.id} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

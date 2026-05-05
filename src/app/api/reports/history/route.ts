import { NextResponse } from 'next/server';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { getSession } from '@/lib/session';
import { canAccessReports } from '@/lib/rbac';

const execFileAsync = promisify(execFile);

export const runtime = 'nodejs';

async function resolvePythonBinary(): Promise<string> {
  const envPython = process.env.REPORT_SCRIPT_PYTHON?.trim();
  if (envPython) {
    try {
      await access(envPython, constants.X_OK);
      return envPython;
    } catch {
      return 'python3';
    }
  }
  return 'python3';
}

function resolveScriptDir(): string {
  const configured = process.env.REPORT_SCRIPT_DIR?.trim();
  if (configured) return configured;
  return `${process.cwd()}/report-script`;
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canAccessReports(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const scriptDir = resolveScriptDir();

  const pythonBinary = await resolvePythonBinary();
  const pyCode = `
import json, os
from pathlib import Path
output_dir = os.getenv("REPORT_OUTPUT_DIR", "./reports")
output_path = Path(output_dir)
if not output_path.is_absolute():
    output_path = Path.cwd() / output_path
if not output_path.exists():
    print(json.dumps({"files": []}))
    raise SystemExit(0)
files = []
for p in output_path.glob("*.xlsx"):
    stat = p.stat()
    files.append({
        "name": p.name,
        "size": stat.st_size,
        "modifiedAt": int(stat.st_mtime),
    })
files.sort(key=lambda item: item["modifiedAt"], reverse=True)
print(json.dumps({"files": files}))
`;

  try {
    const { stdout, stderr } = await execFileAsync(
      pythonBinary,
      ['-c', pyCode],
      {
        cwd: scriptDir,
        env: process.env,
        timeout: 60000,
      },
    );

    const parsed = JSON.parse(stdout) as { files?: Array<{ name: string; size: number; modifiedAt: number }> };
    return NextResponse.json({
      files: (parsed.files || []).map((file) => ({
        ...file,
        modifiedAt: new Date(file.modifiedAt * 1000).toISOString(),
      })),
      stderr: stderr.trim(),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown execution error';
    return NextResponse.json({ error: `Failed to load report files: ${errorMessage}` }, { status: 500 });
  }
}

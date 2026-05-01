import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { verifyToken } from '@/lib/auth';
import { canAccessReports, normalizeRole } from '@/lib/rbac';

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

async function requireSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get('session_token')?.value;

  if (!token) return null;

  const payload = await verifyToken(token);
  const username = typeof payload?.username === 'string' ? payload.username : '';
  if (!username) return null;

  return {
    username,
    role: normalizeRole(payload?.role),
  };
}

function resolveScriptDir(): string {
  const configured = process.env.REPORT_SCRIPT_DIR?.trim();
  if (configured) return configured;
  return `${process.cwd()}/report-script`;
}

function sanitizeFileName(fileName: string): string | null {
  if (!fileName || fileName.includes('/') || fileName.includes('\\')) return null;
  if (!fileName.toLowerCase().endsWith('.xlsx')) return null;
  return fileName;
}

export async function GET(req: Request) {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!canAccessReports(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const scriptDir = resolveScriptDir();

  const url = new URL(req.url);
  const requested = url.searchParams.get('name') || '';
  const safeName = sanitizeFileName(requested);
  if (!safeName) {
    return NextResponse.json({ error: 'Invalid file name' }, { status: 400 });
  }

  const pythonBinary = await resolvePythonBinary();
  const pyCode = `
import base64, json, os, sys
from pathlib import Path
name = sys.argv[1]
output_dir = os.getenv("REPORT_OUTPUT_DIR", "./reports")
output_path = Path(output_dir)
if not output_path.is_absolute():
    output_path = Path.cwd() / output_path
target = (output_path / name).resolve()
if target.parent != output_path.resolve():
    print(json.dumps({"error": "invalid-path"}))
    raise SystemExit(1)
if not target.exists():
    print(json.dumps({"error": "not-found"}))
    raise SystemExit(1)
content = target.read_bytes()
print(json.dumps({"name": name, "content": base64.b64encode(content).decode("ascii")}))
`;

  try {
    const { stdout } = await execFileAsync(
      pythonBinary,
      ['-c', pyCode, safeName],
      {
        cwd: scriptDir,
        env: process.env,
        timeout: 120000,
        maxBuffer: 20 * 1024 * 1024,
      },
    );

    const parsed = JSON.parse(stdout) as { name?: string; content?: string };
    if (!parsed.content || !parsed.name) {
      return NextResponse.json({ error: 'Download payload is invalid' }, { status: 500 });
    }

    const buffer = Buffer.from(parsed.content, 'base64');
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(parsed.name)}"`,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown execution error';
    return NextResponse.json({ error: `Failed to download report: ${errorMessage}` }, { status: 500 });
  }
}

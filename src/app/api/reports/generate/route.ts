import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
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

function resolveScriptDir(): string {
  const configured = process.env.REPORT_SCRIPT_DIR?.trim();
  if (configured) return configured;
  return `${process.cwd()}/report-script`;
}

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get('session_token')?.value;

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const payload = await verifyToken(token);
  const username = typeof payload?.username === 'string' ? payload.username : '';
  const role = normalizeRole(payload?.role);

  if (!username) {
    return NextResponse.json({ error: 'Invalid session payload' }, { status: 401 });
  }
  if (!canAccessReports(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const scriptDir = resolveScriptDir();
  const scriptPath = path.join(scriptDir, 'generate_report.py');

  try {
    await access(scriptPath, constants.F_OK);
  } catch {
    return NextResponse.json({ error: `Report script not found at ${scriptPath}` }, { status: 500 });
  }

  const pythonBinary = await resolvePythonBinary();

  try {
    const { stdout, stderr } = await execFileAsync(
      pythonBinary,
      [scriptPath, '--user', username],
      {
        cwd: scriptDir,
        env: process.env,
        timeout: 180000,
      },
    );

    const savedMatch = stdout.match(/Saved:\s*(.+)/);
    const savedPath = savedMatch?.[1]?.trim() || null;

    return NextResponse.json({
      success: true,
      message: `Report generated for ${username}`,
      savedPath,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
    });
  } catch (error) {
    try {
      const { stdout, stderr } = await execFileAsync(
        'bash',
        ['-lc', './venv/bin/python generate_report.py --user "$REPORT_USER"'],
        {
          cwd: scriptDir,
          env: { ...process.env, REPORT_USER: username },
          timeout: 180000,
        },
      );

      const savedMatch = stdout.match(/Saved:\s*(.+)/);
      const savedPath = savedMatch?.[1]?.trim() || null;

      return NextResponse.json({
        success: true,
        message: `Report generated for ${username}`,
        savedPath,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      });
    } catch (fallbackError) {
      const primaryMessage = error instanceof Error ? error.message : 'Unknown execution error';
      const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : 'Unknown fallback error';
      return NextResponse.json(
        { error: `Failed to generate report: ${primaryMessage} | fallback failed: ${fallbackMessage}` },
        { status: 500 },
      );
    }
  }
}

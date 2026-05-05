import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';

export const runtime = 'nodejs';

export async function GET() {
  const checks: Record<string, string> = {};

  // 1. JWT_SECRET
  checks.jwt_secret = process.env.JWT_SECRET ? 'SET' : 'MISSING — login will fail';

  // 2. DB file existence
  const cwd = process.cwd();
  const bundledPath = path.join(cwd, 'sqlite.db');
  const tmpPath = '/tmp/sqlite.db';

  checks.cwd = cwd;
  checks.bundled_db = fs.existsSync(bundledPath) ? 'FOUND' : 'MISSING';
  checks.tmp_db     = fs.existsSync(tmpPath)     ? 'FOUND' : 'NOT YET COPIED';
  checks.vercel_env = process.env.VERCEL ? 'yes' : 'no';

  // 3. Try opening the DB
  try {
    const Database = (await import('better-sqlite3')).default;
    const dbPath = process.env.DATABASE_PATH
      ?? (process.env.VERCEL ? tmpPath : bundledPath);

    if (process.env.VERCEL && !fs.existsSync(tmpPath)) {
      if (fs.existsSync(bundledPath)) {
        fs.copyFileSync(bundledPath, tmpPath);
        checks.db_copy = 'copied bundled → /tmp';
      } else {
        checks.db_copy = 'FAILED — bundled db not found';
      }
    }

    const db = new Database(dbPath, { readonly: true });
    const row = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
    db.close();
    checks.db_connection = `OK — ${row.count} users`;
  } catch (e) {
    checks.db_connection = `ERROR: ${e instanceof Error ? e.message : String(e)}`;
  }

  const allOk = !Object.values(checks).some(v => v.includes('MISSING') || v.includes('ERROR') || v.includes('FAILED'));

  return NextResponse.json({ status: allOk ? 'ok' : 'degraded', checks }, {
    status: allOk ? 200 : 500,
  });
}

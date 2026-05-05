import path from 'path';
import fs from 'fs';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';

function resolveDbPath(): string {
  // Explicit override (e.g. for local dev pointing to a different file)
  if (process.env.DATABASE_PATH) return process.env.DATABASE_PATH;

  const bundled = path.join(process.cwd(), 'sqlite.db');

  // Vercel's /var/task is read-only — SQLite needs a writable path to open in
  // read-write mode (it writes lock/WAL files alongside the db). Copy once to
  // /tmp on cold start; subsequent invocations in the same instance reuse it.
  if (process.env.VERCEL) {
    const tmp = '/tmp/sqlite.db';
    if (!fs.existsSync(tmp)) {
      fs.copyFileSync(bundled, tmp);
    }
    return tmp;
  }

  return bundled;
}

const sqlite = new Database(resolveDbPath());
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });

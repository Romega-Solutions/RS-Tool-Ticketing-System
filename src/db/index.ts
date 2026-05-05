import path from 'path';
import fs from 'fs';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';

function resolveDbPath(): string {
  if (process.env.DATABASE_PATH) return process.env.DATABASE_PATH;

  const bundled = path.join(process.cwd(), 'sqlite.db');

  if (process.env.VERCEL) {
    const tmp = '/tmp/sqlite.db';
    if (!fs.existsSync(tmp)) {
      if (!fs.existsSync(bundled)) {
        console.error(`[db] FATAL: sqlite.db not found at ${bundled} — outputFileTracingIncludes may not have worked.`);
        // Return bundled path anyway; Database() will throw a clear error
        return bundled;
      }
      fs.copyFileSync(bundled, tmp);
      console.log(`[db] Copied sqlite.db → ${tmp}`);
    }
    return tmp;
  }

  return bundled;
}

const dbPath = resolveDbPath();
console.log(`[db] Opening database at: ${dbPath}`);

const sqlite = new Database(dbPath);
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });

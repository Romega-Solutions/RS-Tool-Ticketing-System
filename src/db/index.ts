import path from 'path';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';

// Use DATABASE_PATH env var if set (e.g. /tmp/sqlite.db on writable Vercel tmp),
// otherwise resolve relative to the project root so it works in both dev and the
// Vercel /var/task bundle where process.cwd() is the deployment root.
const dbPath = process.env.DATABASE_PATH ?? path.join(process.cwd(), 'sqlite.db');

const sqlite = new Database(dbPath);

// WAL mode: better concurrency for concurrent serverless invocations
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });

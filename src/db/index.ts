import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

// postgres.js is lazy — it doesn't open a socket until the first query runs.
// Using a placeholder during build (when DATABASE_URL is absent) is safe;
// the real connection is only established at request time.
const url = process.env.DATABASE_URL ?? 'postgresql://build:build@localhost/build';

if (!process.env.DATABASE_URL) {
  // Warn in build/dev logs but don't crash — routes are never called during build
  console.warn('[db] DATABASE_URL is not set — queries will fail at runtime. Set it in Vercel → Settings → Environment Variables.');
}

const client = postgres(url, { prepare: false }); // prepare: false required for Supabase pgBouncer
export const db = drizzle(client, { schema });

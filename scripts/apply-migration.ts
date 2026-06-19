/**
 * Generic one-shot migration applier. Runs one or more .sql files against the
 * Supabase database. The pooled DATABASE_URL creds are stale, so — like the
 * older apply-*-migration.ts one-offs — this rebuilds a DIRECT connection
 * (db.<ref>.supabase.co:5432) from the same password.
 *
 *   npx tsx --env-file=.env scripts/apply-migration.ts <file.sql> [more.sql ...]
 *
 * Re-runnable: "already exists / duplicate" errors are reported and skipped, so
 * applying the same file twice is safe.
 */
import postgres from 'postgres';
import { readFileSync } from 'node:fs';

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('usage: apply-migration.ts <file.sql> [more.sql ...]');
  process.exit(1);
}

const poolerUrl = process.env.DATABASE_URL;
if (!poolerUrl) { console.error('DATABASE_URL is not set'); process.exit(1); }

const parsed = new URL(poolerUrl);
const pw = decodeURIComponent(parsed.password);
const ref = (process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host.split('.')[0]
  : parsed.username.split('.')[1]) ?? '';
const directUrl = `postgresql://postgres:${encodeURIComponent(pw)}@db.${ref}.supabase.co:5432/postgres`;
console.log(`Target host: db.${ref}.supabase.co:5432 (direct)`);

const sql = postgres(directUrl, { ssl: 'require', prepare: false, max: 1, idle_timeout: 5, connect_timeout: 20 });

// Postgres "already exists / duplicate object" SQLSTATEs — safe to skip on re-run.
const DUPLICATE_CODES = new Set(['42P07', '42701', '42710', '42P06', '42723', '42P16']);

async function main() {
  for (const file of files) {
    const ddl = readFileSync(file, 'utf8');
    process.stdout.write(`\n— ${file}\n`);
    try {
      await sql.unsafe(ddl);
      console.log('  applied');
    } catch (e) {
      const code = (e as { code?: string })?.code;
      if (code && DUPLICATE_CODES.has(code)) {
        console.log(`  already applied (${code})`);
      } else {
        throw e;
      }
    }
  }
}

main()
  .then(() => sql.end())
  .then(() => { console.log('\ndone'); process.exit(0); })
  .catch(async (e) => {
    console.error('FAILED:', (e as { code?: string })?.code ?? '', (e as Error)?.message ?? e);
    await sql.end().catch(() => {});
    process.exit(1);
  });

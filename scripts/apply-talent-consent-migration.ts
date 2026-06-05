/**
 * One-shot: apply docs/migrations/add-candidates-talent-consent.sql to the
 * database in DATABASE_URL. Idempotent (ADD COLUMN IF NOT EXISTS). Run:
 *   npx tsx --env-file=.env scripts/apply-talent-consent-migration.ts
 */
import postgres from 'postgres';
import { readFileSync } from 'node:fs';

const poolerUrl = process.env.DATABASE_URL;
if (!poolerUrl) { console.error('DATABASE_URL is not set'); process.exit(1); }

const ddl = readFileSync('docs/migrations/add-candidates-talent-consent.sql', 'utf8');

// The pooler creds are stale; build a direct connection from the same password.
const parsed = new URL(poolerUrl);
const pw = decodeURIComponent(parsed.password);
const ref = (process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host.split('.')[0]
  : parsed.username.split('.')[1]) ?? '';
const directUrl = `postgresql://postgres:${encodeURIComponent(pw)}@db.${ref}.supabase.co:5432/postgres`;
console.log('Target host: db.' + ref + '.supabase.co:5432 (direct)');

const sql = postgres(directUrl, { ssl: 'require', prepare: false, max: 1, idle_timeout: 5, connect_timeout: 10 });

async function main() {
  await sql.unsafe(ddl);
  const cols = await sql`
    select column_name from information_schema.columns
    where table_schema = 'public' and table_name = 'candidates'
      and column_name like 'consent_%'
    order by ordinal_position`;
  console.log('consent columns:', cols.map(c => c.column_name).join(', '));
}

main()
  .then(() => sql.end())
  .then(() => { console.log('done'); process.exit(0); })
  .catch(async (e) => { console.error('FAILED:', e?.message ?? e); await sql.end().catch(() => {}); process.exit(1); });

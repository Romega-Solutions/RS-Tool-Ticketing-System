/**
 * One-time backfill for per-user Tool Access (users.tool_access).
 *
 * Computes each user's day-one tool set from their current role + team using the
 * SAME logic the app used before the checkbox feature, so nobody gains or loses
 * access at rollout. After this runs, access is decided purely by the stored
 * array (admins always have everything).
 *
 *   npx tsx --env-file=.env scripts/seed-tool-access.ts          # seed only un-seeded rows ([])
 *   npx tsx --env-file=.env scripts/seed-tool-access.ts --force  # recompute every row
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.
 * Idempotent without --force: rows whose tool_access is already non-empty are skipped.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import {
  normalizeRole,
  defaultToolAccess,
  GATEABLE_TOOL_KEYS,
  type GateableToolKey,
} from '../src/lib/rbac';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const FORCE = process.argv.includes('--force');

if (!SUPABASE_URL || !SERVICE_KEY || SERVICE_KEY === 'your-service-role-key-here') {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env first.');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Day-one seed = the current default Team-Tool set for this role + department.
// Single source of truth: defaultToolAccess() in src/lib/rbac.ts. (Workspace
// tools like Projects / Time Requests are open to all and never stored here.)
function computeSeed(role: string, team: string | null): GateableToolKey[] {
  return defaultToolAccess(normalizeRole(role), team);
}

async function main() {
  const { data, error } = await sb
    .from('users')
    .select('id, name, role, team, tool_access')
    .order('name');
  if (error) {
    console.error('Failed to read users:', error.message);
    process.exit(1);
  }
  const users = data ?? [];

  const counts: Record<string, number> = Object.fromEntries(GATEABLE_TOOL_KEYS.map((k) => [k, 0]));
  let seeded = 0;
  let skipped = 0;

  for (const u of users) {
    const existing = Array.isArray(u.tool_access) ? (u.tool_access as string[]) : [];
    if (!FORCE && existing.length > 0) {
      skipped++;
      existing.forEach((k) => { if (k in counts) counts[k]++; });
      continue;
    }
    const seed = computeSeed(String(u.role), (u.team as string | null) ?? null);
    const { error: upErr } = await sb.from('users').update({ tool_access: seed }).eq('id', u.id);
    if (upErr) {
      console.error(`  ✗ ${u.name} (#${u.id}): ${upErr.message}`);
      continue;
    }
    seeded++;
    seed.forEach((k) => counts[k]++);
    console.log(`  ✓ ${u.name} — [${seed.join(', ')}]`);
  }

  console.log(`\nSeeded ${seeded} user(s); skipped ${skipped} already-seeded.`);
  console.log('Per-tool access counts (across all users):');
  for (const k of GATEABLE_TOOL_KEYS) console.log(`  ${counts[k].toString().padStart(3)}  ${k}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

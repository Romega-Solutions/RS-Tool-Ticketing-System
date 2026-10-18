/**
 * Preview seed: fills a NON-production Supabase project with fake people,
 * projects, tasks, attendance and timesheets that copy the real portal's
 * structure, plus the five role test accounts used by the preview role
 * switcher. See README.md in this folder.
 *
 *   npx tsx scripts/preview-seed/index.ts --target <project-ref> [options]
 *
 * Options:
 *   --target <ref>           Required to write. Must match TARGET_SUPABASE_URL.
 *   --structure-in <file>    Read the anonymized structure from a JSON file
 *                            instead of from the source database.
 *   --structure-out <file>   Save the anonymized structure to a JSON file.
 *                            Without --target, this is all the script does.
 *   --dry-run                Build the fake dataset and print counts; write nothing.
 *   --allow-other-users      Seed even if the target has non-@preview.invalid users.
 *
 * Env (never commit these):
 *   SOURCE_SUPABASE_URL, SOURCE_SUPABASE_SECRET_KEY   read-only structure source
 *   TARGET_SUPABASE_URL, TARGET_SUPABASE_SECRET_KEY   the preview database
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { buildFakeDataset, type Structure } from './dataset';
import { checkTarget, supabaseRef } from './guards';
import { readStructure } from './structure';
import { preflight, wipeSeeded, writeDataset } from './writer';

type Args = {
  target?: string;
  structureIn?: string;
  structureOut?: string;
  dryRun: boolean;
  allowOtherUsers: boolean;
};

export function parseArgs(argv: string[]): Args {
  const args: Args = { dryRun: false, allowOtherUsers: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (!v || v.startsWith('--')) throw new Error(`${a} needs a value`);
      return v;
    };
    if (a === '--target') args.target = next();
    else if (a === '--structure-in') args.structureIn = next();
    else if (a === '--structure-out') args.structureOut = next();
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--allow-other-users') args.allowOtherUsers = true;
    else throw new Error(`Unknown option ${a}`);
  }
  return args;
}

const client = (url: string, key: string) =>
  createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const log = (m: string) => console.log(`  ${m}`);
  const env = process.env;

  if (!args.target && !args.structureOut && !args.dryRun) {
    throw new Error('Nothing to do. Pass --target <project-ref> to seed, or --structure-out <file> / --dry-run.');
  }

  // Validate the target BEFORE touching the source, so a bad target never
  // even triggers a read.
  let target: { ref: string; url: string } | null = null;
  if (args.target) {
    const check = checkTarget({
      targetFlag: args.target,
      targetUrl: env.TARGET_SUPABASE_URL,
      targetKey: env.TARGET_SUPABASE_SECRET_KEY,
      sourceUrl: args.structureIn ? undefined : env.SOURCE_SUPABASE_URL,
    });
    if (!check.ok) throw new Error(check.error);
    target = check;
  }

  let structure: Structure;
  if (args.structureIn) {
    structure = JSON.parse(readFileSync(args.structureIn, 'utf8')) as Structure;
    log(`read structure from ${args.structureIn}`);
  } else {
    const url = env.SOURCE_SUPABASE_URL;
    const key = env.SOURCE_SUPABASE_SECRET_KEY;
    if (!url || !key) throw new Error('Set SOURCE_SUPABASE_URL and SOURCE_SUPABASE_SECRET_KEY, or pass --structure-in.');
    log(`reading structure (read-only) from ${supabaseRef(url) ?? 'source'}`);
    structure = await readStructure(client(url, key));
  }
  log(`structure: ${structure.users.length} users, ${structure.projects.length} projects, ${structure.workItems.length} tasks`);

  if (args.structureOut) {
    writeFileSync(args.structureOut, JSON.stringify(structure, null, 2));
    log(`wrote anonymized structure to ${args.structureOut}`);
  }

  const dataset = buildFakeDataset(structure, { now: new Date() });
  log(`fake dataset: ${dataset.users.length} users, ${dataset.projects.length} projects, `
    + `${dataset.timesheets.length} timesheet sessions`);

  if (!target || args.dryRun) {
    log(args.dryRun ? 'dry run: nothing written' : 'no --target: nothing written');
    return;
  }

  const db = client(target.url, env.TARGET_SUPABASE_SECRET_KEY!);
  log(`seeding target ${target.ref}`);
  await preflight(db, { allowOtherUsers: args.allowOtherUsers });
  await wipeSeeded(db, log);
  await writeDataset(db, dataset, log);
  log('done. Role test accounts: founder / admin / lead / ic / intern @preview.invalid');
}

if (process.argv[1] && /preview-seed[\\/]index\.ts$/.test(process.argv[1])) {
  main().catch((err) => {
    console.error(`preview-seed: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  });
}

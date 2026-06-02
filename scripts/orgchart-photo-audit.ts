/**
 * Read-only audit: match every active app user against the live org chart and
 * report who maps to an org-chart person and whether that person has a photo.
 *
 * Uses the SAME matching the app uses (email-exact → name-exact → first+last
 * token). No writes. Run:  npx tsx --env-file=.env scripts/orgchart-photo-audit.ts
 */
import { createAdminClient } from '../src/lib/supabase/admin';
import { fetchPeople } from '../src/lib/orgchart';

function normalizeStr(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}
function tokensOf(s: string): string[] {
  return normalizeStr(s).split(' ').filter(Boolean);
}
function firstLastMatch(a: string, b: string): boolean {
  const ta = tokensOf(a), tb = tokensOf(b);
  if (!ta.length || !tb.length) return false;
  return ta[0] === tb[0] && ta[ta.length - 1] === tb[tb.length - 1];
}

async function main() {
  const people = await fetchPeople();
  const active = people.filter(p => p.isActive !== false && p.isActive !== 0);
  const byEmail = new Map<string, typeof active[number]>();
  const byName = new Map<string, typeof active[number]>();
  for (const p of active) {
    if (p.email) byEmail.set(p.email.toLowerCase().trim(), p);
    byName.set(normalizeStr(p.name), p);
  }

  const sb = createAdminClient();
  const { data: users, error } = await sb
    .from('users').select('id, name, email, team').eq('is_active', 1);
  if (error) throw new Error(error.message);

  const rows: Array<{ name: string; via: string; photo: string }> = [];
  let matched = 0, unmatched = 0, withPhoto = 0;

  for (const u of users ?? []) {
    const name = String(u.name ?? ''), email = String(u.email ?? '');
    let m = email ? byEmail.get(email.toLowerCase().trim()) : undefined;
    let via = m ? 'email' : '';
    if (!m && name) { m = byName.get(normalizeStr(name)); if (m) via = 'name-exact'; }
    if (!m && name) { m = active.find(p => firstLastMatch(p.name, name)); if (m) via = 'first+last'; }

    if (!m) { unmatched++; rows.push({ name, via: '— UNMATCHED', photo: '—' }); continue; }
    matched++;
    const has = Boolean(m.photoUrl);
    if (has) withPhoto++;
    rows.push({ name, via, photo: has ? 'yes' : 'NO PHOTO' });
  }

  const orgWithPhoto = active.filter(p => p.photoUrl).length;
  console.log(`\nOrg chart: ${active.length} active people, ${orgWithPhoto} have a photo`);
  console.log(`App users: ${users?.length ?? 0} active`);
  console.log(`  matched to org chart : ${matched}`);
  console.log(`  of those, with photo : ${withPhoto}`);
  console.log(`  unmatched            : ${unmatched}\n`);
  console.log('user'.padEnd(28), 'match via'.padEnd(14), 'photo');
  console.log('-'.repeat(55));
  for (const r of rows.sort((a, b) => a.via.localeCompare(b.via))) {
    console.log(r.name.padEnd(28), r.via.padEnd(14), r.photo);
  }
}

main().catch(e => { console.error(e); process.exit(1); });

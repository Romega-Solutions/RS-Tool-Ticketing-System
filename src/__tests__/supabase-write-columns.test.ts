import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * Guard against the "Could not find the '<col>' column of '<table>' in the
 * schema cache" class of runtime failure.
 *
 * That PostgREST error fires when a Supabase write (`.from('t').insert|update|
 * upsert({...})`) sends a payload key that is not an actual column on the table.
 * It is invisible to `tsc`/ESLint because the supabase-js client takes an
 * untyped object. This test statically resolves every write payload in the
 * codebase and asserts each key exists as a column in src/db/schema.ts (the
 * declared single source of truth).
 *
 * Real bug this caught: both attendance write routes set `updated_at`, but the
 * `attendance` table has no such column — it tracks edits via `submitted_at` /
 * `edited_at`. Clicking "Save" in admin Edit Attendance returned
 * "Insert failed: Could not find the 'updated_at' column of 'attendance'...".
 *
 * The analyzer is deliberately CONSERVATIVE: it skips tables not modeled in
 * schema.ts (several ATS/onboarding tables live outside Drizzle) and skips any
 * payload it cannot confidently resolve (function-arg spreads, bulk arrays,
 * computed keys). It only fails on a key it is sure is not a column, so it will
 * not break CI on unrelated future code — but it WILL fail the moment someone
 * writes a column that schema.ts doesn't know about.
 */

const SRC_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCHEMA_FILE = join(SRC_DIR, 'db', 'schema.ts');

// ---- Parse schema.ts -> { table: Set(dbColumnNames) } -------------------------
function parseSchema(src: string): Record<string, Set<string>> {
  const tables: Record<string, Set<string>> = {};
  const re = /pgTable\(\s*['"]([^'"]+)['"]\s*,\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const body = braceBody(src, re.lastIndex - 1);
    if (body == null) continue;
    const cols = new Set<string>();
    const colRe = /(\w+)\s*:\s*[A-Za-z_]\w*\(\s*['"]([^'"]+)['"]/g;
    let c: RegExpExecArray | null;
    while ((c = colRe.exec(body))) cols.add(c[2]);
    tables[m[1]] = cols;
  }
  return tables;
}

// Body between the `{` at openIdx and its matching `}` (string-aware not needed
// for our pgTable/object-literal inputs — no unbalanced braces inside strings).
function braceBody(src: string, openIdx: number): string | null {
  let depth = 0;
  for (let j = openIdx; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(openIdx + 1, j); }
  }
  return null;
}

function balancedArg(src: string, openParenIdx: number): string | null {
  let depth = 0;
  for (let j = openParenIdx; j < src.length; j++) {
    if (src[j] === '(') depth++;
    else if (src[j] === ')') { depth--; if (depth === 0) return src.slice(openParenIdx + 1, j); }
  }
  return null;
}

// Split on TOP-LEVEL commas, ignoring nested (){}[] and string literals.
function splitTopLevel(body: string): string[] {
  const parts: string[] = [];
  let depth = 0, start = 0;
  let str: string | null = null;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (str) { if (ch === str && body[i - 1] !== '\\') str = null; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { str = ch; continue; }
    if (ch === '{' || ch === '(' || ch === '[') depth++;
    else if (ch === '}' || ch === ')' || ch === ']') depth--;
    else if (ch === ',' && depth === 0) { parts.push(body.slice(start, i)); start = i + 1; }
  }
  parts.push(body.slice(start));
  return parts;
}

type Token = { key: string } | { spread: string };

// Leading key / spread of each comma-separated element of an object-literal body.
function topLevelKeys(body: string): Token[] {
  const out: Token[] = [];
  for (const seg of splitTopLevel(body)) {
    const s = seg.trim();
    if (!s) continue;
    const spread = /^\.\.\.\s*(\w+)/.exec(s);
    if (spread) { out.push({ spread: spread[1] }); continue; }
    const kv = /^['"]?([A-Za-z_]\w*)['"]?\s*:/.exec(s);
    if (kv) { out.push({ key: kv[1] }); continue; }
    const shorthand = /^([A-Za-z_]\w*)\s*$/.exec(s);
    if (shorthand) out.push({ key: shorthand[1] });
    // else: computed key `[x]:`, string-expr key, etc. -> intentionally skipped.
  }
  return out;
}

type Decl = { name: string; at: number; body: string };

function collectDecls(src: string): Decl[] {
  const out: Decl[] = [];
  const re = /\b(?:const|let|var)\s+(\w+)\s*(?::[^=]+)?=\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const body = braceBody(src, re.lastIndex - 1);
    if (body != null) out.push({ name: m[1], at: m.index, body });
  }
  return out;
}

// Nearest `NAME = {...}` declared before `pos` (scope approximation).
function nearestDecl(decls: Decl[], name: string, pos: number): Decl | null {
  let best: Decl | null = null;
  for (const d of decls) if (d.name === name && d.at < pos && (!best || d.at > best.at)) best = d;
  return best;
}

// Resolve the keys of a write argument. Returns null when the payload can't be
// confidently resolved (so the caller skips it rather than guessing).
function resolveKeys(argRaw: string, decls: Decl[], pos: number, seen = new Set<string>()): string[] | null {
  const arg = (splitTopLevel(argRaw)[0] ?? '').trim(); // upsert's 2nd arg = options, ignore
  let body: string;
  if (arg.startsWith('{')) {
    body = arg.slice(1, arg.lastIndexOf('}'));
  } else if (/^\w+$/.test(arg)) {
    const d = nearestDecl(decls, arg, pos);
    if (!d || seen.has(arg)) return null;
    seen.add(arg);
    body = d.body;
  } else {
    return null; // array literal, call expression, etc.
  }
  const keys: string[] = [];
  for (const tok of topLevelKeys(body)) {
    if ('key' in tok) keys.push(tok.key);
    else {
      const d = nearestDecl(decls, tok.spread, pos);
      if (!d || seen.has(tok.spread)) return null; // spread of unresolved var -> bail
      seen.add(tok.spread);
      const inner = resolveKeys(d.body, decls, pos, seen);
      if (inner == null) return null;
      keys.push(...inner);
    }
  }
  return keys;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next' || name === '__tests__') continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

type Violation = { file: string; line: number; table: string; op: string; key: string };

function findViolations(): Violation[] {
  const schema = parseSchema(readFileSync(SCHEMA_FILE, 'utf8'));
  const violations: Violation[] = [];
  for (const file of walk(SRC_DIR)) {
    const src = readFileSync(file, 'utf8');
    const decls = collectDecls(src);
    const writeRe = /\.(insert|update|upsert)\(/g;
    let wm: RegExpExecArray | null;
    while ((wm = writeRe.exec(src))) {
      const op = wm[1];
      const openParen = wm.index + wm[0].length - 1;
      // Attribute to the nearest preceding `.from('table')` (same chain).
      const before = src.slice(Math.max(0, openParen - 500), openParen);
      const froms = [...before.matchAll(/\.from\(\s*['"]([^'"]+)['"]\s*\)/g)];
      if (!froms.length) continue;
      const table = froms[froms.length - 1][1];
      const cols = schema[table];
      if (!cols) continue; // table not modeled in schema.ts -> out of scope
      const arg = balancedArg(src, openParen);
      if (arg == null) continue;
      const keys = resolveKeys(arg, decls, openParen);
      if (keys == null) continue; // unresolved payload -> skip, don't guess
      for (const key of keys) {
        if (!cols.has(key)) {
          const line = src.slice(0, openParen).split('\n').length;
          violations.push({ file: file.replace(SRC_DIR, 'src'), line, table, op, key });
        }
      }
    }
  }
  return violations;
}

describe('Supabase write payloads only reference real columns (schema.ts)', () => {
  it('has no insert/update/upsert payload key missing from its table', () => {
    const violations = findViolations();
    const report = violations
      .map((v) => `  ${v.file}:${v.line}  ${v.op} '${v.table}' -> unknown column '${v.key}'`)
      .join('\n');
    expect(violations, `\nPayload column(s) not found in schema.ts:\n${report}\n`).toEqual([]);
  });

  it('analyzer is wired correctly (parses schema.ts and resolves a known table)', () => {
    const schema = parseSchema(readFileSync(SCHEMA_FILE, 'utf8'));
    // sanity: attendance is modeled and tracks edits via edited_at, not updated_at
    expect(schema.attendance).toBeDefined();
    expect(schema.attendance.has('edited_at')).toBe(true);
    expect(schema.attendance.has('updated_at')).toBe(false);
  });
});

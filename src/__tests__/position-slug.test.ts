import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  allocatePositionSlug,
  assignPositionSlugs,
  isMissingSlugColumn,
  positionApplyLookup,
  publicPositionApplyUrl,
  slugifyPositionTitle,
} from '@/lib/recruiting/position-slug';

describe('position slug generation', () => {
  it('turns an em dash into a single hyphen', () => {
    expect(slugifyPositionTitle('Full-Stack Developer Intern — Mobile Dating App'))
      .toBe('full-stack-developer-intern-mobile-dating-app');
    expect(slugifyPositionTitle('Designer \u2014 Brand')).toBe('designer-brand');
    expect(slugifyPositionTitle('Designer \u2013 Brand')).toBe('designer-brand');
  });

  it('strips accents and collapses punctuation', () => {
    expect(slugifyPositionTitle('Développeur — Café')).toBe('developpeur-cafe');
    expect(slugifyPositionTitle('Ñoño résumé')).toBe('nono-resume');
    expect(slugifyPositionTitle('  naïve / C++  ')).toBe('naive-c');
    expect(slugifyPositionTitle('---')).toBe('position');
  });

  it('resolves collisions in id order with -2, -3 suffixes', () => {
    const assigned = assignPositionSlugs([
      { id: 30, jobTitle: 'Full-Stack Developer Intern — Mobile Dating App' },
      { id: 10, jobTitle: 'Full-Stack Developer Intern — Mobile Dating App' },
      { id: 20, jobTitle: 'Développeur — Café' },
      { id: 40, jobTitle: 'Full-Stack Developer Intern — Mobile Dating App' },
      { id: 15, jobTitle: 'Developpeur Cafe' },
    ]);

    expect(assigned.get(10)).toBe('full-stack-developer-intern-mobile-dating-app');
    expect(assigned.get(30)).toBe('full-stack-developer-intern-mobile-dating-app-2');
    expect(assigned.get(40)).toBe('full-stack-developer-intern-mobile-dating-app-3');
    // "Développeur — Café" and "Developpeur Cafe" share a base; lower id wins.
    expect(assigned.get(15)).toBe('developpeur-cafe');
    expect(assigned.get(20)).toBe('developpeur-cafe-2');
  });

  it('appends -2 then -3 when the base slug is already taken', () => {
    const taken = new Set(['engineer', 'engineer-2']);
    expect(allocatePositionSlug('engineer', taken)).toBe('engineer-3');
    expect(allocatePositionSlug('designer', taken)).toBe('designer');
  });

  it('uses the website slug URL and falls back to the numeric id', () => {
    expect(publicPositionApplyUrl({
      id: 42,
      slug: 'full-stack-developer-intern-mobile-dating-app',
    })).toBe('https://romega-solutions.com/apply/full-stack-developer-intern-mobile-dating-app');
    expect(publicPositionApplyUrl({ id: 42, slug: null })).toBe('https://romega-solutions.com/apply/42');
    expect(publicPositionApplyUrl({ id: 42, slug: '  ' })).toBe('https://romega-solutions.com/apply/42');
  });

  it('accepts a numeric id or a slug on the portal apply route', () => {
    expect(positionApplyLookup('42')).toEqual({ id: 42 });
    expect(positionApplyLookup('full-stack-developer-intern-mobile-dating-app'))
      .toEqual({ slug: 'full-stack-developer-intern-mobile-dating-app' });
    expect(positionApplyLookup('0')).toEqual({ slug: '0' });
    expect(positionApplyLookup('../etc')).toBeNull();
    expect(positionApplyLookup('')).toBeNull();
  });

  it('recognises a missing slug column so callers can fall back', () => {
    expect(isMissingSlugColumn("Could not find the 'slug' column of 'positions' in the schema cache")).toBe(true);
    expect(isMissingSlugColumn('column positions.slug does not exist')).toBe(true);
    expect(isMissingSlugColumn('relation "positions" does not exist')).toBe(false);
  });

  it('keeps the stored slug when a title is edited, and writes one on create', () => {
    const src = readFileSync(
      join(process.cwd(), 'src', 'app', '(app)', 'recruiting', 'positions', 'actions.ts'),
      'utf8',
    );
    const createFn = src.slice(
      src.indexOf('export async function createPosition'),
      src.indexOf('export async function updatePosition'),
    );
    const updateFn = src.slice(
      src.indexOf('export async function updatePosition'),
      src.indexOf('export async function updatePositionStatus'),
    );
    expect(createFn).toContain('allocateUniquePositionSlug');
    expect(updateFn).not.toMatch(/slug\s*:/);
  });

  it('ships an idempotent migration with a commented rollback', () => {
    const sql = readFileSync(join(process.cwd(), 'drizzle', '0014_positions_slug.sql'), 'utf8');
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS slug text/i);
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS positions_slug_unique_idx/i);
    expect(sql).toMatch(/ORDER BY id/);
    expect(sql).toMatch(/base \|\| '-' \|\| n/);
    expect(sql).toContain('-- Rollback');
    expect(sql).toMatch(/DROP COLUMN IF EXISTS slug/);
    expect(sql).toMatch(/DROP INDEX IF EXISTS positions_slug_unique_idx/);
  });
});

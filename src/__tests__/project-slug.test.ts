import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  RESERVED_PROJECT_SLUGS,
  allocateProjectSlug,
  assignProjectSlugs,
  projectKey,
  projectPath,
  projectRouteLookup,
  slugifyProjectName,
} from '@/lib/project-slug';

// Every project name in production at the time the slug migration was written,
// with the slug the SQL backfill produces for it (verified with a read-only
// SELECT of the same expression).
const CURRENT_PROJECTS: Array<{ id: number; name: string; slug: string }> = [
  { id: 1,  name: 'Accountability Partnership',          slug: 'accountability-partnership' },
  { id: 2,  name: 'Tool Migration/Configuration',        slug: 'tool-migration-configuration' },
  { id: 3,  name: 'Romega Portal - General',             slug: 'romega-portal-general' },
  { id: 4,  name: 'Romega Digital Website',              slug: 'romega-digital-website' },
  { id: 5,  name: 'HR x Technical Team',                 slug: 'hr-x-technical-team' },
  { id: 6,  name: 'Marketing x Technical Team',          slug: 'marketing-x-technical-team' },
  { id: 7,  name: 'Marketing Team',                      slug: 'marketing-team' },
  { id: 8,  name: 'Human Resources',                     slug: 'human-resources' },
  { id: 9,  name: 'Sales Team',                          slug: 'sales-team' },
  { id: 10, name: 'Technical Team',                      slug: 'technical-team' },
  { id: 11, name: 'Performance Review (H1 2026)',        slug: 'performance-review-h1-2026' },
  { id: 12, name: 'Aaron Garcia: Task Handovers',        slug: 'aaron-garcia-task-handovers' },
  { id: 13, name: 'PM Website and Application - General', slug: 'pm-website-and-application-general' },
];

describe('project slug generation', () => {
  it('matches the migration output for every current project name', () => {
    for (const p of CURRENT_PROJECTS) expect(slugifyProjectName(p.name)).toBe(p.slug);
    const assigned = assignProjectSlugs(CURRENT_PROJECTS);
    for (const p of CURRENT_PROJECTS) expect(assigned.get(p.id)).toBe(p.slug);
    expect(new Set(assigned.values()).size).toBe(CURRENT_PROJECTS.length); // no collisions
  });

  it('strips accents and collapses punctuation to single hyphens', () => {
    expect(slugifyProjectName('Café — Ops / Q&A')).toBe('cafe-ops-q-a');
    expect(slugifyProjectName('  Ñoño  ')).toBe('nono');
    expect(slugifyProjectName('---')).toBe('project');
    expect(slugifyProjectName('')).toBe('project');
  });

  it('never produces a digits-only or reserved slug', () => {
    expect(slugifyProjectName('2026')).toBe('2026-project');
    expect(slugifyProjectName('#42')).toBe('42-project');
    for (const word of RESERVED_PROJECT_SLUGS) {
      expect(slugifyProjectName(word)).toBe(`${word}-project`);
    }
    expect(slugifyProjectName('New Hires')).toBe('new-hires'); // only exact matches
  });

  it('resolves collisions in id order with -2, -3 suffixes', () => {
    const assigned = assignProjectSlugs([
      { id: 9, name: 'Sales Team' },
      { id: 2, name: 'Sales — Team' },
      { id: 5, name: 'sales team' },
    ]);
    expect(assigned.get(2)).toBe('sales-team');
    expect(assigned.get(5)).toBe('sales-team-2');
    expect(assigned.get(9)).toBe('sales-team-3');
    expect(allocateProjectSlug('sales-team', new Set(['sales-team', 'sales-team-2']))).toBe('sales-team-3');
  });

  it('keeps the SQL backfill rules in sync with the TypeScript rules', () => {
    const sql = readFileSync(join(process.cwd(), 'drizzle', '0015_projects_slug.sql'), 'utf8');
    for (const word of RESERVED_PROJECT_SLUGS) expect(sql).toContain(`'${word}'`);
    expect(sql).toContain("'-project'");
    expect(sql).toContain("'project'");
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS projects_slug_unique_idx');
    expect(sql).not.toMatch(/^\s*ALTER TABLE projects\s+ALTER COLUMN slug SET NOT NULL/m);
  });
});

describe('project URLs', () => {
  it('uses the slug when present and the numeric id otherwise', () => {
    expect(projectKey({ id: 3, slug: 'romega-portal-general' })).toBe('romega-portal-general');
    expect(projectKey({ id: 3, slug: null })).toBe('3');
    expect(projectKey({ id: '3', slug: '  ' })).toBe('3');
    expect(projectPath({ id: 3 })).toBe('/projects/3');
    expect(projectPath({ id: 3, slug: 'romega-portal-general' })).toBe('/projects/romega-portal-general');
  });

  it('appends sub-paths and query strings', () => {
    const ref = { id: 3, slug: 'romega-portal-general' };
    expect(projectPath(ref, 'settings')).toBe('/projects/romega-portal-general/settings');
    expect(projectPath(ref, '/discussion/', { comment: 7 })).toBe('/projects/romega-portal-general/discussion?comment=7');
    expect(projectPath(ref, '', { task: 42, comment: 7 })).toBe('/projects/romega-portal-general?task=42&comment=7');
    expect(projectPath({ id: 3 }, '', { task: 42, skip: undefined })).toBe('/projects/3?task=42');
    expect(projectPath(ref, '', { label: ['a', 'b'] })).toBe('/projects/romega-portal-general?label=a&label=b');
    expect(projectPath(ref, '', new URLSearchParams('task=1'))).toBe('/projects/romega-portal-general?task=1');
  });

  it('parses a route key as a numeric id or a slug', () => {
    expect(projectRouteLookup('3')).toEqual({ id: 3 });
    expect(projectRouteLookup('romega-portal-general')).toEqual({ slug: 'romega-portal-general' });
    expect(projectRouteLookup('2026-project')).toEqual({ slug: '2026-project' });
    expect(projectRouteLookup('0')).toBeNull();
    expect(projectRouteLookup('03')).toBeNull();
    expect(projectRouteLookup('Romega Portal')).toBeNull();
    expect(projectRouteLookup('../etc')).toBeNull();
    expect(projectRouteLookup('')).toBeNull();
  });
});

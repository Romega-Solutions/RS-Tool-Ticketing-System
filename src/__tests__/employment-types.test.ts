import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  EMPLOYMENT_TYPES, EMPLOYMENT_TYPE_OPTIONS, employmentLabel, isEmploymentType, parseEmploymentType,
} from '@/lib/employment-types';

describe('employment types', () => {
  it('has exactly the 4 options in order', () => {
    expect(EMPLOYMENT_TYPE_OPTIONS).toEqual([
      { value: 'full_time', label: 'Full-time' },
      { value: 'part_time', label: 'Part-time' },
      { value: 'contractual', label: 'Contractual' },
      { value: 'internship', label: 'Internship' },
    ]);
  });
  it('labels known values and never guesses Full-time', () => {
    expect(employmentLabel('internship')).toBe('Internship');
    expect(employmentLabel('part_time')).toBe('Part-time');
    expect(employmentLabel('temp')).toBe('Not specified');
    expect(employmentLabel(null)).toBe('Not specified');
    expect(employmentLabel('')).toBe('Not specified');
  });
  it('validates submitted values', () => {
    expect(parseEmploymentType(' contractual ')).toBe('contractual');
    expect(() => parseEmploymentType('freelance')).toThrow(/Please choose an employment type/);
    expect(() => parseEmploymentType(null)).toThrow();
    expect(isEmploymentType('FULL_TIME')).toBe(false);
  });
  it('save action validates instead of defaulting to full_time', () => {
    const src = readFileSync('src/app/(app)/recruiting/positions/actions.ts', 'utf8');
    expect(src).toContain("parseEmploymentType(formData.get('employmentType'))");
    expect(src).not.toMatch(/:\s*'full_time'/);
  });
  it('migration CHECK matches the shared list', () => {
    const sql = readFileSync('drizzle/0019_positions_employment_type_check.sql', 'utf8');
    expect(sql).toContain(`IN (${EMPLOYMENT_TYPES.map(t => `'${t}'`).join(', ')})`);
  });
  it('prod data update targets ids by number and excludes id 4', () => {
    const sql = readFileSync('docs/migrations/0019-positions-intern-to-internship-data.sql', 'utf8');
    expect(sql).toContain("SET employment_type = 'internship', updated_at = now()\n WHERE id IN (1, 2, 6, 7, 8, 9, 10, 11, 12);");
    expect(sql).not.toMatch(/ILIKE|LIKE '%Intern/i);
  });
});

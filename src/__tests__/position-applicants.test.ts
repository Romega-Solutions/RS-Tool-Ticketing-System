import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { candidateBelongsToPosition, countApplicantsByPosition, displayApplicationCode } from '@/lib/recruiting/position-applicants';

describe('position applicant matching', () => {
  const positions = [
    { id: 10, job_title: 'Frontend Developer' },
    { id: 20, job_title: 'Backend Developer' },
  ];

  it('counts applicants by durable position id and falls back to title for older rows', () => {
    const counts = countApplicantsByPosition(positions, [
      { id: 1, position_id: 10, position: 'Frontend Developer' },
      { id: 2, position_id: null, position: 'Frontend Developer' },
      { id: 3, position_id: 20, position: 'Frontend Developer' },
      { id: 4, position_id: null, position: 'Backend Developer' },
      { id: 5, position_id: null, position: 'Designer' },
    ]);

    expect(counts.get(10)).toBe(2);
    expect(counts.get(20)).toBe(2);
  });

  it('prefers position id over a stale title', () => {
    expect(candidateBelongsToPosition(
      { id: 3, position_id: 20, position: 'Frontend Developer' },
      positions[0],
    )).toBe(false);

    expect(candidateBelongsToPosition(
      { id: 3, position_id: 20, position: 'Frontend Developer' },
      positions[1],
    )).toBe(true);
  });

  it('shows a stable application code label when present', () => {
    expect(displayApplicationCode(' APP-2026-0042 ')).toBe('APP-2026-0042');
    expect(displayApplicationCode(null)).toBe('No code');
    expect(displayApplicationCode('')).toBe('No code');
  });

  it('keeps recruiter backup emails linked to the exact candidate record', () => {
    const workflow = readFileSync(
      join(process.cwd(), 'n8n', 'Romega ATS — Recruiter Notify.json'),
      'utf8',
    );

    expect(workflow).toContain('/recruiting/candidates/${body.candidateId}');
    expect(workflow).toContain('Application code: ${body.applicationCode}');
  });

  it('does not load the full candidate list for one position applicants page', () => {
    const page = readFileSync(
      join(process.cwd(), 'src', 'app', '(app)', 'recruiting', 'positions', '[id]', 'applicants', 'page.tsx'),
      'utf8',
    );

    expect(page).not.toContain('.limit(1000)');
    expect(page).toContain(".eq('position_id', position.id)");
  });
});

import { describe, expect, it } from 'vitest';
import { candidateBelongsToPosition, countApplicantsByPosition } from '@/lib/recruiting/position-applicants';

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
});

export type PositionApplicantPosition = {
  id: number;
  job_title: string;
};

export type PositionApplicantCandidate = {
  id: number;
  position_id?: number | null;
  position?: string | null;
};

function normalizedTitle(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

export function candidateBelongsToPosition(
  candidate: PositionApplicantCandidate,
  position: PositionApplicantPosition,
): boolean {
  if (candidate.position_id != null) {
    return Number(candidate.position_id) === position.id;
  }

  return normalizedTitle(candidate.position) === normalizedTitle(position.job_title);
}

export function countApplicantsByPosition(
  positions: PositionApplicantPosition[],
  candidates: PositionApplicantCandidate[],
): Map<number, number> {
  const counts = new Map(positions.map((position) => [position.id, 0]));

  for (const candidate of candidates) {
    const position = positions.find((item) => candidateBelongsToPosition(candidate, item));
    if (!position) continue;
    counts.set(position.id, (counts.get(position.id) ?? 0) + 1);
  }

  return counts;
}

export function displayApplicationCode(code: string | null | undefined): string {
  const normalized = (code ?? '').trim();
  return normalized || 'No code';
}

// Pure validation for the admin activity feed's optional ?userId= filter.
export function parseActivityUserId(
  raw: string | null,
): { ok: true; userId: number | null } | { ok: false } {
  if (raw == null || raw === '') return { ok: true, userId: null };
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) return { ok: false };
  return { ok: true, userId: n };
}

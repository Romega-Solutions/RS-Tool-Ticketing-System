// Shared string formatters for the ATS (candidate names, phone numbers).
// Kept dependency-free so server actions and client components can both call them.

/**
 * Convert any casing to proper name casing.
 *   "JUAN DELA CRUZ"   → "Juan Dela Cruz"
 *   "JuAn dela cruz"   → "Juan Dela Cruz"
 *   "juan  dela  cruz" → "Juan Dela Cruz"
 *
 * Rules:
 *  - Collapse runs of whitespace to single spaces.
 *  - For each space-separated word: first character uppercase, rest lowercase.
 *  - Inside hyphenated parts ("o'connor", "ann-marie") each segment is cased
 *    the same way so "ANN-MARIE" → "Ann-Marie", "O'CONNOR" → "O'Connor".
 */
export function toProperName(input: string | null | undefined): string {
  if (!input) return '';
  const cleaned = String(input).replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';

  const caseSegment = (segment: string) =>
    segment.length === 0
      ? segment
      : segment[0].toUpperCase() + segment.slice(1).toLowerCase();

  return cleaned
    .split(' ')
    .map(word =>
      word
        .split('-')
        .map(part => part.split("'").map(caseSegment).join("'"))
        .join('-'),
    )
    .join(' ');
}

/**
 * Format a phone number with consistent spacing.
 *  - PH numbers (start with 09 or +63 9): "09xx xxx xxxx"
 *  - US numbers (10 digits or +1 + 10): "xxx xxx xxxx"
 *  - Anything else: digits preserved with a single leading "+" when present,
 *    grouped 3-3-rest as a best effort.
 *
 * Non-digit characters in the input (parentheses, dashes, dots) are stripped
 * before formatting.
 */
export function formatPhoneNumber(input: string | null | undefined): string {
  if (!input) return '';
  const raw = String(input).trim();
  if (!raw) return '';

  // Preserve a leading "+" but strip everything else non-digit.
  const hasPlus = raw.startsWith('+');
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';

  // PH local: 11 digits starting with 09 → "09xx xxx xxxx"
  if (digits.length === 11 && digits.startsWith('09')) {
    return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  }

  // PH international: +63 9xx xxx xxxx  (12 digits starting with 639)
  if (digits.length === 12 && digits.startsWith('639')) {
    return `+63 9${digits.slice(3, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`;
  }

  // US local: 10 digits (no country code) → "xxx xxx xxxx"
  if (digits.length === 10 && !hasPlus) {
    return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  }

  // US international: +1 xxx xxx xxxx  (11 digits starting with 1)
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+1 ${digits.slice(1, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  }

  // Fallback: keep the "+" and group 3-3-rest.
  const prefix = hasPlus ? '+' : '';
  if (digits.length <= 3) return `${prefix}${digits}`;
  if (digits.length <= 6) return `${prefix}${digits.slice(0, 3)} ${digits.slice(3)}`;
  return `${prefix}${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
}

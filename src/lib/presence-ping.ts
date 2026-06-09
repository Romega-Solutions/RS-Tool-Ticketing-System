export const DEFAULT_PING_MESSAGE = 'Are you online?';
export const MAX_PING_MESSAGE_LENGTH = 160;

export function normalizePingMessage(message: string | null | undefined): string {
  const normalized = (message ?? '').replace(/\s+/g, ' ').trim();
  if (!normalized) return DEFAULT_PING_MESSAGE;
  return normalized.slice(0, MAX_PING_MESSAGE_LENGTH);
}

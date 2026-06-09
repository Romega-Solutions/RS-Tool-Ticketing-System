const IMAGE_URL_PATTERN = /https?:\/\/[^\s<>"']+/gi;
const IMAGE_EXT_PATTERN = /\.(png|jpe?g|gif|webp|avif)(?:[?#].*)?$/i;
const TRAILING_PUNCTUATION = /[),.;:!?]+$/;

function cleanUrl(raw: string): string {
  let cleaned = raw.trim();
  while (TRAILING_PUNCTUATION.test(cleaned)) {
    cleaned = cleaned.replace(TRAILING_PUNCTUATION, '');
  }
  return cleaned;
}

function isDirectImageUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    return IMAGE_EXT_PATTERN.test(`${url.pathname}${url.search}${url.hash}`);
  } catch {
    return false;
  }
}

export function extractTaskDescriptionImageUrls(description: string, maxImages = 4): string[] {
  const limit = Math.max(0, Math.trunc(maxImages));
  if (!description || limit === 0) return [];

  const urls = new Set<string>();
  for (const match of description.matchAll(IMAGE_URL_PATTERN)) {
    const url = cleanUrl(match[0]);
    if (!isDirectImageUrl(url)) continue;

    urls.add(url);
    if (urls.size >= limit) break;
  }
  return [...urls];
}

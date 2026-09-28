export function normalizeDestination(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

export function destinationCacheKey(
  displayName: string,
  countryCode?: string | null,
  styleVersion = 'v1',
): string {
  const name = normalizeDestination(displayName)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\- ]+/gu, '')
    .replace(/\s+/g, '-');
  const cc = (countryCode || 'xx').toLowerCase();
  return `${name}|${cc}|${styleVersion}`;
}

export function exportFilename(destination: string, date = new Date()): string {
  const slug =
    normalizeDestination(destination)
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'postcard';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `postcard-${slug}-${y}-${m}-${d}.jpg`;
}

export function validateDestination(raw: string): {
  ok: boolean;
  value: string;
  error?: string;
} {
  const value = normalizeDestination(raw);
  if (!value) return { ok: false, value: '', error: 'Enter a destination.' };
  if (value.length > 48) {
    return {
      ok: false,
      value,
      error: 'Keep the destination under 48 characters.',
    };
  }
  return { ok: true, value };
}

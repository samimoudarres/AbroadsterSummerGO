/** Europe + Morocco passport stamp catalog. */

export type PassportCountry = {
  key: string;
  name: string;
  /** Primary badge color when unlocked (legacy / accents) */
  color: string;
};

/** Stable passport countries (Europe + Morocco). */
export const PASSPORT_COUNTRIES: PassportCountry[] = [
  { key: 'al', name: 'Albania', color: '#E41E20' },
  { key: 'ad', name: 'Andorra', color: '#10069F' },
  { key: 'at', name: 'Austria', color: '#ED2939' },
  { key: 'by', name: 'Belarus', color: '#C8312A' },
  { key: 'be', name: 'Belgium', color: '#FDDA24' },
  { key: 'ba', name: 'Bosnia and Herzegovina', color: '#002395' },
  { key: 'bg', name: 'Bulgaria', color: '#00966E' },
  { key: 'hr', name: 'Croatia', color: '#171796' },
  { key: 'cy', name: 'Cyprus', color: '#D47600' },
  { key: 'cz', name: 'Czech Republic', color: '#D7141A' },
  { key: 'dk', name: 'Denmark', color: '#C8102E' },
  { key: 'ee', name: 'Estonia', color: '#0072CE' },
  { key: 'fi', name: 'Finland', color: '#002F6C' },
  { key: 'fr', name: 'France', color: '#002395' },
  { key: 'de', name: 'Germany', color: '#FFCC00' },
  { key: 'gr', name: 'Greece', color: '#0D5EAF' },
  { key: 'hu', name: 'Hungary', color: '#436F4D' },
  { key: 'is', name: 'Iceland', color: '#02529C' },
  { key: 'ie', name: 'Ireland', color: '#169B62' },
  { key: 'it', name: 'Italy', color: '#009246' },
  { key: 'xk', name: 'Kosovo', color: '#244AA5' },
  { key: 'lv', name: 'Latvia', color: '#9E3039' },
  { key: 'li', name: 'Liechtenstein', color: '#002B7F' },
  { key: 'lt', name: 'Lithuania', color: '#FDB913' },
  { key: 'lu', name: 'Luxembourg', color: '#00A1DE' },
  { key: 'mt', name: 'Malta', color: '#CF142B' },
  { key: 'md', name: 'Moldova', color: '#0046AE' },
  { key: 'mc', name: 'Monaco', color: '#CE1126' },
  { key: 'me', name: 'Montenegro', color: '#C40308' },
  { key: 'ma', name: 'Morocco', color: '#C1272D' },
  { key: 'nl', name: 'Netherlands', color: '#FF6600' },
  { key: 'mk', name: 'North Macedonia', color: '#D20000' },
  { key: 'no', name: 'Norway', color: '#BA0C2F' },
  { key: 'pl', name: 'Poland', color: '#DC143C' },
  { key: 'pt', name: 'Portugal', color: '#006600' },
  { key: 'ro', name: 'Romania', color: '#002B7F' },
  { key: 'sm', name: 'San Marino', color: '#5EB6E4' },
  { key: 'rs', name: 'Serbia', color: '#C6363C' },
  { key: 'sk', name: 'Slovakia', color: '#0B4EA2' },
  { key: 'si', name: 'Slovenia', color: '#003DA5' },
  { key: 'es', name: 'Spain', color: '#AA151B' },
  { key: 'se', name: 'Sweden', color: '#006AA7' },
  { key: 'ch', name: 'Switzerland', color: '#FF0000' },
  { key: 'ua', name: 'Ukraine', color: '#0057B7' },
  { key: 'gb', name: 'United Kingdom', color: '#012169' },
  { key: 'va', name: 'Vatican City', color: '#FFE000' },
];

/** ISO-ish key → flag emoji (regional indicator symbols). */
export function flagEmojiForKey(key: string): string {
  const k = key.toLowerCase();
  // Kosovo has no official ISO 3166-1 alpha-2 in all systems; use XK → 🇽🇰
  if (k === 'xk') return '🇽🇰';
  if (k.length !== 2) return '🏳️';
  const A = 0x1f1e6;
  const c0 = k.charCodeAt(0) - 97;
  const c1 = k.charCodeAt(1) - 97;
  if (c0 < 0 || c0 > 25 || c1 < 0 || c1 > 25) return '🏳️';
  return String.fromCodePoint(A + c0, A + c1);
}

/**
 * Reliable flag image URL (works on Windows/web where emoji flags render as
 * two-letter codes like "FR" / "GB").
 */
export function flagImageUrl(key: string): string {
  const k = key.toLowerCase();
  // flagcdn uses ISO 3166-1 alpha-2; XK is supported for Kosovo
  return `https://flagcdn.com/w160/${k}.png`;
}

const BY_KEY = Object.fromEntries(PASSPORT_COUNTRIES.map((c) => [c.key, c]));
const BY_NAME = Object.fromEntries(
  PASSPORT_COUNTRIES.map((c) => [c.name.toLowerCase(), c]),
);

/** Alias → catalog name */
const ALIASES: Record<string, string> = {
  uk: 'United Kingdom',
  'u.k.': 'United Kingdom',
  'united kingdom of great britain and northern ireland': 'United Kingdom',
  britain: 'United Kingdom',
  england: 'United Kingdom',
  scotland: 'United Kingdom',
  wales: 'United Kingdom',
  'czech republic': 'Czech Republic',
  czechia: 'Czech Republic',
  holland: 'Netherlands',
  'the netherlands': 'Netherlands',
  macedonia: 'North Macedonia',
  'republic of north macedonia': 'North Macedonia',
  'bosnia': 'Bosnia and Herzegovina',
  'bosnia-herzegovina': 'Bosnia and Herzegovina',
  vatican: 'Vatican City',
  'holy see': 'Vatican City',
};

export function normalizeCountryName(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const t = raw.trim();
  const alias = ALIASES[t.toLowerCase()];
  if (alias) return alias;
  const hit = BY_NAME[t.toLowerCase()];
  return hit?.name ?? t;
}

export function countryKeyFromName(raw: string | null | undefined): string | null {
  const name = normalizeCountryName(raw);
  if (!name) return null;
  return BY_NAME[name.toLowerCase()]?.key ?? null;
}

export function passportCountryByKey(key: string): PassportCountry | undefined {
  return BY_KEY[key];
}

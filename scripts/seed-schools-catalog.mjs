/**
 * Seed schools catalog from Hipo university-domains-list + curated study programs.
 *
 * Usage:
 *   node scripts/seed-schools-catalog.mjs
 *
 * Optional env:
 *   EXPO_PUBLIC_LOGO_DEV_TOKEN  — Logo.dev publishable key (else Google favicon)
 *   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY — upsert into live DB
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const HIPO_URL =
  'https://raw.githubusercontent.com/Hipo/university-domains-list/master/world_universities_and_domains.json';

const LOGO_TOKEN = (process.env.EXPO_PUBLIC_LOGO_DEV_TOKEN || '').trim();
const DEFAULT_ACCENT = '#0051FF';

const BRAND = {
  'new york university': '#57068C',
  nyu: '#57068C',
  'university of texas at austin': '#BF5700',
  'university of texas': '#BF5700',
  'syracuse university': '#F76900',
  'indiana university': '#990000',
  'indiana university bloomington': '#990000',
  ucla: '#2774AE',
  'university of california, los angeles': '#2774AE',
  'university of michigan': '#00274C',
  'boston university': '#CC0000',
  'pennsylvania state university': '#041E42',
  'university of colorado boulder': '#CFB87C',
  princeton: '#E77500',
  'princeton university': '#E77500',
  harvard: '#A51C30',
  'harvard university': '#A51C30',
  yale: '#00356B',
  'yale university': '#00356B',
  stanford: '#8C1515',
  'stanford university': '#8C1515',
  mit: '#A31F34',
  'massachusetts institute of technology': '#A31F34',
  'columbia university': '#B9D9EB',
  cornell: '#B31B1B',
  'cornell university': '#B31B1B',
  'university of pennsylvania': '#011F5B',
  'duke university': '#003087',
  'northwestern university': '#4E2A84',
  'university of chicago': '#800000',
  'university of southern california': '#990000',
  'georgetown university': '#041E42',
  'university of virginia': '#232D4B',
  'university of north carolina': '#4B9CD3',
  'ohio state university': '#BA0C2F',
  'university of wisconsin': '#C5050C',
  'university of washington': '#4B2E83',
  'university of florida': '#0021A5',
  'university of georgia': '#BA0C2F',
  'texas a&m university': '#500000',
  'arizona state university': '#8C1D40',
  'university of arizona': '#CC0033',
  'university of illinois': '#E84A27',
  'university of california, berkeley': '#003262',
  'university of california, san diego': '#182B49',
  'university of oxford': '#002147',
  'university of cambridge': '#A3C1AD',
  'london school of economics': '#E6007E',
  'university college london': '#EA2E49',
  'imperial college london': '#003E74',
  ciee: '#0051FF',
  'ies abroad': '#1A1A6C',
  dis: '#E31837',
  'cea capa': '#00A3E0',
  api: '#C8102E',
  aifs: '#0033A0',
  sit: '#E87722',
};

const APP_REFERENCED = [
  'indiana university',
  'syracuse university',
  'ucla',
  'university of michigan',
  'new york university',
  'boston university',
  'pennsylvania state',
  'university of texas',
  'university of colorado',
  'cu boulder',
];

/** Priority countries — keep more schools (capped). */
const PRIORITY_INTL = new Set([
  'United Kingdom',
  'France',
  'Italy',
  'Spain',
  'Germany',
  'Netherlands',
  'Ireland',
  'Australia',
  'Canada',
  'Japan',
  'China',
]);

/** Other study destinations — smaller cap. */
const SECONDARY_INTL = new Set([
  'Denmark',
  'Sweden',
  'Austria',
  'Switzerland',
  'Belgium',
  'Portugal',
  'New Zealand',
  'South Korea',
  'Singapore',
  'United Arab Emirates',
  'Mexico',
  'Brazil',
  'Argentina',
  'Chile',
  'South Africa',
  'Morocco',
  'Czech Republic',
  'Hungary',
  'Greece',
  'Norway',
  'Finland',
  'Taiwan',
  'Hong Kong',
  'India',
]);

const INTL_COUNTRIES = new Set([...PRIORITY_INTL, ...SECONDARY_INTL]);

/** Curated study-abroad programs (map pins). Kept in sync with data/studyAbroadPrograms.ts */
const STUDY_PROGRAMS = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'data', 'studyAbroadPrograms.json'), 'utf8'),
);

function slugify(name) {
  return String(name)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

function brandFor(name) {
  const key = name.trim().toLowerCase();
  if (BRAND[key]) return BRAND[key];
  for (const [k, hex] of Object.entries(BRAND)) {
    if (key.includes(k) || k.includes(key)) return hex;
  }
  return DEFAULT_ACCENT;
}

function logoUrl(domain) {
  if (!domain) return null;
  const d = domain.replace(/^www\./, '');
  if (LOGO_TOKEN) {
    return `https://img.logo.dev/${d}?token=${LOGO_TOKEN}&size=128&format=png`;
  }
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(d)}&sz=128`;
}

function intlScore(row) {
  const name = (row.name || '').toLowerCase();
  const domains = row.domains || [];
  const d0 = String(domains[0] || '').toLowerCase();
  let score = 0;
  if (APP_REFERENCED.some((r) => name.includes(r))) score += 100;
  if (/university|college|institute|école|universit/.test(name)) score += 10;
  if (d0.endsWith('.edu') || d0.endsWith('.ac.uk') || d0.endsWith('.edu.au')) score += 20;
  if (d0.endsWith('.ac.jp') || d0.endsWith('.edu.cn') || d0.endsWith('.edu.sg')) score += 10;
  // Prefer shorter, well-known names
  score += Math.max(0, 40 - name.length);
  score += Math.max(0, 5 - domains.length);
  return score;
}

async function fetchHipo() {
  const cachePath = path.join(ROOT, 'data', 'catalog', '_hipo_cache.json');
  if (fs.existsSync(cachePath)) {
    console.log('Using cached Hipo JSON…');
    return JSON.parse(fs.readFileSync(cachePath, 'utf8'));
  }
  console.log('Downloading Hipo university list…');
  const res = await fetch(HIPO_URL);
  if (!res.ok) throw new Error(`Hipo download failed: ${res.status}`);
  const data = await res.json();
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  fs.writeFileSync(cachePath, JSON.stringify(data));
  return data;
}

function toInstitution(row) {
  const name = (row.name || '').trim();
  const domains = (row.domains || []).filter(Boolean);
  const domain = domains[0];
  return {
    slug: slugify(name),
    name,
    country: row.country || '',
    state: row['state-province'] || null,
    domains,
    website: row.web_pages?.[0] || `https://${domain}`,
    logo_url: logoUrl(domain),
    accent_hex: brandFor(name),
    kind: 'university',
    source: 'hipo',
    search_name: name.toLowerCase(),
  };
}

function buildInstitutions(hipo) {
  const seen = new Set();
  const out = [];
  const intlByCountry = new Map();

  for (const row of hipo) {
    const name = (row.name || '').trim();
    const domains = (row.domains || []).filter(Boolean);
    if (!name || domains.length === 0) continue;

    const country = row.country || '';
    if (country === 'United States') {
      const inst = toInstitution(row);
      if (!inst.slug || seen.has(inst.slug)) continue;
      seen.add(inst.slug);
      out.push(inst);
      continue;
    }

    if (!INTL_COUNTRIES.has(country)) continue;
    if (!intlByCountry.has(country)) intlByCountry.set(country, []);
    intlByCountry.get(country).push(row);
  }

  for (const [country, rows] of intlByCountry) {
    const cap = PRIORITY_INTL.has(country) ? 60 : 20;
    rows
      .sort((a, b) => intlScore(b) - intlScore(a))
      .slice(0, cap)
      .forEach((row) => {
        const inst = toInstitution(row);
        if (!inst.slug || seen.has(inst.slug)) return;
        seen.add(inst.slug);
        out.push(inst);
      });
  }

  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

function buildPrograms() {
  return STUDY_PROGRAMS.map((p) => {
    const domain = (p.domains && p.domains[0]) || null;
    return {
      slug: p.slug,
      name: p.name,
      short_name: p.shortName || p.short_name,
      provider: p.provider,
      city: p.city,
      country: p.country,
      latitude: p.latitude,
      longitude: p.longitude,
      address: p.address || `${p.city}, ${p.country}`,
      domains: p.domains || [],
      logo_url: logoUrl(domain),
      accent_hex: p.accentHex || p.accent_hex || brandFor(p.name),
      is_active: true,
    };
  });
}

async function upsertSupabase(institutions, programs) {
  const url = (process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || '').trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) {
    console.log('Skipping Supabase upsert (no SUPABASE_URL / SERVICE_ROLE_KEY).');
    return;
  }

  async function upsert(table, rows, onConflict) {
    const chunk = 200;
    for (let i = 0; i < rows.length; i += chunk) {
      const slice = rows.slice(i, i + chunk);
      const res = await fetch(`${url}/rest/v1/${table}?on_conflict=${onConflict}`, {
        method: 'POST',
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify(slice),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`${table} upsert failed: ${res.status} ${text}`);
      }
      console.log(`  upserted ${table} ${i + slice.length}/${rows.length}`);
    }
  }

  console.log('Upserting to Supabase…');
  await upsert('institutions', institutions, 'slug');
  await upsert('study_programs', programs, 'slug');
}

async function main() {
  const catalogDir = path.join(ROOT, 'data', 'catalog');
  fs.mkdirSync(catalogDir, { recursive: true });

  const hipo = await fetchHipo();
  const institutions = buildInstitutions(hipo);
  const programs = buildPrograms();

  fs.writeFileSync(
    path.join(catalogDir, 'institutions.json'),
    JSON.stringify(institutions, null, 0),
  );
  fs.writeFileSync(
    path.join(catalogDir, 'programs.json'),
    JSON.stringify(programs, null, 0),
  );

  console.log(`Wrote ${institutions.length} institutions, ${programs.length} programs`);
  console.log(`Logo mode: ${LOGO_TOKEN ? 'Logo.dev' : 'Google favicon'}`);

  await upsertSupabase(institutions, programs);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

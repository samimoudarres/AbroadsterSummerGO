import institutionsJson from '../../data/catalog/institutions.json';
import programsJson from '../../data/catalog/programs.json';
import {
  brandColorForName,
  DEFAULT_SCHOOL_ACCENT,
} from '../../data/schoolBrandColors';
import type { FilterChip, ImageSource, ProgramPin } from '../../data/types';

export type CatalogInstitution = {
  slug: string;
  name: string;
  country: string;
  state?: string | null;
  domains: string[];
  website?: string | null;
  logo_url?: string | null;
  accent_hex: string;
  kind?: string;
  source?: string;
  search_name?: string;
  id?: string;
};

export type CatalogProgram = {
  slug: string;
  name: string;
  short_name: string;
  provider: string;
  city: string;
  country: string;
  latitude: number;
  longitude: number;
  address?: string | null;
  domains: string[];
  logo_url?: string | null;
  accent_hex: string;
  is_active?: boolean;
  id?: string;
};

export type SchoolVisual = {
  logoUrl: string | null;
  accent: string;
  slug?: string;
  kind: 'institution' | 'program' | 'unknown';
};

const institutions = institutionsJson as CatalogInstitution[];
const catalogPrograms = programsJson as CatalogProgram[];

/** Short demo / UI labels → Hipo catalog institution names. */
const INSTITUTION_NAME_ALIASES: Record<string, string> = {
  'ut austin': 'The University of Texas at Austin',
  'university of texas at austin': 'The University of Texas at Austin',
  'university of texas': 'The University of Texas at Austin',
  ucla: 'University of California, Los Angeles',
  nyu: 'New York University',
  'u of m': 'University of Michigan - Ann Arbor',
  'university of michigan': 'University of Michigan - Ann Arbor',
  michigan: 'University of Michigan - Ann Arbor',
  'indiana university': 'Indiana University',
  indiana: 'Indiana University',
  syracuse: 'Syracuse University',
  'boston university': 'Boston University',
  bu: 'Boston University',
  duke: 'Duke University',
  'duke university': 'Duke University',
};

function nameMatch(a: string, b: string): boolean {
  const x = a.trim().toLowerCase();
  const y = b.trim().toLowerCase();
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

function resolveInstitutionAlias(name: string): string {
  const key = name.trim().toLowerCase();
  return INSTITUTION_NAME_ALIASES[key] || name.trim();
}

function demoStudentCount(programName: string): number {
  // Stable faux count when live roster size is unknown
  let h = 0;
  for (let i = 0; i < programName.length; i++) {
    h = (h * 31 + programName.charCodeAt(i)) | 0;
  }
  return 40 + Math.abs(h % 90);
}

export function isUsInstitution(inst: CatalogInstitution): boolean {
  const c = (inst.country || '').toLowerCase();
  return (
    c === 'united states' ||
    c === 'usa' ||
    c === 'us' ||
    c === 'u.s.' ||
    c === 'u.s.a.'
  );
}

/** How many people from this school are on Abroadster (demo roster + baseline). */
export function countMembersForHomeSchool(
  schoolName: string,
  profileHomeUnis: string[] = [],
): number {
  const target = resolveInstitutionAlias(schoolName).toLowerCase();
  let n = 0;
  for (const home of profileHomeUnis) {
    const h = resolveInstitutionAlias(home).toLowerCase();
    if (h === target || nameMatch(h, target)) n += 1;
  }
  // Keep a small catalog baseline so popular schools don't show 0 in demo
  if (n === 0) return Math.max(3, Math.floor(demoStudentCount(schoolName) / 8));
  return n + Math.floor(demoStudentCount(schoolName) / 20);
}

export function countMembersForProgram(
  programName: string,
  profilePrograms: string[] = [],
): number {
  const target = programName.trim().toLowerCase();
  let n = 0;
  for (const p of profilePrograms) {
    if (nameMatch(p, target)) n += 1;
  }
  if (n === 0) return Math.max(2, Math.floor(demoStudentCount(programName) / 10));
  return n + Math.floor(demoStudentCount(programName) / 25);
}

/** Local catalog institutions (demo / offline). */
export function getLocalInstitutions(): CatalogInstitution[] {
  return institutions;
}

/** Local catalog study programs (demo / offline). */
export function getLocalStudyPrograms(): CatalogProgram[] {
  return catalogPrograms;
}

export function searchInstitutionsLocal(q: string, limit = 20): CatalogInstitution[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  const scored = institutions
    .map((inst) => {
      const name = inst.name.toLowerCase();
      const search = (inst.search_name || name).toLowerCase();
      let score = 99;
      if (name === needle) score = 0;
      else if (name.startsWith(needle)) score = 1;
      else if (search.includes(needle) || name.includes(needle)) score = 2;
      else return null;
      return { inst, score };
    })
    .filter(Boolean) as { inst: CatalogInstitution; score: number }[];
  scored.sort((a, b) => a.score - b.score || a.inst.name.localeCompare(b.inst.name));
  return scored.slice(0, limit).map((s) => s.inst);
}

export function getInstitutionByName(name: string): CatalogInstitution | null {
  const raw = name.trim();
  if (!raw) return null;
  const q = resolveInstitutionAlias(raw);
  const exact = institutions.find((i) => i.name.toLowerCase() === q.toLowerCase());
  if (exact) return exact;
  // Alias hits must not fall through to loose includes (UCLA ↛ Berkeley)
  if (INSTITUTION_NAME_ALIASES[raw.toLowerCase()]) return null;
  return institutions.find((i) => nameMatch(i.name, q)) ?? null;
}

export function getProgramByName(name: string): CatalogProgram | null {
  const q = name.trim();
  if (!q) return null;
  const exact = catalogPrograms.find(
    (p) =>
      p.name.toLowerCase() === q.toLowerCase() ||
      p.short_name.toLowerCase() === q.toLowerCase(),
  );
  if (exact) return exact;
  return (
    catalogPrograms.find(
      (p) => nameMatch(p.name, q) || nameMatch(p.short_name, q),
    ) ?? null
  );
}

export function resolveSchoolVisual(input: {
  name: string;
}): SchoolVisual {
  const name = input.name?.trim() || '';
  if (!name) {
    return { logoUrl: null, accent: DEFAULT_SCHOOL_ACCENT, kind: 'unknown' };
  }

  // Known short uni labels (NYU, UCLA, UT Austin) should win over program name clashes
  const aliasedInst = INSTITUTION_NAME_ALIASES[name.toLowerCase()]
    ? getInstitutionByName(name)
    : null;
  if (aliasedInst) {
    return {
      logoUrl: aliasedInst.logo_url || null,
      accent:
        aliasedInst.accent_hex ||
        brandColorForName(name) ||
        DEFAULT_SCHOOL_ACCENT,
      slug: aliasedInst.slug,
      kind: 'institution',
    };
  }

  const prog = getProgramByName(name);
  if (prog) {
    return {
      logoUrl: prog.logo_url || null,
      accent: prog.accent_hex || brandColorForName(name) || DEFAULT_SCHOOL_ACCENT,
      slug: prog.slug,
      kind: 'program',
    };
  }

  const inst = getInstitutionByName(name);
  if (inst) {
    return {
      logoUrl: inst.logo_url || null,
      accent: inst.accent_hex || brandColorForName(name) || DEFAULT_SCHOOL_ACCENT,
      slug: inst.slug,
      kind: 'institution',
    };
  }

  return {
    logoUrl: null,
    accent: brandColorForName(name) || DEFAULT_SCHOOL_ACCENT,
    kind: 'unknown',
  };
}

export function programToPin(p: CatalogProgram): ProgramPin {
  return {
    id: `prog-${p.slug}`,
    name: p.name,
    shortName: p.short_name,
    logo: (p.logo_url || '') as ImageSource,
    latitude: p.latitude,
    longitude: p.longitude,
    // Live roster fills this on the map; never show a fake demo count.
    studentCount: 0,
    city: p.city,
    country: p.country,
    accent: p.accent_hex,
  };
}

export function listStudyProgramPins(): ProgramPin[] {
  return catalogPrograms.map(programToPin);
}

/** Filter chips: popular home unis + featured abroad programs. */
export function buildFilterChips(): FilterChip[] {
  const uniNames = [
    'Syracuse University',
    'Indiana University',
    'New York University',
    'University of Texas at Austin',
    'University of California, Los Angeles',
    'University of Michigan',
    'Boston University',
  ];
  const programSlugs = [
    'nyu-london',
    'syracuse-london',
    'ciee-paris',
    'ies-paris',
    'dis-copenhagen',
    'cea-barcelona',
    'syracuse-florence',
    'nyu-florence',
  ];

  const chips: FilterChip[] = [];

  for (const slug of programSlugs) {
    const p = catalogPrograms.find((x) => x.slug === slug);
    if (!p) continue;
    chips.push({
      id: `filter-${p.slug}`,
      label: p.short_name || p.name,
      type: 'program',
      accent: p.accent_hex || DEFAULT_SCHOOL_ACCENT,
      logo: p.logo_url || undefined,
      subtitle: undefined,
    });
  }

  for (const name of uniNames) {
    const inst =
      institutions.find((i) => i.name.toLowerCase() === name.toLowerCase()) ||
      getInstitutionByName(name);
    if (!inst) continue;
    chips.push({
      id: `filter-${inst.slug}`,
      label:
        name.includes('Los Angeles')
          ? 'UCLA'
          : name.includes('Texas')
            ? 'UT Austin'
            : name.includes('New York')
              ? 'NYU'
              : inst.name.replace(/ University$/, ''),
      type: 'university',
      accent: inst.accent_hex || DEFAULT_SCHOOL_ACCENT,
      logo: inst.logo_url || undefined,
    });
  }

  return chips;
}

function shortUniversityLabel(name: string, inst: CatalogInstitution | null): string {
  const n = name.trim();
  if (n.toLowerCase().includes('los angeles') || /^ucla$/i.test(n)) return 'UCLA';
  if (n.toLowerCase().includes('texas') || /ut austin/i.test(n)) return 'UT Austin';
  if (n.toLowerCase().includes('new york') || /^nyu$/i.test(n)) return 'NYU';
  if (inst?.name) {
    return inst.name
      .replace(/^The\s+/i, '')
      .replace(/\s+University$/i, '')
      .replace(/\s+-\s+Ann Arbor$/i, '');
  }
  return n.replace(/\s+University$/i, '');
}

function slugifySchool(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
}

/** Build a filter chip for any school/program label (catalog or free-text). */
export function chipFromSchoolLabel(
  label: string,
  type: 'university' | 'program',
): FilterChip | null {
  const q = label.trim();
  if (!q) return null;

  if (type === 'university') {
    const inst = getInstitutionByName(q);
    const visual = resolveSchoolVisual({ name: q });
    const slug = inst?.slug || visual.slug || slugifySchool(q);
    return {
      id: `filter-${slug}`,
      label: shortUniversityLabel(q, inst),
      type: 'university',
      accent: visual.accent || DEFAULT_SCHOOL_ACCENT,
      logo: visual.logoUrl || undefined,
    };
  }

  const prog = getProgramByName(q);
  const visual = resolveSchoolVisual({ name: q });
  const slug = prog?.slug || visual.slug || slugifySchool(q);
  return {
    id: `filter-${slug}`,
    label: prog?.short_name || q,
    type: 'program',
    accent: visual.accent || DEFAULT_SCHOOL_ACCENT,
    logo: visual.logoUrl || undefined,
  };
}

/** Resolve a school/program label to a map drawer filter chip. */
export function findFilterChipForLabel(
  label: string,
  type: 'university' | 'program',
): FilterChip | null {
  const q = label.trim();
  if (!q) return null;
  const chips = buildFilterChips().filter((c) => c.type === type);

  const byLabel = chips.find(
    (c) =>
      c.label.toLowerCase() === q.toLowerCase() || nameMatch(c.label, q),
  );
  if (byLabel) return byLabel;

  if (type === 'university') {
    const inst = getInstitutionByName(q);
    if (inst) {
      const fromBuild = chips.find((c) => c.id === `filter-${inst.slug}`);
      if (fromBuild) return fromBuild;
    }
    return chipFromSchoolLabel(q, 'university');
  }

  const prog = getProgramByName(q);
  if (prog) {
    const fromBuild = chips.find((c) => c.id === `filter-${prog.slug}`);
    if (fromBuild) return fromBuild;
  }
  return chipFromSchoolLabel(q, 'program');
}

/** Default map pills: current user's study-abroad program + home university. */
export function buildDefaultSchoolChips(me: {
  homeUniversity?: string | null;
  studyAbroadProgram?: string | null;
}): FilterChip[] {
  const chips: FilterChip[] = [];
  const abroad = me.studyAbroadProgram?.trim();
  const home = me.homeUniversity?.trim();
  if (abroad) {
    const chip = findFilterChipForLabel(abroad, 'program');
    if (chip) chips.push(chip);
  }
  if (home) {
    const chip = findFilterChipForLabel(home, 'university');
    if (chip && !chips.some((c) => c.id === chip.id)) chips.push(chip);
  }
  return chips;
}

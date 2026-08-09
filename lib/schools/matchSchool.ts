import {
  getInstitutionByName,
  getProgramByName,
} from './catalog';

/** Collapse filler words / punctuation so "NYU London" ↔ "NYU in London". */
export function normalizeSchoolText(value: string): string {
  return (value || '')
    .trim()
    .toLowerCase()
    .replace(/\b(in|at|the|of)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * True when two school/program labels refer to the same place.
 * Avoids loose substring traps (e.g. "NYU" alone must not equal every NYU program
 * unless both sides resolve to the same short token intentionally).
 */
export function schoolLabelsMatch(a: string, b: string): boolean {
  const na = normalizeSchoolText(a);
  const nb = normalizeSchoolText(b);
  if (!na || !nb) return false;
  if (na === nb) return true;

  const wa = na.split(' ').filter((w) => w.length > 1);
  const wb = nb.split(' ').filter((w) => w.length > 1);

  // Multi-word: every significant token of the shorter side must appear in the longer
  if (wa.length >= 2 && wb.length >= 2) {
    const [shorter, longer] = wa.length <= wb.length ? [wa, nb] : [wb, na];
    if (shorter.every((w) => longer.includes(w))) return true;
  }

  // One side is a short alias (e.g. "Duke", "UCLA") — allow as a whole-token hit
  // only when the other side is a single token or starts with that alias.
  if (wa.length === 1 && wa[0].length >= 3) {
    if (wb[0] === wa[0]) return true;
    if (wb.length >= 2 && wb.includes(wa[0])) return true;
  }
  if (wb.length === 1 && wb[0].length >= 3) {
    if (wa[0] === wb[0]) return true;
    if (wa.length >= 2 && wa.includes(wb[0])) return true;
  }

  // Safe contains only when the contained string is long enough to be specific
  const minLen = 8;
  if (na.length >= minLen && nb.includes(na)) return true;
  if (nb.length >= minLen && na.includes(nb)) return true;

  return false;
}

/** Profile study-abroad program vs chip / catalog label. */
export function matchesStudyProgram(
  profileProgram: string,
  label: string,
): boolean {
  const profile = (profileProgram || '').trim();
  const chip = (label || '').trim();
  if (!profile || !chip) return false;

  if (schoolLabelsMatch(profile, chip)) return true;

  // Resolve BOTH sides to catalog entries and compare — never treat
  // "chip label matches its own catalog row" as a profile match.
  const catChip = getProgramByName(chip);
  const catProfile = getProgramByName(profile);
  if (catChip && catProfile) {
    return catChip.slug === catProfile.slug;
  }
  if (catChip) {
    return [catChip.name, catChip.short_name].some((alias) =>
      schoolLabelsMatch(profile, alias || ''),
    );
  }
  if (catProfile) {
    return [catProfile.name, catProfile.short_name].some((alias) =>
      schoolLabelsMatch(chip, alias || ''),
    );
  }
  return false;
}

/** Profile home university vs chip / catalog label. */
export function matchesHomeUniversity(
  homeUniversity: string,
  label: string,
): boolean {
  const home = (homeUniversity || '').trim();
  const chip = (label || '').trim();
  if (!home || !chip) return false;

  if (schoolLabelsMatch(home, chip)) return true;

  const instHome = getInstitutionByName(home);
  const instLabel = getInstitutionByName(chip);
  if (instHome && instLabel) {
    return instHome.slug === instLabel.slug;
  }
  if (instLabel) {
    return schoolLabelsMatch(home, instLabel.name);
  }
  if (instHome) {
    return schoolLabelsMatch(chip, instHome.name);
  }

  // Explicit short aliases only (whole-token / known brands)
  const l = normalizeSchoolText(chip);
  const h = normalizeSchoolText(home);
  if (l === 'ucla') {
    return h.includes('ucla') || h.includes('los angeles');
  }
  if (l === 'ut austin') {
    return (
      h.includes('ut austin') ||
      h.includes('university of texas at austin') ||
      h === 'texas'
    );
  }
  if (l === 'nyu') {
    return h === 'nyu' || h.includes('new york university') || h.startsWith('nyu ');
  }
  if (l === 'duke') {
    return h === 'duke' || h.startsWith('duke ');
  }
  return false;
}

/** Expand a UI label into all strings the backend / client should match. */
export function schoolMatchAliases(
  kind: 'program' | 'university',
  label: string,
): string[] {
  const raw = (label || '').trim();
  if (!raw) return [];
  const out = new Set<string>([raw]);
  if (kind === 'program') {
    const p = getProgramByName(raw);
    if (p) {
      out.add(p.name);
      out.add(p.short_name);
    }
  } else {
    const inst = getInstitutionByName(raw);
    if (inst) {
      out.add(inst.name);
    }
  }
  return [...out].filter(Boolean);
}

import { distanceMiles } from './geo';
import { schoolMapTarget } from './schoolMapTarget';
import { getProgramByName } from './schools/catalog';
import { lookupTripCoords } from './tripCoords';

export type ExplorerTripInput = {
  status: 'upcoming' | 'planning';
  destinationCity: string;
  destinationCountry: string;
  latitude?: number | null;
  longitude?: number | null;
};

export type LatLng = { latitude: number; longitude: number };

/** Resolve a school or program label to coordinates (sync, local only). */
export function resolvePointForSchool(name: string | null | undefined): LatLng | null {
  if (!name?.trim()) return null;
  const cam = schoolMapTarget(name);
  if (cam) return { latitude: cam.latitude, longitude: cam.longitude };

  const prog = getProgramByName(name);
  if (prog) {
    if (
      Number.isFinite(prog.latitude) &&
      Number.isFinite(prog.longitude)
    ) {
      return { latitude: prog.latitude, longitude: prog.longitude };
    }
    const cityPt = lookupTripCoords(prog.city, prog.country);
    if (cityPt) return cityPt;
  }
  return null;
}

/** Resolve a city (+ optional country) to coordinates (sync, local only). */
export function resolvePointForCity(
  city: string | null | undefined,
  country: string | null | undefined,
): LatLng | null {
  if (!city?.trim()) return null;
  return lookupTripCoords(city, country ?? '');
}

function tripPoint(t: ExplorerTripInput): LatLng | null {
  if (
    typeof t.latitude === 'number' &&
    typeof t.longitude === 'number' &&
    Number.isFinite(t.latitude) &&
    Number.isFinite(t.longitude)
  ) {
    return { latitude: t.latitude, longitude: t.longitude };
  }
  return resolvePointForCity(t.destinationCity, t.destinationCountry);
}

/**
 * Explorer Score (miles):
 * baseline = home university → abroad program
 * + unique locked-in (upcoming) trip destinations from host city
 */
export function computeExplorerScoreMiles(input: {
  homeUniversity: string | null | undefined;
  studyAbroadProgram: string | null | undefined;
  hostCity: string | null | undefined;
  hostCountry: string | null | undefined;
  trips: ExplorerTripInput[];
}): number {
  let total = 0;

  const home = resolvePointForSchool(input.homeUniversity);
  const abroad = resolvePointForSchool(input.studyAbroadProgram);
  if (home && abroad) {
    total += Math.round(
      distanceMiles(home.latitude, home.longitude, abroad.latitude, abroad.longitude),
    );
  }

  const host =
    resolvePointForCity(input.hostCity, input.hostCountry) ||
    abroad ||
    resolvePointForSchool(input.studyAbroadProgram);

  if (host) {
    const seen = new Set<string>();
    for (const t of input.trips) {
      if (t.status !== 'upcoming') continue;
      const destKey = `${t.destinationCity.trim().toLowerCase()}|${(
        t.destinationCountry || ''
      )
        .trim()
        .toLowerCase()}`;
      if (!destKey.startsWith('|') && seen.has(destKey)) continue;
      if (destKey !== '|') seen.add(destKey);

      const dest = tripPoint(t);
      if (!dest) continue;
      total += Math.round(
        distanceMiles(host.latitude, host.longitude, dest.latitude, dest.longitude),
      );
    }
  }

  return Math.max(0, total);
}

export function formatExplorerScore(miles: number): string {
  return Math.round(miles).toLocaleString('en-US');
}

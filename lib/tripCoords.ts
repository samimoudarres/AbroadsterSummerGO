import { searchPlaces } from './geocode';

/** Known destination centers for seed / legacy trips missing lat/lng. */
const CITY_COORDS: Record<string, { latitude: number; longitude: number }> = {
  'budapest|hungary': { latitude: 47.4979, longitude: 19.0402 },
  'paris|france': { latitude: 48.8566, longitude: 2.3522 },
  'rome|italy': { latitude: 41.9028, longitude: 12.4964 },
  'barcelona|spain': { latitude: 41.3874, longitude: 2.1686 },
  'santorini|greece': { latitude: 36.3932, longitude: 25.4615 },
  'london|uk': { latitude: 51.5074, longitude: -0.1278 },
  'london|united kingdom': { latitude: 51.5074, longitude: -0.1278 },
  'lisbon|portugal': { latitude: 38.7223, longitude: -9.1393 },
  'amsterdam|netherlands': { latitude: 52.3676, longitude: 4.9041 },
  'athens|greece': { latitude: 37.9838, longitude: 23.7275 },
  'nice|france': { latitude: 43.7102, longitude: 7.262 },
  'florence|italy': { latitude: 43.7696, longitude: 11.2558 },
  'madrid|spain': { latitude: 40.4168, longitude: -3.7038 },
  'berlin|germany': { latitude: 52.52, longitude: 13.405 },
  'vienna|austria': { latitude: 48.2082, longitude: 16.3738 },
  'prague|czech republic': { latitude: 50.0755, longitude: 14.4378 },
  'prague|czechia': { latitude: 50.0755, longitude: 14.4378 },
};

function key(city: string, country: string) {
  return `${city.trim().toLowerCase()}|${country.trim().toLowerCase()}`;
}

/** Instant lookup for common destinations (no network). */
export function lookupTripCoords(
  city: string,
  country: string,
): { latitude: number; longitude: number } | null {
  if (!city.trim()) return null;
  const exact = CITY_COORDS[key(city, country)];
  if (exact) return exact;
  const cityOnly = city.trim().toLowerCase();
  for (const [k, v] of Object.entries(CITY_COORDS)) {
    if (k.startsWith(`${cityOnly}|`)) return v;
  }
  return null;
}

/**
 * Resolve trip coordinates: use stored values, then known cities, then place search.
 * Used so legacy / seed trips without lat/lng still appear on the map.
 */
export async function resolveTripCoords(
  city: string,
  country: string,
  latitude?: number | null,
  longitude?: number | null,
  mapboxToken?: string,
): Promise<{ latitude: number; longitude: number } | null> {
  if (
    typeof latitude === 'number' &&
    typeof longitude === 'number' &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude)
  ) {
    return { latitude, longitude };
  }

  const known = lookupTripCoords(city, country);
  if (known) return known;

  const q = [city, country].filter(Boolean).join(', ').trim();
  if (q.length < 2) return null;
  try {
    const hits = await searchPlaces(q, mapboxToken);
    const hit = hits[0];
    if (hit) return { latitude: hit.latitude, longitude: hit.longitude };
  } catch {
    // ignore
  }
  return null;
}

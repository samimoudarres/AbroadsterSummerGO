import { getLocalStudyPrograms, getProgramByName } from '../schools/catalog';
import { lookupCityCenter, scatterAround } from '../userLocation';

export type ProfileCoordsInput = {
  id: string;
  hostCity?: string | null;
  hostCountry?: string | null;
  studyAbroadProgram?: string | null;
  hostLatitude?: number | null;
  hostLongitude?: number | null;
  /** Device GPS — used for the live pin when present. */
  liveLatitude?: number | null;
  liveLongitude?: number | null;
  /** Reverse-geocoded label for live GPS (e.g. "Boston, United States"). */
  liveLocationLabel?: string | null;
  /** When true, skip city/program scatter so the pin sits on the exact host point. */
  isCurrentUser?: boolean;
};

export type ResolvedProfileCoords = {
  latitude: number;
  longitude: number;
  locationLabel: string;
  source: 'host' | 'program' | 'city' | 'live' | 'fallback';
};

function validCoord(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180 &&
    !(lat === 0 && lng === 0)
  );
}

/** City center from hard-coded table or study-program catalog. */
export function lookupHostCityCenter(
  cityName: string | null | undefined,
): { latitude: number; longitude: number; label: string } | null {
  const city = (cityName || '').trim();
  if (!city) return null;
  const known = lookupCityCenter(city);
  if (known) return known;

  const aliases: Record<string, string> = {
    firenze: 'florence',
    milano: 'milan',
    roma: 'rome',
    munchen: 'munich',
    'münchen': 'munich',
  };
  const primary = city.split(',')[0]?.trim() || city;
  const q = (aliases[primary.toLowerCase()] || primary).toLowerCase();
  const programs = getLocalStudyPrograms();
  const hit =
    programs.find((p) => p.city.toLowerCase() === q) ||
    programs.find(
      (p) =>
        p.city.toLowerCase().includes(q) ||
        q.includes(p.city.toLowerCase()),
    );
  if (hit && validCoord(hit.latitude, hit.longitude)) {
    return {
      latitude: hit.latitude,
      longitude: hit.longitude,
      label: hit.country ? `${hit.city}, ${hit.country}` : hit.city,
    };
  }
  return null;
}

/**
 * Single source of truth for where a profile pin appears on the map.
 * Live GPS (when published) is the actual current location. Host city / program
 * is the fallback when the user is not sharing device location.
 */
export function resolveProfileMapCoords(
  p: ProfileCoordsInput,
): ResolvedProfileCoords | null {
  const city = (p.hostCity || '').trim();
  const country = (p.hostCountry || '').trim();
  const cityLabel = city
    ? country
      ? `${city}, ${country}`
      : city
    : '';

  let base: ResolvedProfileCoords | null = null;

  if (validCoord(p.hostLatitude, p.hostLongitude)) {
    base = {
      latitude: p.hostLatitude as number,
      longitude: p.hostLongitude as number,
      locationLabel: cityLabel || 'Abroad',
      source: 'host',
    };
  }

  // Prefer explicit host city over program campus when the user set a city
  // (e.g. host Firenze should not jump to a London program pin).
  if (!base && city) {
    const center = lookupHostCityCenter(city);
    if (center) {
      // Your own pin sits on the city center; others scatter slightly so they don't stack
      const point = p.isCurrentUser
        ? { latitude: center.latitude, longitude: center.longitude }
        : scatterAround(center.latitude, center.longitude, p.id, 1.2);
      base = {
        latitude: point.latitude,
        longitude: point.longitude,
        locationLabel: cityLabel || center.label,
        source: 'city',
      };
    }
  }

  if (!base) {
    const prog = getProgramByName(p.studyAbroadProgram || '');
    if (prog && validCoord(prog.latitude, prog.longitude)) {
      const point = p.isCurrentUser
        ? { latitude: prog.latitude, longitude: prog.longitude }
        : scatterAround(prog.latitude, prog.longitude, p.id, 0.8);
      base = {
        latitude: point.latitude,
        longitude: point.longitude,
        locationLabel:
          cityLabel ||
          (prog.city
            ? `${prog.city}${prog.country ? `, ${prog.country}` : ''}`
            : prog.name),
        source: 'program',
      };
    }
  }

  if (!base) {
    const prog = getProgramByName(p.studyAbroadProgram || '');
    const fromProgCity = prog ? lookupHostCityCenter(prog.city) : null;
    if (fromProgCity) {
      const point = p.isCurrentUser
        ? {
            latitude: fromProgCity.latitude,
            longitude: fromProgCity.longitude,
          }
        : scatterAround(
            fromProgCity.latitude,
            fromProgCity.longitude,
            p.id,
            1.2,
          );
      base = {
        latitude: point.latitude,
        longitude: point.longitude,
        locationLabel: cityLabel || fromProgCity.label,
        source: 'city',
      };
    }
  }

  if (validCoord(p.liveLatitude, p.liveLongitude)) {
    const liveLabel = (p.liveLocationLabel || '').trim();
    return {
      latitude: p.liveLatitude as number,
      longitude: p.liveLongitude as number,
      locationLabel: liveLabel || 'Current location',
      source: 'live',
    };
  }

  return base;
}

/** Best-effort coords to persist on profiles.host_latitude/longitude. */
export function coordsForHostPersistence(input: {
  hostCity?: string | null;
  studyAbroadProgram?: string | null;
}): { latitude: number; longitude: number } | null {
  const center = lookupHostCityCenter(input.hostCity);
  if (center) {
    return { latitude: center.latitude, longitude: center.longitude };
  }
  const prog = getProgramByName(input.studyAbroadProgram || '');
  if (prog && validCoord(prog.latitude, prog.longitude)) {
    return { latitude: prog.latitude, longitude: prog.longitude };
  }
  return null;
}

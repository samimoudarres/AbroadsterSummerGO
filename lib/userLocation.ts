import type { LocationPrivacy, UserProfile } from '../data/types';

/** Known study-abroad / trip city centers used when privacy is "city" or GPS is off. */
export const CITY_CENTERS: Record<
  string,
  { latitude: number; longitude: number; label: string }
> = {
  paris: { latitude: 48.8566, longitude: 2.3522, label: 'Paris, France' },
  london: { latitude: 51.5074, longitude: -0.1278, label: 'London, UK' },
  barcelona: { latitude: 41.3874, longitude: 2.1686, label: 'Barcelona, Spain' },
  florence: { latitude: 43.7696, longitude: 11.2558, label: 'Florence, Italy' },
  rome: { latitude: 41.9028, longitude: 12.4964, label: 'Rome, Italy' },
  prague: { latitude: 50.0755, longitude: 14.4378, label: 'Prague, Czechia' },
  amsterdam: { latitude: 52.3676, longitude: 4.9041, label: 'Amsterdam, Netherlands' },
  berlin: { latitude: 52.52, longitude: 13.405, label: 'Berlin, Germany' },
};

export function lookupCityCenter(cityName: string) {
  const raw = cityName.trim().toLowerCase();
  if (!raw) return null;
  // Accept "Florence", "Florence, Italy", "Firenze", etc.
  const primary = raw.split(',')[0]?.trim() || raw;
  const aliases: Record<string, string> = {
    firenze: 'florence',
    milano: 'milan',
    roma: 'rome',
    munchen: 'munich',
    'münchen': 'munich',
  };
  const key = aliases[primary] || primary;
  return CITY_CENTERS[key] ?? CITY_CENTERS[raw] ?? null;
}

/**
 * Deterministic 0–1 noise from a string (stable across reloads, not a real RNG API).
 * Used only for demo scatter / city jitter — never for real GPS users.
 */
export function hashUnit(seed: string, salt = 0): number {
  let h = 2166136261 ^ salt;
  const s = `${seed}:${salt}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // unsigned → 0..1
  return (h >>> 0) / 4294967295;
}

/** Organic scatter around a point (km). Deterministic per seed. */
export function scatterAround(
  latitude: number,
  longitude: number,
  seed: string,
  radiusKm = 6,
): { latitude: number; longitude: number } {
  const u = hashUnit(seed, 1);
  const v = hashUnit(seed, 2);
  // Uniform-in-disk: radius ~ sqrt(u), angle ~ 2πv
  const rKm = radiusKm * Math.sqrt(u);
  const theta = v * Math.PI * 2;
  const dLat = (rKm * Math.cos(theta)) / 111.32;
  const dLng =
    (rKm * Math.sin(theta)) / (111.32 * Math.cos((latitude * Math.PI) / 180));
  return {
    latitude: latitude + dLat,
    longitude: longitude + dLng,
  };
}

export interface ResolvedMapLocation {
  latitude: number;
  longitude: number;
  locationLabel: string;
  /** How the pin was derived — useful for UI / privacy badges later */
  source: 'exact' | 'approximate' | 'city' | 'hidden';
}

/**
 * Single source of truth for where a user appears on the map.
 *
 * Priority (production-ready):
 * 1. hidden → do not show (caller should skip)
 * 2. exact + live GPS coords → use them
 * 3. approximate / coarse device location → use those coords
 * 4. city privacy OR no GPS → host city center (+ light deterministic jitter so pins don’t stack)
 *
 * Demo/seed users just populate the same fields; real accounts will fill
 * `liveLatitude` / `liveLongitude` from the device when permission allows.
 */
export function resolveMapLocation(
  user: Pick<
    UserProfile,
    | 'id'
    | 'locationPrivacy'
    | 'latitude'
    | 'longitude'
    | 'locationLabel'
    | 'hostCity'
    | 'hostCountry'
  > & {
    liveLatitude?: number | null;
    liveLongitude?: number | null;
    approximateLatitude?: number | null;
    approximateLongitude?: number | null;
  },
): ResolvedMapLocation | null {
  if (user.locationPrivacy === 'hidden') {
    return null;
  }

  const hasLiveGps =
    user.liveLatitude != null &&
    user.liveLongitude != null &&
    Number.isFinite(user.liveLatitude) &&
    Number.isFinite(user.liveLongitude);

  // Device GPS always wins over host-city / program pins (including school filters).
  if (hasLiveGps) {
    return {
      latitude: user.liveLatitude as number,
      longitude: user.liveLongitude as number,
      locationLabel: user.locationLabel,
      source: 'exact',
    };
  }

  if (
    user.approximateLatitude != null &&
    user.approximateLongitude != null
  ) {
    return {
      latitude: user.approximateLatitude,
      longitude: user.approximateLongitude,
      locationLabel: user.locationLabel,
      source: 'approximate',
    };
  }

  // Prefer already-resolved host / program coordinates on the profile
  if (
    user.latitude != null &&
    user.longitude != null &&
    Number.isFinite(user.latitude) &&
    Number.isFinite(user.longitude)
  ) {
    return {
      latitude: user.latitude,
      longitude: user.longitude,
      locationLabel: user.locationLabel,
      source: user.locationPrivacy === 'exact' ? 'exact' : 'city',
    };
  }

  // City-only fallback from hard-coded centers
  const city =
    lookupCityCenter(user.hostCity) ||
    lookupCityCenter(user.locationLabel.split(',')[0] ?? '');

  if (city) {
    const jittered = scatterAround(city.latitude, city.longitude, user.id, 1.8);
    return {
      latitude: jittered.latitude,
      longitude: jittered.longitude,
      locationLabel: city.label,
      source: 'city',
    };
  }

  return null;
}

export type LocationPrivacySetting = LocationPrivacy;

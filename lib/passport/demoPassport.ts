import type {
  PassportCityRank,
  PassportCountryUnlock,
  PassportData,
} from '../../data/chatTypes';
import {
  countryKeyFromName,
  normalizeCountryName,
} from './countries';

export type StoredUnlock = PassportCountryUnlock & { userId: string };
export type StoredCity = PassportCityRank & { userId: string };

function id(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function applyTripPassportUnlock(opts: {
  unlocks: StoredUnlock[];
  cities: StoredCity[];
  userId: string;
  tripId: string;
  cityName: string;
  countryName: string;
  latitude?: number | null;
  longitude?: number | null;
}): void {
  const { unlocks, cities, userId, tripId } = opts;
  const city = opts.cityName.trim();
  const country = normalizeCountryName(opts.countryName) ?? opts.countryName.trim();
  if (!city) return;

  const key = countryKeyFromName(country);
  if (key && !unlocks.some((u) => u.userId === userId && u.countryKey === key)) {
    unlocks.push({
      userId,
      countryKey: key,
      countryName: country,
      unlockedAt: new Date().toISOString(),
      sourceTripId: tripId,
    });
  }

  const existing = cities.find(
    (c) =>
      c.userId === userId &&
      c.cityName.toLowerCase() === city.toLowerCase() &&
      c.countryName.toLowerCase() === country.toLowerCase(),
  );
  if (!existing) {
    for (const c of cities) {
      if (c.userId === userId) c.sortOrder += 1;
    }
    cities.push({
      id: id('pcity'),
      userId,
      cityName: city,
      countryName: country,
      sortOrder: 0,
      source: 'trip',
      tripId,
      latitude: opts.latitude ?? null,
      longitude: opts.longitude ?? null,
    });
  } else {
    existing.tripId = tripId;
    if (opts.latitude != null) existing.latitude = opts.latitude;
    if (opts.longitude != null) existing.longitude = opts.longitude;
  }
}

export function ensureHostCity(opts: {
  unlocks: StoredUnlock[];
  cities: StoredCity[];
  userId: string;
  hostCity?: string | null;
  hostCountry?: string | null;
}): void {
  const city = opts.hostCity?.trim();
  if (!city) return;
  const country =
    normalizeCountryName(opts.hostCountry) ?? opts.hostCountry?.trim() ?? '';

  const existing = opts.cities.find(
    (c) =>
      c.userId === opts.userId &&
      c.cityName.toLowerCase() === city.toLowerCase(),
  );

  if (!existing) {
    for (const c of opts.cities) {
      if (c.userId === opts.userId) c.sortOrder += 1;
    }
    opts.cities.push({
      id: id('pcity'),
      userId: opts.userId,
      cityName: city,
      countryName: country,
      sortOrder: 0,
      source: 'host',
      tripId: null,
      latitude: null,
      longitude: null,
    });
  } else {
    // Promote host city to top of rankings and refresh country label
    if (existing.sortOrder !== 0) {
      for (const c of opts.cities) {
        if (c.userId === opts.userId && c.id !== existing.id) {
          c.sortOrder += 1;
        }
      }
      existing.sortOrder = 0;
    }
    existing.source = 'host';
    if (country) existing.countryName = country;
  }

  const key = countryKeyFromName(country);
  if (
    key &&
    !opts.unlocks.some((u) => u.userId === opts.userId && u.countryKey === key)
  ) {
    opts.unlocks.push({
      userId: opts.userId,
      countryKey: key,
      countryName: country || key,
      unlockedAt: new Date().toISOString(),
      sourceTripId: null,
    });
  }
}

export function refreshProfilePassportCounts(
  profiles: Array<{ id: string; citiesVisited?: number | null; countriesVisited?: number | null }>,
  unlocks: StoredUnlock[],
  cities: StoredCity[],
): void {
  for (const p of profiles) {
    p.countriesVisited = unlocks.filter((u) => u.userId === p.id).length;
    p.citiesVisited = cities.filter((c) => c.userId === p.id).length;
  }
}

export function passportForUser(
  userId: string,
  unlocks: StoredUnlock[],
  cities: StoredCity[],
): PassportData {
  return {
    unlocks: unlocks
      .filter((u) => u.userId === userId)
      .map(({ countryKey, countryName, unlockedAt, sourceTripId }) => ({
        countryKey,
        countryName,
        unlockedAt,
        sourceTripId,
      }))
      .sort(
        (a, b) =>
          new Date(b.unlockedAt).getTime() - new Date(a.unlockedAt).getTime(),
      ),
    cities: cities
      .filter((c) => c.userId === userId)
      .map(
        ({
          id: cityId,
          cityName,
          countryName,
          sortOrder,
          source,
          tripId,
          latitude,
          longitude,
        }) => ({
          id: cityId,
          cityName,
          countryName,
          sortOrder,
          source,
          tripId,
          latitude,
          longitude,
        }),
      )
      .sort((a, b) => a.sortOrder - b.sortOrder),
  };
}

export function addManualCity(opts: {
  unlocks: StoredUnlock[];
  cities: StoredCity[];
  userId: string;
  cityName: string;
  countryName: string;
  latitude?: number | null;
  longitude?: number | null;
}): PassportCityRank {
  const city = opts.cityName.trim();
  const country =
    normalizeCountryName(opts.countryName) ?? opts.countryName.trim();
  const existing = opts.cities.find(
    (c) =>
      c.userId === opts.userId &&
      c.cityName.toLowerCase() === city.toLowerCase() &&
      c.countryName.toLowerCase() === country.toLowerCase(),
  );
  if (existing) {
    return {
      id: existing.id,
      cityName: existing.cityName,
      countryName: existing.countryName,
      sortOrder: existing.sortOrder,
      source: existing.source,
      tripId: existing.tripId,
      latitude: existing.latitude,
      longitude: existing.longitude,
    };
  }

  for (const c of opts.cities) {
    if (c.userId === opts.userId) c.sortOrder += 1;
  }
  const row: StoredCity = {
    id: id('pcity'),
    userId: opts.userId,
    cityName: city,
    countryName: country,
    sortOrder: 0,
    source: 'manual',
    tripId: null,
    latitude: opts.latitude ?? null,
    longitude: opts.longitude ?? null,
  };
  opts.cities.push(row);

  const key = countryKeyFromName(country);
  if (
    key &&
    !opts.unlocks.some((u) => u.userId === opts.userId && u.countryKey === key)
  ) {
    opts.unlocks.push({
      userId: opts.userId,
      countryKey: key,
      countryName: country,
      unlockedAt: new Date().toISOString(),
      sourceTripId: null,
    });
  }

  return {
    id: row.id,
    cityName: row.cityName,
    countryName: row.countryName,
    sortOrder: row.sortOrder,
    source: row.source,
    tripId: row.tripId,
    latitude: row.latitude,
    longitude: row.longitude,
  };
}

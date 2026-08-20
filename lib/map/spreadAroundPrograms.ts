import type { ProgramPin, UserProfile } from '../../data/types';

function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const r = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(a));
}

/** Place pins on a small ring around a program logo so they stay visible. */
function ringAround(
  latitude: number,
  longitude: number,
  index: number,
  total: number,
  radiusKm: number,
): { latitude: number; longitude: number } {
  // Even spacing; nudge radius slightly by index so dense clusters don't overlap
  const n = Math.max(total, 1);
  const theta = (2 * Math.PI * index) / n - Math.PI / 2;
  const rKm = radiusKm + (n > 6 ? 0.02 * Math.floor(index / 6) : 0);
  const dLat = (rKm * Math.cos(theta)) / 111.32;
  const dLng =
    (rKm * Math.sin(theta)) / (111.32 * Math.cos((latitude * Math.PI) / 180));
  return {
    latitude: latitude + dLat,
    longitude: longitude + dLng,
  };
}

/**
 * When student pins sit on (or under) an abroad-program logo, fan them out in a
 * ring around that logo so profile avatars remain visible on the map.
 */
export function spreadPeopleAroundProgramPins(
  people: UserProfile[],
  programs: ProgramPin[],
): UserProfile[] {
  if (people.length === 0 || programs.length === 0) return people;

  // ~180m ≈ stacked on the logo at city zoom
  const ON_PIN_KM = 0.18;
  // Orbit just outside the ~65px program marker
  const RING_KM = 0.11;

  const claimed = new Set<string>();
  const overrides = new Map<string, UserProfile>();

  for (const program of programs) {
    const group = people.filter((person) => {
      if (claimed.has(person.id)) return false;
      // Never relocate the signed-in user — keep live GPS accurate.
      if (person.isCurrentUser) return false;
      if (person.locationPrivacy === 'hidden') return false;
      const d = haversineKm(
        person.latitude,
        person.longitude,
        program.latitude,
        program.longitude,
      );
      return d <= ON_PIN_KM;
    });

    if (group.length === 0) continue;

    // Stable order so positions don't jump between renders
    group.sort((a, b) => a.id.localeCompare(b.id));
    group.forEach((person, index) => {
      claimed.add(person.id);
      const pos = ringAround(
        program.latitude,
        program.longitude,
        index,
        group.length,
        RING_KM,
      );
      overrides.set(person.id, {
        ...person,
        latitude: pos.latitude,
        longitude: pos.longitude,
      });
    });
  }

  if (overrides.size === 0) return people;
  return people.map((p) => overrides.get(p.id) ?? p);
}

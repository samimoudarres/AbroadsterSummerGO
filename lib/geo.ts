/** Approximate miles between two lat/lng points (Haversine). */
export function distanceMiles(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export interface LatLngBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

export function pointInBounds(
  lat: number,
  lng: number,
  bounds: LatLngBounds,
): boolean {
  return (
    lat >= bounds.south &&
    lat <= bounds.north &&
    lng >= bounds.west &&
    lng <= bounds.east
  );
}

/** Nearby = inside current viewport, or within 50 miles of center if zoomed out sparsely. */
export function isNearby(
  lat: number,
  lng: number,
  centerLat: number,
  centerLng: number,
  bounds: LatLngBounds,
): boolean {
  if (pointInBounds(lat, lng, bounds)) return true;
  return distanceMiles(centerLat, centerLng, lat, lng) <= 50;
}

export function formatTripNames(firstNames: string[], max = 3): string {
  if (firstNames.length === 0) return 'Trip';
  if (firstNames.length === 1) return firstNames[0];
  if (firstNames.length === 2) return `${firstNames[0]} & ${firstNames[1]}`;
  if (firstNames.length <= max) {
    const head = firstNames.slice(0, -1).join(', ');
    return `${head} & ${firstNames[firstNames.length - 1]}`;
  }
  const shown = firstNames.slice(0, max - 1);
  return `${shown.join(', ')}, ${firstNames[max - 1].slice(0, 2)}...`;
}

export function shortTripTitle(firstNames: string[]): string {
  if (firstNames.length <= 1) return firstNames[0] ?? 'Trip';
  if (firstNames.length === 2) return `${firstNames[0]}, ${firstNames[1].slice(0, 3)}...`;
  return `${firstNames[0]}, ${firstNames[1].slice(0, 3)}...`;
}

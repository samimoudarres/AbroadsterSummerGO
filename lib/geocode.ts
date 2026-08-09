export interface GeocodeResult {
  cityName: string;
  countryName: string;
}

export interface PlaceSuggestion {
  id: string;
  cityName: string;
  countryName: string;
  placeName: string;
  latitude: number;
  longitude: number;
}

const cache = new Map<string, GeocodeResult>();
const suggestCache = new Map<string, PlaceSuggestion[]>();

function cacheKey(lat: number, lng: number) {
  return `${lat.toFixed(2)},${lng.toFixed(2)}`;
}

/** Forward city/place autocomplete (Mapbox Places). */
export async function searchPlaces(
  query: string,
  mapboxToken?: string,
): Promise<PlaceSuggestion[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const key = q.toLowerCase();
  const hit = suggestCache.get(key);
  if (hit) return hit;

  try {
    if (mapboxToken) {
      const url =
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json` +
        `?types=place,locality,region,country&limit=6&access_token=${mapboxToken}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const suggestions: PlaceSuggestion[] = (data.features ?? []).map(
          (f: any) => {
            const placeType = String(f.place_type?.[0] ?? '');
            const countryFromContext =
              f.context?.find((c: { id: string }) => c.id.startsWith('country'))
                ?.text ?? '';
            const country =
              placeType === 'country'
                ? ((f.text as string) ?? '')
                : countryFromContext ||
                  f.place_name?.split(',').pop()?.trim() ||
                  '';
            return {
              id: f.id as string,
              cityName: (f.text as string) ?? 'Unknown',
              countryName: country,
              placeName: (f.place_name as string) ?? f.text,
              longitude: f.center?.[0] as number,
              latitude: f.center?.[1] as number,
            };
          },
        );
        suggestCache.set(key, suggestions);
        return suggestions;
      }
    }

    const nominatim = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(q)}&limit=6`;
    const res = await fetch(nominatim, {
      headers: { 'Accept-Language': 'en', 'User-Agent': 'Abroadster/1.0' },
    });
    if (res.ok) {
      const data = await res.json();
      const suggestions: PlaceSuggestion[] = (data ?? []).map(
        (f: any, i: number) => {
          const parts = String(f.display_name || '')
            .split(',')
            .map((s: string) => s.trim());
          return {
            id: String(f.place_id ?? i),
            cityName: parts[0] || f.name || 'Unknown',
            countryName: parts[parts.length - 1] || '',
            placeName: f.display_name || f.name,
            latitude: Number(f.lat),
            longitude: Number(f.lon),
          };
        },
      );
      suggestCache.set(key, suggestions);
      return suggestions;
    }
  } catch {
    // fall through
  }
  return [];
}

/** Reverse-geocode map center. Prefers Mapbox when token exists; falls back to Nominatim. */
export async function reverseGeocodeCity(
  lat: number,
  lng: number,
  mapboxToken?: string,
): Promise<GeocodeResult> {
  const key = cacheKey(lat, lng);
  const hit = cache.get(key);
  if (hit) return hit;

  try {
    if (mapboxToken) {
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?types=place,locality,region&limit=1&access_token=${mapboxToken}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const feature = data.features?.[0];
        if (feature) {
          const place = feature.text ?? 'Unknown';
          const country =
            feature.context?.find((c: { id: string }) => c.id.startsWith('country'))
              ?.text ??
            feature.place_name?.split(',').pop()?.trim() ??
            '';
          const result = { cityName: place, countryName: country };
          cache.set(key, result);
          return result;
        }
      }
    }

    const nominatim = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=10`;
    const res = await fetch(nominatim, {
      headers: { 'Accept-Language': 'en', 'User-Agent': 'Abroadster/1.0' },
    });
    if (res.ok) {
      const data = await res.json();
      const cityName =
        data.address?.city ||
        data.address?.town ||
        data.address?.village ||
        data.address?.municipality ||
        data.name ||
        'Unknown';
      const countryName = data.address?.country || '';
      const result = { cityName, countryName };
      cache.set(key, result);
      return result;
    }
  } catch {
    // fall through
  }

  if (Math.abs(lat - 48.8566) < 0.5 && Math.abs(lng - 2.3522) < 0.5) {
    return { cityName: 'Paris', countryName: 'France' };
  }
  return { cityName: 'Somewhere', countryName: '' };
}

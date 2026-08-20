import { Platform } from 'react-native';

/**
 * Mapbox public token (pk.*) — set EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN in .env / EAS.
 * Keep URL restrictions enabled in the Mapbox dashboard.
 */
export const MAPBOX_TOKEN =
  process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN?.trim() || '';

export const hasMapboxToken = MAPBOX_TOKEN.length > 0;

/** Colorful default: green land / blue water (not grayscale light). */
export const MAPBOX_STYLE_REGULAR = 'mapbox://styles/mapbox/outdoors-v12';
export const MAPBOX_STYLE_SATELLITE = 'mapbox://styles/mapbox/satellite-streets-v12';

/** Fallback if Mapbox is unavailable. */
export const FALLBACK_STYLE_REGULAR = 'https://tiles.openfreemap.org/styles/liberty';
export const FALLBACK_STYLE_SATELLITE = 'https://tiles.openfreemap.org/styles/liberty';

export const DEFAULT_CENTER = {
  latitude: 48.8566,
  longitude: 2.3522,
  zoom: 12.2,
};

export function getMapStyle(mode: 'regular' | 'satellite'): string {
  if (hasMapboxToken) {
    return mode === 'satellite' ? MAPBOX_STYLE_SATELLITE : MAPBOX_STYLE_REGULAR;
  }
  return mode === 'satellite' ? FALLBACK_STYLE_SATELLITE : FALLBACK_STYLE_REGULAR;
}

export const isWeb = Platform.OS === 'web';

import { Image } from 'react-native';

const cache = new Map<string, number>();

function cacheKey(uri: string | number): string {
  return typeof uri === 'number' ? `n:${uri}` : `s:${uri}`;
}

/**
 * Resolve width/height aspect (w/h) for a gallery asset.
 * Falls back to 1 (square) if unknown.
 */
export function getImageAspectSync(uri: string | number): number {
  const key = cacheKey(uri);
  const hit = cache.get(key);
  if (hit) return hit;
  if (typeof uri === 'number') {
    try {
      const resolved = Image.resolveAssetSource(uri);
      if (resolved?.width && resolved?.height) {
        const a = resolved.width / resolved.height;
        cache.set(key, a);
        return a;
      }
    } catch {
      // fall through
    }
  }
  return 1;
}

export function getImageAspect(
  uri: string | number,
): Promise<number> {
  const key = cacheKey(uri);
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);

  if (typeof uri === 'number') {
    const a = getImageAspectSync(uri);
    return Promise.resolve(a);
  }

  return new Promise((resolve) => {
    Image.getSize(
      uri,
      (w, h) => {
        const a = w > 0 && h > 0 ? w / h : 1;
        cache.set(key, a);
        resolve(a);
      },
      () => resolve(1),
    );
  });
}

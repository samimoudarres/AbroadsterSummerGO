import { Image } from 'react-native';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { defaultAvatarUrl, ensureImageUri, toImageUri } from '../images';
import type { ImageSource } from '../../data/types';

const cache = new Map<string, string>();

/** Resize remote/local images to a small square pin bitmap (Marker.image). */
export async function pinBitmapUri(
  source: ImageSource | null | undefined,
  nameForDefault: string,
  size = 72,
): Promise<string> {
  const key = `${toImageUri(source as any) || nameForDefault}|${size}`;
  const hit = cache.get(key);
  if (hit) return hit;

  let uri = '';
  try {
    uri = (await ensureImageUri(source as any)) || '';
  } catch {
    uri = '';
  }
  if (!uri) uri = defaultAvatarUrl(nameForDefault);

  try {
    // Local require() modules
    if (typeof source === 'number') {
      const resolved = Image.resolveAssetSource(source);
      if (resolved?.uri) uri = resolved.uri;
    }
    const out = await manipulateAsync(
      uri,
      [{ resize: { width: size, height: size } }],
      { compress: 0.85, format: SaveFormat.PNG },
    );
    cache.set(key, out.uri);
    return out.uri;
  } catch {
    cache.set(key, uri);
    return uri;
  }
}

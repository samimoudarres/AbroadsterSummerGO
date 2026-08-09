import { Asset } from 'expo-asset';
import { Image, type ImageSourcePropType } from 'react-native';
import type { ImageSource } from '../data/types';

const FALLBACK_AVATAR = require('../assets/avatars/marcos.png');

function moduleUri(mod: number): string | null {
  try {
    const resolved = Image.resolveAssetSource(mod);
    if (resolved?.uri) return resolved.uri;
  } catch {
    // fall through
  }
  try {
    const asset = Asset.fromModule(mod);
    return asset.localUri ?? asset.uri ?? null;
  } catch {
    return null;
  }
}

/** Placeholder avatar URL when a user has no photo yet (initials on brand mint). */
export function defaultAvatarUrl(name: string): string {
  const label = (name || 'A').trim() || 'A';
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(label)}&background=C2D8D7&color=222222&size=256&bold=true`;
}

/** Local empty avatar tile color (matches ui-avatars default background). */
export const DEFAULT_AVATAR_BG = '#C2D8D7';

export function toImageSource(
  source: ImageSource | null | undefined,
  opts?: { nameForDefault?: string },
): ImageSourcePropType {
  if (source == null || source === '') {
    if (opts?.nameForDefault) {
      return { uri: defaultAvatarUrl(opts.nameForDefault) };
    }
    // No name — solid brand placeholder (avoid unrelated stock photo)
    return { uri: defaultAvatarUrl('A') };
  }
  if (typeof source === 'number') {
    const uri = moduleUri(source);
    // Prefer explicit URI on web — raw module ids often fail in list Images
    return uri ? { uri } : source;
  }
  return { uri: source };
}

export function toImageUri(source: ImageSource): string {
  if (typeof source === 'string') return source;
  return moduleUri(source) ?? '';
}

export async function ensureImageUri(source: ImageSource): Promise<string> {
  if (typeof source === 'string') {
    // Empty string = no image (callers should show their own fallback)
    return source.trim();
  }
  const sync = moduleUri(source);
  if (sync) return sync;
  try {
    const asset = Asset.fromModule(source);
    if (!asset.uri && !asset.localUri) {
      await asset.downloadAsync();
    }
    return asset.localUri ?? asset.uri ?? '';
  } catch {
    return '';
  }
}

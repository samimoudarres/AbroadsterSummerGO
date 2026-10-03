import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { Image } from 'react-native';

/** Longest edge for post uploads — sharp on phones, much smaller files. */
const MAX_EDGE = 2048;
const JPEG_QUALITY = 0.8;
/** Album batch uploads: smaller to avoid OOM when selecting ~100 photos. */
const ALBUM_MAX_EDGE = 1600;
const ALBUM_JPEG_QUALITY = 0.72;

export type OptimizedUpload = {
  uri: string;
  /** True when re-encoded to JPEG via manipulator. */
  jpeg: boolean;
};

function isRemoteOrDataUri(uri: string) {
  return /^(https?:|data:)/i.test(uri);
}

function getImageSize(uri: string): Promise<{ w: number; h: number } | null> {
  return new Promise((resolve) => {
    Image.getSize(
      uri,
      (w, h) => resolve({ w, h }),
      () => resolve(null),
    );
  });
}

/**
 * Downscale + JPEG-compress a local image before Storage upload.
 * Remote/data URIs are returned unchanged (jpeg: false).
 * On failure, returns the original URI (jpeg: false).
 */
export async function optimizeLocalImageForUpload(
  localUri: string,
  opts?: { album?: boolean },
): Promise<OptimizedUpload> {
  if (!localUri || typeof localUri !== 'string' || isRemoteOrDataUri(localUri)) {
    return { uri: localUri, jpeg: false };
  }

  const maxEdge = opts?.album ? ALBUM_MAX_EDGE : MAX_EDGE;
  const quality = opts?.album ? ALBUM_JPEG_QUALITY : JPEG_QUALITY;

  try {
    const size = await getImageSize(localUri);
    const actions: Array<{ resize: { width: number } | { height: number } }> =
      [];
    if (size && Math.max(size.w, size.h) > maxEdge) {
      if (size.w >= size.h) {
        actions.push({ resize: { width: maxEdge } });
      } else {
        actions.push({ resize: { height: maxEdge } });
      }
    }

    const result = await manipulateAsync(localUri, actions, {
      compress: quality,
      format: SaveFormat.JPEG,
    });
    if (!result.uri) return { uri: localUri, jpeg: false };
    return { uri: result.uri, jpeg: true };
  } catch {
    return { uri: localUri, jpeg: false };
  }
}

export function contentTypeForUpload(uri: string, jpeg: boolean): string {
  if (jpeg) return 'image/jpeg';
  const ext = uri.split('.').pop()?.split('?')[0]?.toLowerCase() || 'jpg';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  return 'image/jpeg';
}

export function extensionForUpload(uri: string, jpeg: boolean): string {
  if (jpeg) return 'jpg';
  const ext = uri.split('.').pop()?.split('?')[0]?.toLowerCase() || 'jpg';
  if (ext === 'png' || ext === 'webp' || ext === 'jpg' || ext === 'jpeg') {
    return ext === 'jpeg' ? 'jpg' : ext;
  }
  return 'jpg';
}

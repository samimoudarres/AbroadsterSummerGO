import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, type ImageStyle, type StyleProp } from 'react-native';
import {
  Image as ExpoImage,
  type ImageContentFit,
  type ImageProps,
} from 'expo-image';
import {
  isStorageRenderUrl,
} from '../../lib/images/displayUrl';

type SourceInput =
  | number
  | string
  | { uri: string }
  | null
  | undefined;

function toUri(source: SourceInput): string | null {
  if (source == null || source === '') return null;
  if (typeof source === 'number') return null;
  if (typeof source === 'string') {
    const uri = source.trim();
    return uri || null;
  }
  if (typeof source === 'object' && 'uri' in source && source.uri) {
    const uri = String(source.uri).trim();
    return uri || null;
  }
  return null;
}

function toExpoSource(source: SourceInput): ImageProps['source'] {
  if (source == null || source === '') return null;
  if (typeof source === 'number') return source;
  const uri = toUri(source);
  return uri ? { uri } : null;
}

/** If display URL is a transform, recover the original object URL for fallback. */
function originalFromRender(uri: string): string | null {
  if (!isStorageRenderUrl(uri)) return null;
  const base = uri.split('?')[0] ?? uri;
  return base.replace(
    '/storage/v1/render/image/public/',
    '/storage/v1/object/public/',
  );
}

export type CachedImageProps = {
  source: SourceInput;
  /** Optional explicit fallback (defaults to original Storage object if source is a render URL). */
  fallbackSource?: SourceInput;
  style?: StyleProp<ImageStyle>;
  contentFit?: ImageContentFit;
  resizeMode?: 'cover' | 'contain' | 'stretch' | 'center';
  recyclingKey?: string;
  priority?: 'low' | 'normal' | 'high';
  transition?: number;
  accessibilityIgnoresInvertColors?: boolean;
};

function fitFromResizeMode(
  resizeMode?: CachedImageProps['resizeMode'],
): ImageContentFit {
  if (resizeMode === 'contain') return 'contain';
  if (resizeMode === 'stretch') return 'fill';
  if (resizeMode === 'center') return 'none';
  return 'cover';
}

/** Native: expo-image with memory+disk cache + transform→original fallback. */
export function CachedImage({
  source,
  fallbackSource,
  style,
  contentFit,
  resizeMode = 'cover',
  recyclingKey,
  priority = 'normal',
  transition = 0,
  accessibilityIgnoresInvertColors,
}: CachedImageProps) {
  const primaryUri = toUri(source);
  const explicitFallback = toUri(fallbackSource ?? null);
  const autoFallback =
    primaryUri && isStorageRenderUrl(primaryUri)
      ? originalFromRender(primaryUri)
      : null;

  const fallbackUri = explicitFallback || autoFallback;

  const [useFallback, setUseFallback] = useState(false);

  useEffect(() => {
    setUseFallback(false);
  }, [primaryUri, fallbackUri]);

  const activeSource = useMemo(() => {
    if (useFallback && fallbackUri) return { uri: fallbackUri };
    return toExpoSource(source);
  }, [useFallback, fallbackUri, source]);

  if (activeSource == null) return null;

  return (
    <ExpoImage
      source={activeSource}
      style={style}
      contentFit={contentFit ?? fitFromResizeMode(resizeMode)}
      cachePolicy="memory-disk"
      recyclingKey={recyclingKey}
      priority={priority}
      transition={transition}
      accessibilityIgnoresInvertColors={accessibilityIgnoresInvertColors}
      onError={() => {
        if (!useFallback && fallbackUri) setUseFallback(true);
      }}
    />
  );
}

export const cachedImageStyles = StyleSheet.create({
  fill: { width: '100%', height: '100%' },
});

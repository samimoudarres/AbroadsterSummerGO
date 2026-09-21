import React, { useEffect, useMemo, useState } from 'react';
import {
  Image as RNImage,
  StyleSheet,
  type ImageStyle,
  type StyleProp,
} from 'react-native';
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

function toRNSource(source: SourceInput) {
  if (source == null || source === '') return undefined;
  if (typeof source === 'number') return source;
  const uri = toUri(source);
  return uri ? { uri } : undefined;
}

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
  fallbackSource?: SourceInput;
  style?: StyleProp<ImageStyle>;
  contentFit?: 'cover' | 'contain' | 'fill' | 'none' | 'scale-down';
  resizeMode?: 'cover' | 'contain' | 'stretch' | 'center';
  recyclingKey?: string;
  priority?: 'low' | 'normal' | 'high';
  transition?: number;
  accessibilityIgnoresInvertColors?: boolean;
};

/** Web: RN Image (expo-image 57.0.4 web build is incomplete) + transform fallback. */
export function CachedImage({
  source,
  fallbackSource,
  style,
  resizeMode = 'cover',
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

  const rnSource = useMemo(() => {
    if (useFallback && fallbackUri) return { uri: fallbackUri };
    return toRNSource(source);
  }, [useFallback, fallbackUri, source]);

  if (!rnSource) return null;
  return (
    <RNImage
      source={rnSource}
      style={style}
      resizeMode={resizeMode}
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

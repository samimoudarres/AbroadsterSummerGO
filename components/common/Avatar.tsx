import React, { useEffect, useState } from 'react';
import {
  Image,
  StyleSheet,
  View,
  type ImageStyle,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import type { ImageSource } from '../../data/types';
import {
  DEFAULT_AVATAR_BG,
  defaultAvatarUrl,
  ensureImageUri,
  toImageSource,
} from '../../lib/images';

interface AvatarProps {
  source?: ImageSource | null;
  size?: number;
  style?: StyleProp<ImageStyle>;
  frameStyle?: StyleProp<ViewStyle>;
  /** Used for initials fallback when source is empty */
  name?: string;
}

/**
 * Resolves require() assets and remote URLs the same way map pins do,
 * so avatars render on web and native.
 */
export function Avatar({
  source,
  size = 36,
  style,
  frameStyle,
  name,
}: AvatarProps) {
  const [uri, setUri] = useState<string | null>(() => {
    if (typeof source === 'string' && source) return source;
    return null;
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (source == null || source === '') {
        if (!cancelled) setUri(null);
        return;
      }
      if (typeof source === 'string') {
        if (!cancelled) setUri(source);
        return;
      }
      try {
        const resolved = await ensureImageUri(source);
        if (!cancelled) setUri(resolved || null);
      } catch {
        if (!cancelled) setUri(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [source]);

  const box: StyleProp<ImageStyle> = [
    {
      width: size,
      height: size,
      borderRadius: size / 2,
      backgroundColor: DEFAULT_AVATAR_BG,
    },
    style,
  ];

  if (uri) {
    return (
      <Image source={{ uri }} style={box} accessibilityIgnoresInvertColors />
    );
  }

  // Empty photo → initials on brand mint (not a stock face)
  if (source == null || source === '') {
    return (
      <Image
        source={{ uri: defaultAvatarUrl(name || 'A') }}
        style={box}
        accessibilityIgnoresInvertColors
      />
    );
  }

  // Sync fallback while async resolve runs (or if resolve fails)
  const sync = toImageSource(source, { nameForDefault: name });
  if (sync) {
    return <Image source={sync} style={box} />;
  }

  return <View style={[styles.placeholder, box, frameStyle]} />;
}

const styles = StyleSheet.create({
  placeholder: {
    backgroundColor: DEFAULT_AVATAR_BG,
  },
});

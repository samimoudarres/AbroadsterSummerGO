import type { ImageStyle, StyleProp } from 'react-native';

export type CachedImageProps = {
  source:
    | number
    | string
    | { uri: string }
    | null
    | undefined;
  /** If the primary URI fails (e.g. transform), fall back to this / original object URL. */
  fallbackSource?:
    | number
    | string
    | { uri: string }
    | null
    | undefined;
  style?: StyleProp<ImageStyle>;
  contentFit?: 'cover' | 'contain' | 'fill' | 'none' | 'scale-down';
  resizeMode?: 'cover' | 'contain' | 'stretch' | 'center';
  recyclingKey?: string;
  priority?: 'low' | 'normal' | 'high';
  transition?: number;
  accessibilityIgnoresInvertColors?: boolean;
};

// Platform files: CachedImage.native.tsx / CachedImage.web.tsx
export { CachedImage, cachedImageStyles } from './CachedImage.web';

import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ALBUM_PLACEHOLDER_PHOTOS } from '../trips/albumPlaceholders';
import { FEED_PHOTOS } from './feedPhotos';

export type GalleryAsset = {
  id: string;
  uri: string | number;
};

/** Demo / web gallery so compose works without device library. */
const DEMO_GALLERY: GalleryAsset[] = [
  ...FEED_PHOTOS.map((p: string | number, i: number) => ({
    id: `feed-${i}`,
    uri: p as number,
  })),
  ...ALBUM_PLACEHOLDER_PHOTOS.map((p: string | number, i: number) => ({
    id: `album-${i}`,
    uri: p as number,
  })),
];

export async function requestGalleryPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return true;
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  return status === 'granted';
}

/**
 * Load gallery assets for the create-post picker.
 * Native: ImagePicker multi-select dump is limited — we use a seeded grid plus
 * optional "Add from library" via pickExtraFromLibrary.
 * Web: seeded scenic assets (fully functional for testing).
 */
export async function loadGalleryAssets(): Promise<GalleryAsset[]> {
  await requestGalleryPermission();
  return DEMO_GALLERY.slice();
}

/** Let user add more photos from the system library (multi). */
export async function pickExtraFromLibrary(
  selectionLimit = 10,
): Promise<GalleryAsset[]> {
  const ok = await requestGalleryPermission();
  if (!ok) return [];
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    selectionLimit,
    quality: 0.9,
  });
  if (result.canceled || !result.assets?.length) return [];
  return result.assets.map((a, i) => ({
    id: `picked-${Date.now()}-${i}`,
    uri: a.uri,
  }));
}

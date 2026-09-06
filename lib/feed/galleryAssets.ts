import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

export type GalleryAsset = {
  id: string;
  uri: string | number;
  width?: number;
  height?: number;
};

/** Native-only: never import expo-media-library on web (no native module). */
async function loadMediaLibrary() {
  if (Platform.OS === 'web') return null;
  return import('expo-media-library/legacy');
}

export async function requestGalleryPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return true;
  const lib = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (lib.status !== 'granted') return false;
  try {
    const MediaLibrary = await loadMediaLibrary();
    if (!MediaLibrary) return lib.status === 'granted';
    const { status } = await MediaLibrary.requestPermissionsAsync();
    return status === 'granted' || lib.status === 'granted';
  } catch {
    return lib.status === 'granted';
  }
}

/**
 * Load real recent photos from the device library (no demo placeholders).
 */
export async function loadGalleryAssets(): Promise<GalleryAsset[]> {
  const ok = await requestGalleryPermission();
  if (!ok || Platform.OS === 'web') return [];

  try {
    const MediaLibrary = await loadMediaLibrary();
    if (!MediaLibrary) return [];
    const page = await MediaLibrary.getAssetsAsync({
      first: 60,
      mediaType: MediaLibrary.MediaType.photo,
      sortBy: [[MediaLibrary.SortBy.creationTime, false]],
    });
    const out: GalleryAsset[] = [];
    for (const a of page.assets) {
      let uri = a.uri;
      try {
        const info = await MediaLibrary.getAssetInfoAsync(a);
        if (info.localUri) uri = info.localUri;
      } catch {
        // keep a.uri
      }
      out.push({
        id: a.id,
        uri,
        width: a.width,
        height: a.height,
      });
    }
    return out;
  } catch {
    return [];
  }
}

/** Let user add photos from the system library (multi). */
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
    exif: false,
  });
  if (result.canceled || !result.assets?.length) return [];
  return result.assets.map((a, i) => ({
    id: `picked-${Date.now()}-${i}`,
    uri: a.uri,
    width: a.width,
    height: a.height,
  }));
}

/** Save a local file URI into the device photo library (native only). */
export async function saveUriToLibrary(uri: string): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const MediaLibrary = await loadMediaLibrary();
  if (!MediaLibrary) return false;
  const perm = await MediaLibrary.requestPermissionsAsync();
  if (!perm.granted) return false;
  await MediaLibrary.createAssetAsync(uri);
  return true;
}

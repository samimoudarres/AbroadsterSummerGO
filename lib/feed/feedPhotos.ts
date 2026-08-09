import type { ImageSourcePropType } from 'react-native';
import { ALBUM_PLACEHOLDER_PHOTOS } from '../trips/albumPlaceholders';

/** High-res local feed assets (require module ids). */
export const FEED_PHOTOS = [
  require('../../assets/home/post-santorini.png'),
  require('../../assets/home/feed-photo-1.png'),
  require('../../assets/home/feed-photo-2.png'),
  require('../../assets/home/feed-photo-3.png'),
] as const;

/** Demo post id → photo module ids (kept in sync with demoStore seed). */
const SEED_POST_PHOTOS: Record<string, Array<string | number>> = {
  'post-luke-santorini': [FEED_PHOTOS[0], FEED_PHOTOS[1], FEED_PHOTOS[2]],
  'post-chelsea-paris': [FEED_PHOTOS[1], FEED_PHOTOS[2], FEED_PHOTOS[3]],
  'post-jack-rome': [FEED_PHOTOS[2], FEED_PHOTOS[0], FEED_PHOTOS[1]],
  'post-mia-barcelona': [FEED_PHOTOS[3], FEED_PHOTOS[0]],
  'post-marcos-lisbon': [FEED_PHOTOS[1], FEED_PHOTOS[0]],
  'post-emily-london': [FEED_PHOTOS[2], FEED_PHOTOS[1], FEED_PHOTOS[0]],
  'post-sebastian-amsterdam': [FEED_PHOTOS[0], FEED_PHOTOS[3]],
  'post-emily-lloyd-athens': [FEED_PHOTOS[1], FEED_PHOTOS[2]],
  'post-luke-sicily': [FEED_PHOTOS[2], FEED_PHOTOS[0], FEED_PHOTOS[3]],
  'post-chelsea-nice': [FEED_PHOTOS[0], FEED_PHOTOS[1], FEED_PHOTOS[2]],
};

export function seedPhotosForPost(
  postId: string,
): Array<string | number> {
  return (
    SEED_POST_PHOTOS[postId]?.slice() ?? [...ALBUM_PLACEHOLDER_PHOTOS]
  );
}

/** Prefer local require() modules; accept real remote/file URLs; otherwise seed fallback. */
export function usablePostPhotos(
  postId: string,
  photoUrls?: Array<string | number> | null,
): Array<string | number> {
  // Known demo posts: always use fresh require() modules (string URIs from
  // ensureImageUri / AsyncStorage are unreliable in the home-feed carousel).
  if (SEED_POST_PHOTOS[postId]) {
    return SEED_POST_PHOTOS[postId].slice();
  }

  const list = photoUrls ?? [];
  const usable = list.filter((u) => {
    if (typeof u === 'number' && Number.isFinite(u)) return true;
    if (typeof u !== 'string') return false;
    const s = u.trim();
    // Keep http(s), file, data, blob — reject metro-relative junk
    return /^(https?:|file:|data:|blob:)/i.test(s);
  });
  if (usable.length) return usable;
  return seedPhotosForPost(postId);
}

/**
 * Home-feed Image source. Pass require() module ids through as numbers —
 * converting them to { uri } via resolveAssetSource breaks large feed
 * photos on web (black squares). Remote URLs still use { uri }.
 */
export function feedImageSource(
  photo: string | number | null | undefined,
): ImageSourcePropType {
  if (typeof photo === 'number' && Number.isFinite(photo)) return photo;
  if (typeof photo === 'string' && photo.trim()) return { uri: photo.trim() };
  return FEED_PHOTOS[0];
}

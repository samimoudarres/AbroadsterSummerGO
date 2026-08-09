/**
 * Default trip-album cover when no photos have been uploaded.
 * Single scenic placeholder (cropped square via Image resizeMode cover).
 */
export const ALBUM_PLACEHOLDER_DEFAULT = require('../../assets/trips/album-placeholder-default.png');

/** @deprecated Prefer ALBUM_PLACEHOLDER_DEFAULT — kept for any 3-stack callers */
export const ALBUM_PLACEHOLDER_PHOTOS = [
  ALBUM_PLACEHOLDER_DEFAULT,
  ALBUM_PLACEHOLDER_DEFAULT,
  ALBUM_PLACEHOLDER_DEFAULT,
] as const;

/**
 * Build a 3-slot preview for trip follow banner:
 * real https cloud uploads first, then the default filler.
 * (Do not use this to filter demo/seed album covers — those may be
 * require() module ids or local file:// URIs after resolve.)
 */
export function albumPreviewSources(
  uploadedUrls: Array<string | number> | null | undefined,
): Array<string | number> {
  const uploaded = (uploadedUrls ?? []).filter(
    (u) => typeof u === 'string' && /^https?:\/\//i.test(u),
  ) as string[];
  return [
    uploaded[0] ?? ALBUM_PLACEHOLDER_DEFAULT,
    uploaded[1] ?? ALBUM_PLACEHOLDER_DEFAULT,
    uploaded[2] ?? ALBUM_PLACEHOLDER_DEFAULT,
  ];
}

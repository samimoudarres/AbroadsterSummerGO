/**
 * Display-size URLs for Supabase Storage images.
 * Uses on-the-fly transforms (`/render/image/public/...`) so grids/covers
 * download ~tens of KB instead of multi-MB originals.
 * Non-Storage / local / already-transformed URLs pass through unchanged.
 */

export type DisplaySize = 'avatar' | 'grid' | 'cover' | 'feed' | 'full';

type TransformOpts = {
  width: number;
  height?: number;
  resize?: 'cover' | 'contain';
  quality?: number;
};

const PRESETS: Record<Exclude<DisplaySize, 'full'>, TransformOpts> = {
  // Profile / list avatars — tiny, must feel instant
  avatar: { width: 96, height: 96, resize: 'cover', quality: 65 },
  // Profile post grid + album photo tiles (~130px on device)
  grid: { width: 320, height: 320, resize: 'cover', quality: 65 },
  // Album preview cards on profile rail
  cover: { width: 400, height: 400, resize: 'cover', quality: 68 },
  // Home feed / collage display (not crop editor)
  feed: { width: 900, resize: 'contain', quality: 72 },
};

const OBJECT_PUBLIC = '/storage/v1/object/public/';
const RENDER_PUBLIC = '/storage/v1/render/image/public/';

function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url.trim());
}

/** True when this is already a Storage render (transform) URL. */
export function isStorageRenderUrl(url: string): boolean {
  return /\/storage\/v1\/render\/image\//i.test(url);
}

/** True when this is a Supabase public object URL we can transform. */
export function isStorageObjectPublicUrl(url: string): boolean {
  return /\/storage\/v1\/object\/public\//i.test(url);
}

/**
 * Rewrite a Supabase public object URL to a sized render URL.
 * Returns the original string when transform does not apply.
 */
export function storageDisplayUrl(
  url: string | null | undefined,
  size: DisplaySize = 'feed',
): string {
  if (url == null) return '';
  const raw = String(url).trim();
  if (!raw || size === 'full' || !isHttpUrl(raw)) return raw;
  if (isStorageRenderUrl(raw)) return raw;
  if (!isStorageObjectPublicUrl(raw)) return raw;

  const preset = PRESETS[size];
  // Strip prior query (e.g. ?t= cache-bust) — transforms use their own params.
  const base = raw.split('?')[0] ?? raw;
  const renderBase = base.replace(OBJECT_PUBLIC, RENDER_PUBLIC);
  const params = new URLSearchParams();
  params.set('width', String(preset.width));
  if (preset.height != null) params.set('height', String(preset.height));
  params.set('resize', preset.resize ?? 'cover');
  params.set('quality', String(preset.quality ?? 70));
  return `${renderBase}?${params.toString()}`;
}

/** Map any Image-ish source through a display size (numbers / empty untouched). */
export function withDisplaySize(
  source: string | number | null | undefined,
  size: DisplaySize,
): string | number | null | undefined {
  if (source == null || typeof source === 'number') return source;
  if (typeof source !== 'string') return source;
  return storageDisplayUrl(source, size);
}

/** Collect http(s) display URLs for prefetch (skips modules / empty). */
export function collectPrefetchUrls(
  urls: Array<string | number | null | undefined>,
  size: DisplaySize,
  limit = 24,
): string[] {
  const out: string[] = [];
  for (const u of urls) {
    if (out.length >= limit) break;
    if (typeof u !== 'string' || !u.trim()) continue;
    const display = storageDisplayUrl(u, size);
    if (isHttpUrl(display)) out.push(display);
  }
  return out;
}

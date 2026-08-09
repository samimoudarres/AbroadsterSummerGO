import type { GalleryAsset } from './galleryAssets';
import type { CollageLayoutId } from './collageLayouts';
import type { PhotoCrop } from './collageLayouts';
import type { PlaceSuggestion } from '../geocode';

/** In-memory draft so library picks survive remounts until share / discard. */
export type CreatePostDraft = {
  mode: 'collage' | 'carousel';
  layoutId: CollageLayoutId;
  /** Photos added via "Add from library" (kept at front of gallery). */
  libraryAssets: GalleryAsset[];
  selectedIds: string[];
  crops: PhotoCrop[];
  caption: string;
  cityQuery: string;
  selectedPlace: PlaceSuggestion | null;
  audience: 'all' | 'friends' | 'communities';
  audienceCommunityIds: string[];
  taggedTripId: string | null;
  taggedUserIds: string[];
};

let draft: CreatePostDraft | null = null;

export function getCreatePostDraft(): CreatePostDraft | null {
  return draft;
}

export function saveCreatePostDraft(next: CreatePostDraft): void {
  draft = next;
}

export function clearCreatePostDraft(): void {
  draft = null;
}

/** Merge library picks into a gallery list without duplicates. */
export function mergeGalleryWithLibrary(
  base: GalleryAsset[],
  library: GalleryAsset[],
): GalleryAsset[] {
  const seen = new Set<string>();
  const out: GalleryAsset[] = [];
  for (const a of library) {
    if (seen.has(a.id)) continue;
    seen.add(a.id);
    out.push(a);
  }
  for (const a of base) {
    if (seen.has(a.id)) continue;
    seen.add(a.id);
    out.push(a);
  }
  return out;
}

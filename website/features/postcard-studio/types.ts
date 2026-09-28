/** Postcard Studio — serializable project schema (v1). */

export const POSTCARD_WIDTH = 1080;
export const POSTCARD_HEIGHT = 1920;
export const MIN_PHOTOS = 4;
export const MAX_PHOTOS = 12;
export const PROJECT_VERSION = 1 as const;

export type TemplateId = 'classic' | 'scrapbook' | 'editorial';

export type PaperId = 'cream' | 'ivory' | 'kraft';
export type TapeId = 'tan' | 'mint' | 'coral' | 'none';
export type BorderId = 'polaroid' | 'thin' | 'thick';
export type TitleVariant = 'block' | 'slant' | 'stack';

export interface DestinationData {
  displayName: string;
  /** Normalized key for art cache */
  cacheKey: string;
  placeId?: string | null;
  countryCode?: string | null;
}

export interface PhotoRecord {
  id: string;
  /** IndexedDB blob key */
  blobKey: string;
  /** Object URL for current session (not persisted) */
  objectUrl?: string;
  width: number;
  height: number;
  name: string;
}

export interface CardState {
  id: string;
  photoId: string | null;
  /** Frame rect in canvas coords */
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  /** Crop: scale relative to cover-fit, offset in image-normalized [-1,1] space */
  cropScale: number;
  cropOffsetX: number;
  cropOffsetY: number;
  zIndex: number;
  hidden?: boolean;
}

export interface StyleSettings {
  paper: PaperId;
  tape: TapeId;
  border: BorderId;
  vintageIntensity: number; // 0–1
  warmth: number; // 0–1
  grain: number; // 0–1
  vignette: number; // 0–1
  titleVariant: TitleVariant;
  greetingsFrom: boolean;
}

export interface DestinationArtRef {
  status: 'fallback' | 'ready' | 'pending' | 'error';
  url: string | null;
  source: 'fallback' | 'recraft' | 'bundled';
  message?: string;
}

export interface PostcardProject {
  version: typeof PROJECT_VERSION;
  destination: DestinationData;
  templateId: TemplateId;
  canvas: { width: number; height: number };
  photos: PhotoRecord[];
  cards: CardState[];
  style: StyleSettings;
  destinationArt: DestinationArtRef;
  createdAt: string;
  updatedAt: string;
}

export interface PersistedProjectMeta {
  version: typeof PROJECT_VERSION;
  destination: DestinationData;
  templateId: TemplateId;
  canvas: { width: number; height: number };
  photos: Array<Omit<PhotoRecord, 'objectUrl'>>;
  cards: CardState[];
  style: StyleSettings;
  destinationArt: DestinationArtRef;
  createdAt: string;
  updatedAt: string;
}

export const DEFAULT_STYLE: StyleSettings = {
  paper: 'cream',
  tape: 'tan',
  border: 'polaroid',
  vintageIntensity: 0.55,
  warmth: 0.45,
  grain: 0.35,
  vignette: 0.4,
  titleVariant: 'block',
  greetingsFrom: true,
};

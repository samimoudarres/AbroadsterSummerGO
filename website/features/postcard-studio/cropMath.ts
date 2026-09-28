import type { CardState } from './types';

export const MIN_CROP_SCALE = 1;
export const MAX_CROP_SCALE = 3;

export function clampCropScale(scale: number): number {
  return Math.max(MIN_CROP_SCALE, Math.min(MAX_CROP_SCALE, scale));
}

export function clampCropOffset(offset: number, scale: number): number {
  const max = Math.max(0, (scale - 1) / scale);
  return Math.max(-max, Math.min(max, offset));
}

/** Cover-fit base size of image inside frame. */
export function coverFit(
  imgW: number,
  imgH: number,
  frameW: number,
  frameH: number,
): { drawW: number; drawH: number } {
  const scale = Math.max(frameW / imgW, frameH / imgH);
  return { drawW: imgW * scale, drawH: imgH * scale };
}

export function normalizeCardCrop(card: CardState): CardState {
  const cropScale = clampCropScale(card.cropScale);
  return {
    ...card,
    cropScale,
    cropOffsetX: clampCropOffset(card.cropOffsetX, cropScale),
    cropOffsetY: clampCropOffset(card.cropOffsetY, cropScale),
  };
}

export function resetCrop(card: CardState): CardState {
  return {
    ...card,
    cropScale: 1,
    cropOffsetX: 0,
    cropOffsetY: 0,
  };
}

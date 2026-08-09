/** Collage layout definitions — edge-to-edge slots (no gutters). */

export type CollageLayoutId =
  | 'single'
  | 'split2'
  | 'split2_stack'
  | 'tri_top2'
  | 'tri_stack'
  | 'quad2x2'
  | 'quad_wide_top'
  | 'five_portrait'
  | 'six_feature'
  | 'eight_3x3_2'
  | 'nine_grid';

/** Slot rect as percentages of canvas (0–100). */
export type CollageSlot = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type CollageLayout = {
  id: CollageLayoutId;
  label: string;
  /** Short hint under the thumbnail */
  hint: string;
  slots: CollageSlot[];
  /** Aspect ratio width/height of the overall canvas */
  aspect: number;
};

export type PhotoCrop = {
  scale: number;
  offsetX: number;
  offsetY: number;
};

export const DEFAULT_CROP: PhotoCrop = {
  scale: 1,
  offsetX: 0,
  offsetY: 0,
};

export const COLLAGE_LAYOUTS: CollageLayout[] = [
  {
    id: 'single',
    label: '1',
    hint: 'Full',
    aspect: 1,
    slots: [{ x: 0, y: 0, w: 100, h: 100 }],
  },
  {
    id: 'split2',
    label: '2',
    hint: 'Side by side',
    aspect: 1,
    slots: [
      { x: 0, y: 0, w: 50, h: 100 },
      { x: 50, y: 0, w: 50, h: 100 },
    ],
  },
  {
    id: 'split2_stack',
    label: '2',
    hint: 'Stacked',
    aspect: 1,
    slots: [
      { x: 0, y: 0, w: 100, h: 50 },
      { x: 0, y: 50, w: 100, h: 50 },
    ],
  },
  {
    id: 'tri_top2',
    label: '3',
    hint: 'L-shape',
    aspect: 0.75,
    slots: [
      { x: 0, y: 0, w: 50, h: 70 },
      { x: 50, y: 0, w: 50, h: 70 },
      { x: 0, y: 70, w: 100, h: 30 },
    ],
  },
  {
    id: 'tri_stack',
    label: '3',
    hint: 'Stacked',
    aspect: 0.75,
    slots: [
      { x: 0, y: 0, w: 100, h: 33.33 },
      { x: 0, y: 33.33, w: 100, h: 33.34 },
      { x: 0, y: 66.67, w: 100, h: 33.33 },
    ],
  },
  {
    id: 'quad2x2',
    label: '4',
    hint: 'Grid',
    aspect: 1,
    slots: [
      { x: 0, y: 0, w: 50, h: 50 },
      { x: 50, y: 0, w: 50, h: 50 },
      { x: 0, y: 50, w: 50, h: 50 },
      { x: 50, y: 50, w: 50, h: 50 },
    ],
  },
  {
    id: 'quad_wide_top',
    label: '4',
    hint: 'Wide top',
    aspect: 1,
    slots: [
      { x: 0, y: 0, w: 100, h: 66.67 },
      { x: 0, y: 66.67, w: 33.33, h: 33.33 },
      { x: 33.33, y: 66.67, w: 33.34, h: 33.33 },
      { x: 66.67, y: 66.67, w: 33.33, h: 33.33 },
    ],
  },
  {
    id: 'five_portrait',
    label: '5',
    hint: 'Portrait',
    aspect: 0.75,
    slots: [
      { x: 0, y: 0, w: 33.33, h: 65 },
      { x: 33.33, y: 0, w: 33.34, h: 65 },
      { x: 66.67, y: 0, w: 33.33, h: 65 },
      { x: 0, y: 65, w: 50, h: 35 },
      { x: 50, y: 65, w: 50, h: 35 },
    ],
  },
  {
    id: 'six_feature',
    label: '6',
    hint: 'Feature',
    aspect: 1,
    slots: [
      { x: 0, y: 0, w: 66.67, h: 66.67 },
      { x: 66.67, y: 0, w: 33.33, h: 33.33 },
      { x: 66.67, y: 33.33, w: 33.33, h: 33.34 },
      { x: 0, y: 66.67, w: 33.33, h: 33.33 },
      { x: 33.33, y: 66.67, w: 33.34, h: 33.33 },
      { x: 66.67, y: 66.67, w: 33.33, h: 33.33 },
    ],
  },
  {
    id: 'eight_3x3_2',
    label: '8',
    hint: '8-up',
    aspect: 1,
    slots: [
      { x: 0, y: 0, w: 33.33, h: 33.33 },
      { x: 33.33, y: 0, w: 33.34, h: 33.33 },
      { x: 66.67, y: 0, w: 33.33, h: 33.33 },
      { x: 0, y: 33.33, w: 33.33, h: 33.34 },
      { x: 33.33, y: 33.33, w: 33.34, h: 33.34 },
      { x: 66.67, y: 33.33, w: 33.33, h: 33.34 },
      { x: 0, y: 66.67, w: 50, h: 33.33 },
      { x: 50, y: 66.67, w: 50, h: 33.33 },
    ],
  },
  {
    id: 'nine_grid',
    label: '9',
    hint: '3×3',
    aspect: 1,
    slots: [
      { x: 0, y: 0, w: 33.33, h: 33.33 },
      { x: 33.33, y: 0, w: 33.34, h: 33.33 },
      { x: 66.67, y: 0, w: 33.33, h: 33.33 },
      { x: 0, y: 33.33, w: 33.33, h: 33.34 },
      { x: 33.33, y: 33.33, w: 33.34, h: 33.34 },
      { x: 66.67, y: 33.33, w: 33.33, h: 33.34 },
      { x: 0, y: 66.67, w: 33.33, h: 33.33 },
      { x: 33.33, y: 66.67, w: 33.34, h: 33.33 },
      { x: 66.67, y: 66.67, w: 33.33, h: 33.33 },
    ],
  },
];

export function layoutById(id: string | null | undefined): CollageLayout | null {
  if (!id) return null;
  return COLLAGE_LAYOUTS.find((l) => l.id === id) ?? null;
}

export function slotCount(id: CollageLayoutId): number {
  return layoutById(id)?.slots.length ?? 1;
}

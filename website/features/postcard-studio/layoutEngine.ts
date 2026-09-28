import type { CardState, TemplateId } from './types';
import { POSTCARD_HEIGHT, POSTCARD_WIDTH } from './types';

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

/** Safe card count per template for N photos. */
export function slotsForTemplate(template: TemplateId, photoCount: number): number {
  const n = clamp(photoCount, 4, 12);
  if (template === 'classic') return clamp(Math.min(n, 10), 6, 10);
  if (template === 'scrapbook') return clamp(n, 8, 12);
  return clamp(Math.min(n, 8), 5, 8);
}

type Slot = { x: number; y: number; w: number; h: number; rotation: number };

function classicSlots(count: number): Slot[] {
  // Surround large letter band (y ~ 520–1100)
  const presets: Slot[] = [
    { x: 48, y: 80, w: 320, h: 380, rotation: -6 },
    { x: 700, y: 60, w: 300, h: 340, rotation: 5 },
    { x: 40, y: 500, w: 240, h: 300, rotation: -3 },
    { x: 800, y: 480, w: 230, h: 290, rotation: 4 },
    { x: 60, y: 1180, w: 340, h: 300, rotation: 3 },
    { x: 680, y: 1160, w: 320, h: 320, rotation: -5 },
    { x: 380, y: 80, w: 280, h: 260, rotation: 2 },
    { x: 360, y: 1380, w: 360, h: 280, rotation: -2 },
    { x: 40, y: 860, w: 220, h: 260, rotation: 6 },
    { x: 820, y: 840, w: 210, h: 250, rotation: -4 },
  ];
  return presets.slice(0, count).map((s) => ({
    ...s,
    x: clamp(s.x, 16, POSTCARD_WIDTH - s.w - 16),
    y: clamp(s.y, 16, POSTCARD_HEIGHT - s.h - 16),
  }));
}

function scrapbookSlots(count: number): Slot[] {
  const presets: Slot[] = [
    { x: 36, y: 70, w: 300, h: 340, rotation: -8 },
    { x: 380, y: 50, w: 280, h: 300, rotation: 7 },
    { x: 720, y: 90, w: 300, h: 360, rotation: -4 },
    { x: 50, y: 440, w: 260, h: 300, rotation: 5 },
    { x: 360, y: 400, w: 320, h: 280, rotation: -6 },
    { x: 740, y: 480, w: 280, h: 300, rotation: 3 },
    { x: 40, y: 860, w: 300, h: 320, rotation: -3 },
    { x: 400, y: 820, w: 300, h: 340, rotation: 8 },
    { x: 760, y: 900, w: 260, h: 300, rotation: -7 },
    { x: 80, y: 1280, w: 320, h: 300, rotation: 4 },
    { x: 460, y: 1320, w: 280, h: 280, rotation: -5 },
    { x: 780, y: 1360, w: 240, h: 260, rotation: 6 },
  ];
  return presets.slice(0, count).map((s) => ({
    ...s,
    x: clamp(s.x, 12, POSTCARD_WIDTH - s.w - 12),
    y: clamp(s.y, 12, POSTCARD_HEIGHT - s.h - 12),
  }));
}

function editorialSlots(count: number): Slot[] {
  const presets: Slot[] = [
    { x: 70, y: 100, w: 420, h: 480, rotation: -3 },
    { x: 560, y: 80, w: 440, h: 400, rotation: 2 },
    { x: 60, y: 720, w: 380, h: 420, rotation: 3 },
    { x: 520, y: 640, w: 480, h: 360, rotation: -2 },
    { x: 80, y: 1280, w: 440, h: 380, rotation: -1 },
    { x: 580, y: 1220, w: 420, h: 400, rotation: 2 },
    { x: 360, y: 1000, w: 360, h: 320, rotation: 4 },
    { x: 40, y: 400, w: 280, h: 280, rotation: -4 },
  ];
  return presets.slice(0, count).map((s) => ({
    ...s,
    x: clamp(s.x, 24, POSTCARD_WIDTH - s.w - 24),
    y: clamp(s.y, 24, POSTCARD_HEIGHT - s.h - 24),
  }));
}

export function generateLayout(
  template: TemplateId,
  photoIds: string[],
): CardState[] {
  const count = slotsForTemplate(template, photoIds.length);
  const ids = photoIds.slice(0, count);
  const slots =
    template === 'classic'
      ? classicSlots(count)
      : template === 'scrapbook'
        ? scrapbookSlots(count)
        : editorialSlots(count);

  return slots.map((s, i) => ({
    id: `card-${i}-${ids[i] ?? 'empty'}`,
    photoId: ids[i] ?? null,
    x: s.x,
    y: s.y,
    w: s.w,
    h: s.h,
    rotation: s.rotation,
    cropScale: 1,
    cropOffsetX: 0,
    cropOffsetY: 0,
    zIndex: i + 1,
  }));
}

/** Shuffle within template constraints (new rotations/positions from presets with jitter). */
export function shuffleLayout(
  template: TemplateId,
  cards: CardState[],
): CardState[] {
  const photoIds = cards
    .filter((c) => c.photoId && !c.hidden)
    .map((c) => c.photoId!) ;
  const base = generateLayout(template, photoIds);
  return base.map((c, i) => ({
    ...c,
    rotation: c.rotation + (i % 2 === 0 ? -1.5 : 1.5),
    x: clamp(c.x + ((i * 7) % 17) - 8, 12, POSTCARD_WIDTH - c.w - 12),
    y: clamp(c.y + ((i * 11) % 19) - 9, 12, POSTCARD_HEIGHT - c.h - 12),
  }));
}

export function reorderLayers(
  cards: CardState[],
  cardId: string,
  direction: 'forward' | 'backward' | 'front' | 'back',
): CardState[] {
  const sorted = [...cards].sort((a, b) => a.zIndex - b.zIndex);
  const idx = sorted.findIndex((c) => c.id === cardId);
  if (idx < 0) return cards;
  const [item] = sorted.splice(idx, 1);
  if (direction === 'front') sorted.push(item);
  else if (direction === 'back') sorted.unshift(item);
  else if (direction === 'forward') {
    sorted.splice(Math.min(idx + 1, sorted.length), 0, item);
  } else {
    sorted.splice(Math.max(idx - 1, 0), 0, item);
  }
  return sorted.map((c, i) => ({ ...c, zIndex: i + 1 }));
}

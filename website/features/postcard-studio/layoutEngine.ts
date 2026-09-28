import type { CardState, TemplateId } from './types';
import { POSTCARD_HEIGHT, POSTCARD_WIDTH } from './types';

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

/**
 * How many cloth tiles to place. Always enough to cover 9:16 with overlap.
 * Scales with upload count (4–12) but never goes sparse.
 */
export function slotsForTemplate(template: TemplateId, photoCount: number): number {
  const n = clamp(photoCount, 4, 12);
  if (template === 'editorial') return clamp(Math.max(n, 6), 6, 10);
  if (template === 'scrapbook') return clamp(Math.max(n, 8), 8, 12);
  return clamp(Math.max(n, 8), 8, 12);
}

type Slot = { x: number; y: number; w: number; h: number; rotation: number };

/**
 * Coverage-first cloth: tile size grows when fewer photos are uploaded so
 * 4 photos still blanket the canvas; more photos = slightly smaller tiles
 * spaced so each print is visible but gaps never open to paper.
 */
function clothSlots(count: number, density: 'max' | 'dense' | 'bold'): Slot[] {
  // Fewer tiles → larger frames (always bleed past edges)
  const cols = count <= 6 ? 2 : 3;
  const rows = Math.ceil(count / cols);
  const overlapX = density === 'max' ? 0.42 : density === 'dense' ? 0.38 : 0.34;
  const overlapY = density === 'max' ? 0.4 : density === 'dense' ? 0.36 : 0.32;

  const cellW = POSTCARD_WIDTH / cols;
  const cellH = POSTCARD_HEIGHT / rows;
  const baseW = cellW * (1 + overlapX) + 60;
  const baseH = cellH * (1 + overlapY) + 80;

  const slots: Slot[] = [];
  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const w = baseW + ((i * 37) % 70) - 20;
    const h = baseH + ((i * 53) % 80) - 25;
    const x = col * cellW - (w - cellW) / 2 + ((i * 11) % 30) - 15;
    const y = row * cellH - (h - cellH) / 2 + ((i * 13) % 36) - 18;
    const rotation = ((i % 5) - 2) * (density === 'max' ? 5.5 : 3.5);
    slots.push({
      x: clamp(x, -w * 0.2, POSTCARD_WIDTH - w * 0.8),
      y: clamp(y, -h * 0.15, POSTCARD_HEIGHT - h * 0.8),
      w,
      h,
      rotation,
    });
  }

  // Edge sealers — always cover corners/sides regardless of photo count
  const sealers: Slot[] = [
    { x: -160, y: -120, w: Math.max(baseW, 640), h: Math.max(baseH, 700), rotation: -6 },
    {
      x: POSTCARD_WIDTH - Math.max(baseW, 640) + 160,
      y: -100,
      w: Math.max(baseW, 640),
      h: Math.max(baseH, 680),
      rotation: 5,
    },
    {
      x: -140,
      y: POSTCARD_HEIGHT - Math.max(baseH, 700) + 140,
      w: Math.max(baseW, 620),
      h: Math.max(baseH, 700),
      rotation: 4,
    },
    {
      x: POSTCARD_WIDTH - Math.max(baseW, 640) + 140,
      y: POSTCARD_HEIGHT - Math.max(baseH, 720) + 160,
      w: Math.max(baseW, 640),
      h: Math.max(baseH, 720),
      rotation: -5,
    },
    {
      x: POSTCARD_WIDTH / 2 - Math.max(baseW, 600) / 2,
      y: -140,
      w: Math.max(baseW, 600),
      h: Math.max(baseH * 0.85, 560),
      rotation: 2,
    },
    {
      x: POSTCARD_WIDTH / 2 - Math.max(baseW, 600) / 2,
      y: POSTCARD_HEIGHT - Math.max(baseH * 0.9, 600) + 120,
      w: Math.max(baseW, 600),
      h: Math.max(baseH * 0.9, 600),
      rotation: -2,
    },
  ];

  return [...slots, ...sealers].slice(0, Math.max(count + 4, 12));
}

/** Full-bleed underlay strips (no rotation) — guarantees zero gray. */
export function bleedUnderlaySlots(photoCount: number): Slot[] {
  const n = clamp(photoCount, 4, 12);
  const cols = 2;
  const rows = Math.ceil(Math.max(n, 6) / cols);
  const slots: Slot[] = [];
  for (let i = 0; i < cols * rows; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const w = POSTCARD_WIDTH / cols + 40;
    const h = POSTCARD_HEIGHT / rows + 40;
    slots.push({
      x: col * (POSTCARD_WIDTH / cols) - 20,
      y: row * (POSTCARD_HEIGHT / rows) - 20,
      w,
      h,
      rotation: 0,
    });
  }
  return slots;
}

export function generateLayout(
  template: TemplateId,
  photoIds: string[],
): CardState[] {
  const unique = photoIds.filter(Boolean);
  const count = slotsForTemplate(template, Math.max(unique.length, 4));
  const density =
    template === 'scrapbook' ? 'max' : template === 'classic' ? 'dense' : 'bold';
  const slots = clothSlots(count, density);

  return slots.map((s, i) => {
    const photoId = unique.length ? unique[i % unique.length] : null;
    return {
      id: `card-${i}-${photoId ?? 'empty'}`,
      photoId,
      x: s.x,
      y: s.y,
      w: s.w,
      h: s.h,
      rotation: s.rotation,
      cropScale: 1.18 + (i % 3) * 0.08,
      cropOffsetX: ((i % 5) - 2) * 0.04,
      cropOffsetY: ((i % 3) - 1) * 0.03,
      zIndex: i + 1,
    };
  });
}

export function needsClothUpgrade(cards: CardState[]): boolean {
  if (cards.length < 10) return true;
  const avgW = cards.reduce((s, c) => s + c.w, 0) / Math.max(cards.length, 1);
  return avgW < 400;
}

export function shuffleLayout(
  template: TemplateId,
  cards: CardState[],
): CardState[] {
  const photoIds = [
    ...new Set(
      cards
        .filter((c) => c.photoId && !c.hidden)
        .map((c) => c.photoId!),
    ),
  ];
  const base = generateLayout(template, photoIds);
  return base.map((c, i) => ({
    ...c,
    rotation: c.rotation + (i % 2 === 0 ? -2.5 : 2.5),
    cropScale: clamp(c.cropScale + (i % 3) * 0.05, 1, 2.4),
    x: clamp(c.x + ((i * 13) % 25) - 12, -c.w * 0.25, POSTCARD_WIDTH - c.w * 0.7),
    y: clamp(c.y + ((i * 11) % 21) - 10, -c.h * 0.2, POSTCARD_HEIGHT - c.h * 0.7),
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

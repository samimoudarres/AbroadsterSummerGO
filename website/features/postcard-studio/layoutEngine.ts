import type { CardState, TemplateId } from './types';
import { POSTCARD_HEIGHT, POSTCARD_WIDTH } from './types';

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

/**
 * Dense "photo cloth" layouts: oversized frames that overlap heavily so almost
 * no paper shows through — like prints scattered across a table.
 */
export function slotsForTemplate(template: TemplateId, photoCount: number): number {
  const n = clamp(photoCount, 4, 12);
  if (template === 'editorial') return clamp(Math.max(n, 7), 7, 10);
  if (template === 'scrapbook') return clamp(Math.max(n, 9), 9, 12);
  return clamp(Math.max(n, 9), 9, 12);
}

type Slot = { x: number; y: number; w: number; h: number; rotation: number };

/** Cover the full 1080×1920 with overlapping tiles — no beige gaps. */
function clothSlots(count: number, density: 'max' | 'dense' | 'bold'): Slot[] {
  // Oversized cards + negative margins = full-bleed cloth
  const baseW = density === 'bold' ? 620 : density === 'max' ? 580 : 540;
  const baseH = density === 'bold' ? 700 : density === 'max' ? 660 : 620;
  const cols = density === 'bold' ? 2 : 2;
  const rows = Math.ceil(count / cols);
  const slots: Slot[] = [];

  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const w = baseW + ((i * 41) % 100) - 30;
    const h = baseH + ((i * 53) % 110) - 40;
    const cellW = POSTCARD_WIDTH / cols;
    const cellH = POSTCARD_HEIGHT / Math.max(rows, 1);
    // Bleed past edges so paper never peeks through
    const x = col * cellW - w * 0.28 + ((i * 17) % 50) - 25;
    const y = row * cellH - h * 0.22 + ((i * 19) % 60) - 30;
    const rotation = ((i % 7) - 3) * (density === 'max' ? 8 : 5.5);
    slots.push({
      x: clamp(x, -w * 0.35, POSTCARD_WIDTH - w * 0.65),
      y: clamp(y, -h * 0.3, POSTCARD_HEIGHT - h * 0.65),
      w,
      h,
      rotation,
    });
  }

  // Corner + mid-edge patches guarantee full coverage
  const edgePatches: Slot[] = [
    { x: -120, y: -90, w: 520, h: 560, rotation: -9 },
    { x: POSTCARD_WIDTH - 400, y: -70, w: 520, h: 540, rotation: 7 },
    { x: -100, y: POSTCARD_HEIGHT - 480, w: 500, h: 560, rotation: 6 },
    { x: POSTCARD_WIDTH - 420, y: POSTCARD_HEIGHT - 500, w: 540, h: 580, rotation: -7 },
    { x: POSTCARD_WIDTH / 2 - 280, y: -100, w: 560, h: 480, rotation: 3 },
    { x: POSTCARD_WIDTH / 2 - 260, y: POSTCARD_HEIGHT - 420, w: 540, h: 500, rotation: -4 },
    { x: -110, y: POSTCARD_HEIGHT / 2 - 280, w: 480, h: 560, rotation: 5 },
    { x: POSTCARD_WIDTH - 370, y: POSTCARD_HEIGHT / 2 - 300, w: 500, h: 580, rotation: -5 },
  ];

  const merged = [...slots];
  for (let i = 0; i < edgePatches.length && merged.length < 16; i++) {
    merged.push(edgePatches[i]);
  }
  return merged.slice(0, Math.max(count, 10));
}

export function generateLayout(
  template: TemplateId,
  photoIds: string[],
): CardState[] {
  const count = slotsForTemplate(template, Math.max(photoIds.length, 4));
  const density =
    template === 'scrapbook' ? 'max' : template === 'classic' ? 'dense' : 'bold';
  const slots = clothSlots(count, density);

  const cards: CardState[] = slots.map((s, i) => {
    const photoId = photoIds.length ? photoIds[i % photoIds.length] : null;
    return {
      id: `card-${i}-${photoId ?? 'empty'}`,
      photoId,
      x: s.x,
      y: s.y,
      w: s.w,
      h: s.h,
      rotation: s.rotation,
      cropScale: 1.2 + (i % 3) * 0.1,
      cropOffsetX: ((i % 5) - 2) * 0.05,
      cropOffsetY: ((i % 3) - 1) * 0.04,
      zIndex: i + 1,
    };
  });

  return cards;
}

/** True when a saved draft still uses sparse/oval-era card sizes. */
export function needsClothUpgrade(cards: CardState[]): boolean {
  if (cards.length < 8) return true;
  const avgW = cards.reduce((s, c) => s + c.w, 0) / cards.length;
  return avgW < 420;
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
    rotation: c.rotation + (i % 2 === 0 ? -3 : 3),
    cropScale: clamp(c.cropScale + (i % 3) * 0.06, 1, 2.4),
    x: clamp(c.x + ((i * 13) % 29) - 14, -c.w * 0.3, POSTCARD_WIDTH - c.w * 0.6),
    y: clamp(c.y + ((i * 11) % 25) - 12, -c.h * 0.25, POSTCARD_HEIGHT - c.h * 0.6),
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

/**
 * Mid-century landmark vignettes for clipping inside large letters.
 * Preset cities get recognizable motifs; custom places get a seeded generic panorama.
 * Never draws destination text/letters — spelling stays in app code.
 */

import {
  findDestinationPreset,
  type DestinationPreset,
  type LandmarkMotif,
} from './destinationPresets';

type Rnd = () => number;

function seededRnd(seed: string): Rnd {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h |= 0;
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function paintSky(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  sky: [string, string],
) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, sky[0]);
  g.addColorStop(0.45, '#b8d8e0');
  g.addColorStop(0.7, sky[1]);
  g.addColorStop(1, '#d4a050');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  ctx.beginPath();
  ctx.fillStyle = '#f5d76e';
  ctx.arc(w * 0.18, h * 0.18, Math.min(w, h) * 0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#c47a2a';
  ctx.lineWidth = 3;
  ctx.stroke();
}

function paintWater(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  color: string,
  rnd: Rnd,
) {
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    const y0 = h * 0.55 + i * (h * 0.1);
    ctx.moveTo(0, h);
    ctx.lineTo(0, y0);
    for (let x = 0; x <= w; x += 24) {
      ctx.lineTo(x, y0 + Math.sin(x * 0.02 + i) * 12 + rnd() * 6);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.45 + i * 0.08;
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function strokeInk(ctx: CanvasRenderingContext2D) {
  ctx.strokeStyle = '#1e1a16';
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
}

function drawDuomo(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number,
) {
  strokeInk(ctx);
  ctx.fillStyle = '#f0e6d4';
  ctx.fillRect(cx - s * 0.55, cy - s * 0.1, s * 1.1, s * 0.85);
  ctx.strokeRect(cx - s * 0.55, cy - s * 0.1, s * 1.1, s * 0.85);
  // dome
  ctx.beginPath();
  ctx.fillStyle = '#c45a2a';
  ctx.ellipse(cx, cy - s * 0.05, s * 0.45, s * 0.38, 0, Math.PI, 0);
  ctx.fill();
  ctx.stroke();
  // lantern
  ctx.fillStyle = '#e8d8b8';
  ctx.fillRect(cx - s * 0.08, cy - s * 0.55, s * 0.16, s * 0.28);
  ctx.strokeRect(cx - s * 0.08, cy - s * 0.55, s * 0.16, s * 0.28);
  ctx.beginPath();
  ctx.fillStyle = '#c45a2a';
  ctx.arc(cx, cy - s * 0.58, s * 0.1, Math.PI, 0);
  ctx.fill();
  ctx.stroke();
}

function drawColosseum(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number,
) {
  strokeInk(ctx);
  ctx.fillStyle = '#d4a878';
  ctx.beginPath();
  ctx.ellipse(cx, cy + s * 0.15, s * 0.7, s * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#c49868';
  ctx.fillRect(cx - s * 0.7, cy - s * 0.45, s * 1.4, s * 0.65);
  ctx.strokeRect(cx - s * 0.7, cy - s * 0.45, s * 1.4, s * 0.65);
  ctx.fillStyle = '#3a2820';
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 6; col++) {
      const ax = cx - s * 0.55 + col * s * 0.2;
      const ay = cy - s * 0.35 + row * s * 0.2;
      ctx.beginPath();
      ctx.ellipse(ax, ay, s * 0.06, s * 0.09, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawTower(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number,
  accent: string,
) {
  strokeInk(ctx);
  // Eiffel-ish lattice or bell tower
  ctx.fillStyle = '#c8b090';
  ctx.beginPath();
  ctx.moveTo(cx, cy - s * 0.9);
  ctx.lineTo(cx + s * 0.35, cy + s * 0.55);
  ctx.lineTo(cx - s * 0.35, cy + s * 0.55);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  for (let i = 0; i < 5; i++) {
    const y = cy - s * 0.7 + i * s * 0.25;
    const w = s * 0.08 + i * s * 0.05;
    ctx.beginPath();
    ctx.moveTo(cx - w, y);
    ctx.lineTo(cx + w, y);
    ctx.stroke();
  }
  strokeInk(ctx);
}

function drawBeach(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  water: string,
  rnd: Rnd,
) {
  paintWater(ctx, w, h, water, rnd);
  ctx.fillStyle = '#e8c878';
  ctx.fillRect(0, h * 0.72, w, h * 0.28);
  // palms
  for (let i = 0; i < 3; i++) {
    const px = w * (0.15 + i * 0.3);
    ctx.strokeStyle = '#3a5c28';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(px, h * 0.85);
    ctx.quadraticCurveTo(px + 20, h * 0.5, px - 10, h * 0.28);
    ctx.stroke();
    ctx.fillStyle = '#4a7a38';
    for (let f = 0; f < 5; f++) {
      ctx.beginPath();
      ctx.ellipse(px - 10 + f * 8, h * 0.28, 18, 8, -0.8 + f * 0.35, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawMountains(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  rnd: Rnd,
) {
  ctx.fillStyle = '#5a7a68';
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.lineTo(0, h * 0.55);
  ctx.lineTo(w * 0.25, h * 0.22 + rnd() * 20);
  ctx.lineTo(w * 0.45, h * 0.48);
  ctx.lineTo(w * 0.7, h * 0.15);
  ctx.lineTo(w, h * 0.5);
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();
  strokeInk(ctx);
  ctx.stroke();
  // snow caps
  ctx.fillStyle = '#f4f0e8';
  ctx.beginPath();
  ctx.moveTo(w * 0.7, h * 0.15);
  ctx.lineTo(w * 0.64, h * 0.28);
  ctx.lineTo(w * 0.76, h * 0.28);
  ctx.closePath();
  ctx.fill();
  // lake
  ctx.fillStyle = '#3a98b0';
  ctx.beginPath();
  ctx.ellipse(w * 0.5, h * 0.72, w * 0.35, h * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawBridge(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number,
  accent: string,
) {
  strokeInk(ctx);
  ctx.fillStyle = '#c8a878';
  ctx.fillRect(cx - s * 0.85, cy, s * 1.7, s * 0.18);
  ctx.strokeRect(cx - s * 0.85, cy, s * 1.7, s * 0.18);
  ctx.fillStyle = accent;
  for (let i = 0; i < 3; i++) {
    const ax = cx - s * 0.5 + i * s * 0.5;
    ctx.beginPath();
    ctx.arc(ax, cy, s * 0.22, Math.PI, 0);
    ctx.stroke();
  }
  // towers
  ctx.fillStyle = '#e8d8b8';
  ctx.fillRect(cx - s * 0.9, cy - s * 0.55, s * 0.22, s * 0.7);
  ctx.fillRect(cx + s * 0.68, cy - s * 0.55, s * 0.22, s * 0.7);
  ctx.strokeRect(cx - s * 0.9, cy - s * 0.55, s * 0.22, s * 0.7);
  ctx.strokeRect(cx + s * 0.68, cy - s * 0.55, s * 0.22, s * 0.7);
}

function drawCanal(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  water: string,
  rnd: Rnd,
) {
  paintWater(ctx, w, h, water, rnd);
  for (let i = 0; i < 4; i++) {
    const bx = 20 + i * (w / 4);
    ctx.fillStyle = i % 2 ? '#e8d8c0' : '#d4c0a0';
    strokeInk(ctx);
    ctx.fillRect(bx, h * 0.25, w * 0.18, h * 0.4);
    ctx.strokeRect(bx, h * 0.25, w * 0.18, h * 0.4);
    ctx.fillStyle = '#3a6080';
    for (let wy = h * 0.32; wy < h * 0.55; wy += 22) {
      ctx.fillRect(bx + 12, wy, 10, 14);
      ctx.fillRect(bx + w * 0.1, wy, 10, 14);
    }
  }
}

function drawCastle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number,
) {
  strokeInk(ctx);
  ctx.fillStyle = '#d8c8a8';
  ctx.fillRect(cx - s * 0.6, cy - s * 0.2, s * 1.2, s * 0.75);
  ctx.strokeRect(cx - s * 0.6, cy - s * 0.2, s * 1.2, s * 0.75);
  for (let i = 0; i < 4; i++) {
    const tx = cx - s * 0.55 + i * s * 0.35;
    ctx.fillRect(tx, cy - s * 0.45, s * 0.2, s * 0.3);
    ctx.strokeRect(tx, cy - s * 0.45, s * 0.2, s * 0.3);
  }
  ctx.fillStyle = '#3a2820';
  ctx.fillRect(cx - s * 0.12, cy + s * 0.15, s * 0.24, s * 0.4);
}

function drawTemple(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number,
) {
  strokeInk(ctx);
  ctx.fillStyle = '#e8dcc8';
  // pediment
  ctx.beginPath();
  ctx.moveTo(cx, cy - s * 0.55);
  ctx.lineTo(cx + s * 0.65, cy - s * 0.15);
  ctx.lineTo(cx - s * 0.65, cy - s * 0.15);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  for (let i = 0; i < 5; i++) {
    const px = cx - s * 0.5 + i * s * 0.25;
    ctx.fillRect(px, cy - s * 0.12, s * 0.1, s * 0.55);
    ctx.strokeRect(px, cy - s * 0.12, s * 0.1, s * 0.55);
  }
  ctx.fillRect(cx - s * 0.6, cy + s * 0.4, s * 1.2, s * 0.12);
  ctx.strokeRect(cx - s * 0.6, cy + s * 0.4, s * 1.2, s * 0.12);
}

function drawCathedral(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number,
  accent: string,
) {
  strokeInk(ctx);
  ctx.fillStyle = '#ece4d4';
  ctx.fillRect(cx - s * 0.45, cy - s * 0.15, s * 0.9, s * 0.8);
  ctx.strokeRect(cx - s * 0.45, cy - s * 0.15, s * 0.9, s * 0.8);
  ctx.beginPath();
  ctx.moveTo(cx, cy - s * 0.7);
  ctx.lineTo(cx + s * 0.35, cy - s * 0.1);
  ctx.lineTo(cx - s * 0.35, cy - s * 0.1);
  ctx.closePath();
  ctx.fillStyle = accent;
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#2a5080';
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.ellipse(cx - s * 0.22 + i * s * 0.22, cy + s * 0.15, s * 0.07, s * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawPlaza(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  accent: string,
  rnd: Rnd,
) {
  ctx.fillStyle = '#d8c8a0';
  ctx.fillRect(0, h * 0.55, w, h * 0.45);
  // fountain
  strokeInk(ctx);
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(w * 0.5, h * 0.58, Math.min(w, h) * 0.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  for (let i = 0; i < 5; i++) {
    const bx = 30 + i * ((w - 60) / 5) + rnd() * 10;
    ctx.fillStyle = '#e8dcc8';
    ctx.fillRect(bx, h * 0.2, w * 0.12, h * 0.38);
    ctx.strokeRect(bx, h * 0.2, w * 0.12, h * 0.38);
  }
}

function drawHarbor(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  water: string,
  rnd: Rnd,
) {
  paintWater(ctx, w, h, water, rnd);
  // boats
  for (let i = 0; i < 3; i++) {
    const bx = w * (0.2 + i * 0.28);
    const by = h * 0.65;
    ctx.fillStyle = i % 2 ? '#f0e8d8' : '#c85040';
    strokeInk(ctx);
    ctx.beginPath();
    ctx.moveTo(bx - 40, by);
    ctx.lineTo(bx + 40, by);
    ctx.lineTo(bx + 28, by + 22);
    ctx.lineTo(bx - 28, by + 22);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx, by - 50);
    ctx.stroke();
  }
}

function drawCliff(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  water: string,
  rnd: Rnd,
) {
  paintWater(ctx, w, h, water, rnd);
  ctx.fillStyle = '#c4a878';
  ctx.beginPath();
  ctx.moveTo(w * 0.35, h);
  ctx.lineTo(w * 0.4, h * 0.35);
  ctx.lineTo(w, h * 0.25 + rnd() * 20);
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();
  strokeInk(ctx);
  ctx.stroke();
}

function drawPalace(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number,
) {
  strokeInk(ctx);
  ctx.fillStyle = '#e8dcc8';
  ctx.fillRect(cx - s * 0.75, cy - s * 0.2, s * 1.5, s * 0.7);
  ctx.strokeRect(cx - s * 0.75, cy - s * 0.2, s * 1.5, s * 0.7);
  ctx.fillStyle = '#3a6088';
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 6; col++) {
      ctx.fillRect(
        cx - s * 0.65 + col * s * 0.22,
        cy - s * 0.05 + row * s * 0.25,
        s * 0.1,
        s * 0.14,
      );
    }
  }
}

function drawSkyline(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  rnd: Rnd,
) {
  for (let i = 0; i < 8; i++) {
    const bw = w * (0.08 + rnd() * 0.06);
    const bh = h * (0.25 + rnd() * 0.4);
    const bx = i * (w / 8) + 8;
    const by = h * 0.7 - bh;
    ctx.fillStyle = i % 2 ? '#d0c0a0' : '#b8a888';
    strokeInk(ctx);
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeRect(bx, by, bw, bh);
  }
}

function drawCove(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  water: string,
  rnd: Rnd,
) {
  paintWater(ctx, w, h, water, rnd);
  ctx.fillStyle = '#c8b090';
  ctx.beginPath();
  ctx.moveTo(0, h * 0.4);
  ctx.quadraticCurveTo(w * 0.5, h * 0.15, w, h * 0.45);
  ctx.lineTo(w, 0);
  ctx.lineTo(0, 0);
  ctx.closePath();
  ctx.fill();
  strokeInk(ctx);
  ctx.beginPath();
  ctx.moveTo(0, h * 0.4);
  ctx.quadraticCurveTo(w * 0.5, h * 0.15, w, h * 0.45);
  ctx.stroke();
  void rnd;
}

function paintMotif(
  ctx: CanvasRenderingContext2D,
  motif: LandmarkMotif,
  w: number,
  h: number,
  preset: DestinationPreset | null,
  rnd: Rnd,
) {
  const water = preset?.water ?? '#2e8fa8';
  const accent = preset?.accent ?? '#c45a2a';
  const cx = w * 0.5;
  const cy = h * 0.48;
  const s = Math.min(w, h) * 0.42;

  switch (motif) {
    case 'duomo':
      drawDuomo(ctx, cx, cy, s);
      break;
    case 'colosseum':
      drawColosseum(ctx, cx, cy, s);
      break;
    case 'tower':
      drawTower(ctx, cx, cy, s, accent);
      break;
    case 'beach':
      drawBeach(ctx, w, h, water, rnd);
      break;
    case 'mountains':
      drawMountains(ctx, w, h, rnd);
      break;
    case 'bridge':
      drawBridge(ctx, cx, cy, s, accent);
      break;
    case 'canal':
      drawCanal(ctx, w, h, water, rnd);
      break;
    case 'castle':
      drawCastle(ctx, cx, cy, s);
      break;
    case 'temple':
      drawTemple(ctx, cx, cy, s);
      break;
    case 'cathedral':
      drawCathedral(ctx, cx, cy, s, accent);
      break;
    case 'plaza':
      drawPlaza(ctx, w, h, accent, rnd);
      break;
    case 'harbor':
      drawHarbor(ctx, w, h, water, rnd);
      break;
    case 'cliff':
      drawCliff(ctx, w, h, water, rnd);
      break;
    case 'palace':
      drawPalace(ctx, cx, cy, s);
      break;
    case 'skyline':
      drawSkyline(ctx, w, h, rnd);
      break;
    case 'cove':
      drawCove(ctx, w, h, water, rnd);
      break;
    default:
      drawPlaza(ctx, w, h, accent, rnd);
  }
}

function vignetteToDataUrl(
  motif: LandmarkMotif,
  preset: DestinationPreset | null,
  seed: string,
): string {
  if (typeof document === 'undefined') return '';
  const W = 512;
  const H = 640;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  const rnd = seededRnd(seed + motif);
  const sky = preset?.sky ?? (['#5db0c8', '#f0c96a'] as [string, string]);
  paintSky(ctx, W, H, sky);
  paintMotif(ctx, motif, W, H, preset, rnd);

  // Linen + print grain
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = 'rgba(180, 90, 50, 0.07)';
  ctx.fillRect(2, 0, W, H);
  ctx.globalCompositeOperation = 'source-over';
  const img = ctx.getImageData(0, 0, W, H);
  for (let i = 0; i < img.data.length; i += 8) {
    const n = (rnd() - 0.5) * 18;
    img.data[i] = Math.min(255, Math.max(0, img.data[i] + n));
    img.data[i + 1] = Math.min(255, Math.max(0, img.data[i + 1] + n));
    img.data[i + 2] = Math.min(255, Math.max(0, img.data[i + 2] + n));
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL('image/jpeg', 0.88);
}

const GENERIC_MOTIFS: LandmarkMotif[] = [
  'plaza',
  'bridge',
  'cathedral',
  'harbor',
  'tower',
  'palace',
  'cove',
  'skyline',
];

/** One vignette per letter — landmark windows like classic large-letter cards. */
export function createLetterFillVignettes(
  destination: string,
  letterCount: number,
): string[] {
  const preset = findDestinationPreset(destination);
  const motifs = preset?.landmarks?.length
    ? preset.landmarks
    : GENERIC_MOTIFS;
  const count = Math.max(letterCount, 1);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const motif = motifs[i % motifs.length];
    out.push(vignetteToDataUrl(motif, preset, `${destination}:${i}`));
  }
  return out;
}

/** Wide panorama used as fallback / Recraft stand-in. */
export function createFallbackDestinationArt(destination: string): string {
  if (typeof document === 'undefined') return '';
  const preset = findDestinationPreset(destination);
  const W = 1800;
  const H = 720;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  const rnd = seededRnd(destination || 'Travel');
  const sky = preset?.sky ?? (['#5db0c8', '#f0c96a'] as [string, string]);
  paintSky(ctx, W, H, sky);

  const motifs = preset?.landmarks ?? GENERIC_MOTIFS;
  const panels = 5;
  for (let i = 0; i < panels; i++) {
    ctx.save();
    ctx.beginPath();
    ctx.rect((i * W) / panels, 0, W / panels, H);
    ctx.clip();
    // Local coords inside panel
    ctx.translate((i * W) / panels, 0);
    paintMotif(ctx, motifs[i % motifs.length], W / panels, H, preset, rnd);
    ctx.restore();
  }

  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = 'rgba(200, 80, 50, 0.08)';
  ctx.fillRect(4, 0, W, H);
  ctx.globalCompositeOperation = 'source-over';

  const img = ctx.getImageData(0, 0, W, H);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rnd() - 0.5) * 20;
    img.data[i] = Math.min(255, Math.max(0, img.data[i] + n));
    img.data[i + 1] = Math.min(255, Math.max(0, img.data[i + 1] + n));
    img.data[i + 2] = Math.min(255, Math.max(0, img.data[i + 2] + n));
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL('image/jpeg', 0.92);
}

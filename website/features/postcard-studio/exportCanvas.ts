import { coverFit } from './cropMath';
import { regionLabelFor } from './destinationPresets';
import { createLetterFillVignettes } from './fallbackArt';
import type { CardState, PhotoRecord, PostcardProject, StyleSettings } from './types';
import { POSTCARD_HEIGHT, POSTCARD_WIDTH } from './types';

function paperColor(paper: StyleSettings['paper']): string {
  // Dark underlay — cloth photos should cover it
  if (paper === 'ivory') return '#3d3428';
  if (paper === 'kraft') return '#2e261c';
  return '#2a2218';
}

function borderPad(border: StyleSettings['border']): {
  top: number;
  side: number;
  bottom: number;
} {
  if (border === 'thin') return { top: 4, side: 4, bottom: 4 };
  if (border === 'thick') return { top: 9, side: 9, bottom: 14 };
  return { top: 7, side: 7, bottom: 20 };
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image load failed'));
    img.src = src;
  });
}

function drawPhotoInCard(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  card: CardState,
  style: StyleSettings,
) {
  const pad = borderPad(style.border);
  const innerW = card.w - pad.side * 2;
  const innerH = card.h - pad.top - pad.bottom;
  if (innerW <= 0 || innerH <= 0) return;

  ctx.save();
  ctx.translate(card.x + card.w / 2, card.y + card.h / 2);
  ctx.rotate((card.rotation * Math.PI) / 180);

  ctx.shadowColor = 'rgba(20,12,8,0.45)';
  ctx.shadowBlur = 22;
  ctx.shadowOffsetX = 3;
  ctx.shadowOffsetY = 8;

  ctx.fillStyle = '#f7f1e6';
  ctx.fillRect(-card.w / 2, -card.h / 2, card.w, card.h);
  ctx.shadowColor = 'transparent';

  ctx.save();
  ctx.beginPath();
  ctx.rect(-card.w / 2 + pad.side, -card.h / 2 + pad.top, innerW, innerH);
  ctx.clip();

  const { drawW, drawH } = coverFit(
    img.naturalWidth,
    img.naturalHeight,
    innerW,
    innerH,
  );
  const sw = drawW * card.cropScale;
  const sh = drawH * card.cropScale;
  const ox = card.cropOffsetX * innerW;
  const oy = card.cropOffsetY * innerH;
  ctx.drawImage(
    img,
    -sw / 2 + ox,
    -sh / 2 + oy + (pad.top - pad.bottom) / 2,
    sw,
    sh,
  );
  ctx.restore();

  ctx.strokeStyle = 'rgba(40,30,20,0.25)';
  ctx.lineWidth = 1;
  ctx.strokeRect(-card.w / 2 + 1, -card.h / 2 + 1, card.w - 2, card.h - 2);
  ctx.restore();
}

function drawTape(
  ctx: CanvasRenderingContext2D,
  card: CardState,
  tape: StyleSettings['tape'],
) {
  if (tape === 'none') return;
  const colors: Record<string, string> = {
    tan: 'rgba(210, 180, 140, 0.78)',
    mint: 'rgba(160, 200, 180, 0.75)',
    coral: 'rgba(230, 140, 120, 0.75)',
  };
  ctx.save();
  ctx.translate(card.x + card.w / 2, card.y + 10);
  ctx.rotate(((card.rotation + (card.zIndex % 2 ? 12 : -10)) * Math.PI) / 180);
  ctx.fillStyle = colors[tape] || colors.tan;
  ctx.fillRect(-52, -11, 104, 24);
  ctx.restore();
}

function drawBleedUnderlay(
  ctx: CanvasRenderingContext2D,
  photoImgs: HTMLImageElement[],
) {
  if (!photoImgs.length) return;
  const cols = 2;
  const cells = Math.max(6, Math.min(photoImgs.length * 2, 12));
  const rows = Math.ceil(cells / cols);
  const cellW = POSTCARD_WIDTH / cols;
  const cellH = POSTCARD_HEIGHT / rows;
  for (let i = 0; i < cells; i++) {
    const img = photoImgs[i % photoImgs.length];
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = col * cellW - 12;
    const y = row * cellH - 12;
    const w = cellW + 24;
    const h = cellH + 24;
    const { drawW, drawH } = coverFit(
      img.naturalWidth,
      img.naturalHeight,
      w,
      h,
    );
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.drawImage(img, x + (w - drawW) / 2, y + (h - drawH) / 2, drawW, drawH);
    ctx.restore();
  }
}

function drawLargeLetters(
  ctx: CanvasRenderingContext2D,
  text: string,
  letterFillImgs: HTMLImageElement[],
  art: HTMLImageElement | null,
  style: StyleSettings,
) {
  const display = text.toUpperCase() || 'YOUR PLACE';
  if (style.greetingsFrom) {
    ctx.save();
    ctx.translate(POSTCARD_WIDTH / 2 - 20, 300);
    ctx.rotate((-4 * Math.PI) / 180);
    ctx.textAlign = 'center';
    ctx.font = '400 88px "Great Vibes", "Segoe Script", cursive';
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#14110e';
    ctx.fillStyle = '#f2d24b';
    ctx.strokeText('Greetings', -30, 0);
    ctx.fillText('Greetings', -30, 0);
    ctx.font = 'italic 700 30px Georgia, serif';
    ctx.fillStyle = '#c62828';
    ctx.strokeText('from', 150, 18);
    ctx.fillText('from', 150, 18);
    ctx.restore();
  }

  const letters = display.replace(/\s+/g, ' ').split('');
  const letterOnly = letters.filter((c) => c !== ' ');
  const long = letterOnly.length;
  let size =
    long > 14 ? 118 : long > 11 ? 140 : long > 8 ? 168 : long > 5 ? 205 : 240;

  ctx.font = `400 ${size}px Anton, Impact, Haettenschweiler, "Arial Black", sans-serif`;
  while (ctx.measureText(display).width > POSTCARD_WIDTH - 20 && size > 78) {
    size -= 4;
    ctx.font = `400 ${size}px Anton, Impact, Haettenschweiler, "Arial Black", sans-serif`;
  }

  const baseY = 620;
  const totalW = ctx.measureText(display).width;
  let x = (POSTCARD_WIDTH - totalW) / 2;
  let li = 0;

  for (let i = 0; i < letters.length; i++) {
    const ch = letters[i];
    if (ch === ' ') {
      x += ctx.measureText(' ').width * 0.7;
      continue;
    }
    const mid = (long - 1) / 2;
    const t = long <= 1 ? 0 : (li - mid) / Math.max(mid, 1);
    const rot = t * 12;
    const lift = -Math.abs(t) * 42 + (1 - Math.abs(t)) * 58 + t * 18;
    const cw = ctx.measureText(ch).width;

    ctx.save();
    ctx.translate(x + cw / 2, baseY + lift);
    ctx.rotate((rot * Math.PI) / 180);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `400 ${size}px Anton, Impact, Haettenschweiler, "Arial Black", sans-serif`;

    // Mustard extrusion (Seaside / LA)
    ctx.fillStyle = '#c9a028';
    ctx.fillText(ch, 14, 16);
    ctx.fillStyle = '#8a3210';
    ctx.fillText(ch, 7, 8);

    ctx.lineJoin = 'round';
    ctx.lineWidth = 16;
    ctx.strokeStyle = '#14110e';
    ctx.strokeText(ch, 0, 0);

    ctx.save();
    ctx.fillStyle = '#000';
    ctx.fillText(ch, 0, 0);
    ctx.globalCompositeOperation = 'source-in';
    const fillImg =
      letterFillImgs[li] ||
      letterFillImgs[li % Math.max(letterFillImgs.length, 1)] ||
      art;
    if (fillImg) {
      ctx.drawImage(
        fillImg,
        -cw * 0.95,
        -size * 0.78,
        cw * 1.9,
        size * 1.55,
      );
    } else {
      ctx.fillStyle = '#e8a060';
      ctx.fillRect(-cw, -size, cw * 2, size * 2);
    }
    ctx.restore();

    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(250, 240, 220, 0.9)';
    ctx.strokeText(ch, 0, 0);
    ctx.lineWidth = 7;
    ctx.strokeStyle = '#14110e';
    ctx.strokeText(ch, 0, 0);

    ctx.restore();
    x += cw * 0.92;
    li += 1;
  }

  const region = regionLabelFor(text);
  if (region) {
    ctx.save();
    ctx.translate(POSTCARD_WIDTH / 2, baseY + size * 0.75);
    ctx.rotate((-2 * Math.PI) / 180);
    ctx.textAlign = 'center';
    ctx.font = `400 46px Anton, Impact, "Arial Black", sans-serif`;
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#14110e';
    ctx.fillStyle = '#c62828';
    ctx.strokeText(region, 0, 0);
    ctx.fillText(region, 0, 0);
    ctx.restore();
  }
}

function applyVintageOverlay(
  ctx: CanvasRenderingContext2D,
  style: StyleSettings,
) {
  const { warmth, grain, vignette, vintageIntensity } = style;
  if (warmth > 0) {
    ctx.fillStyle = `rgba(210, 140, 70, ${0.14 * warmth * vintageIntensity})`;
    ctx.fillRect(0, 0, POSTCARD_WIDTH, POSTCARD_HEIGHT);
  }
  if (vignette > 0) {
    const g = ctx.createRadialGradient(
      POSTCARD_WIDTH / 2,
      POSTCARD_HEIGHT / 2,
      POSTCARD_HEIGHT * 0.2,
      POSTCARD_WIDTH / 2,
      POSTCARD_HEIGHT / 2,
      POSTCARD_HEIGHT * 0.78,
    );
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(25,15,8,${0.5 * vignette * vintageIntensity})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, POSTCARD_WIDTH, POSTCARD_HEIGHT);
  }
  // Linen crosshatch
  ctx.save();
  ctx.globalAlpha = 0.12 + grain * 0.12;
  ctx.strokeStyle = 'rgba(60,40,25,0.35)';
  ctx.lineWidth = 1;
  for (let y = 0; y < POSTCARD_HEIGHT; y += 3) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(POSTCARD_WIDTH, y);
    ctx.stroke();
  }
  for (let x = 0; x < POSTCARD_WIDTH; x += 3) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, POSTCARD_HEIGHT);
    ctx.stroke();
  }
  ctx.restore();

  if (grain > 0) {
    const img = ctx.getImageData(0, 0, POSTCARD_WIDTH, POSTCARD_HEIGHT);
    const amount = 20 * grain * vintageIntensity;
    for (let i = 0; i < img.data.length; i += 16) {
      const n = (Math.random() - 0.5) * amount;
      img.data[i] = Math.min(255, Math.max(0, img.data[i] + n));
      img.data[i + 1] = Math.min(255, Math.max(0, img.data[i + 1] + n));
      img.data[i + 2] = Math.min(255, Math.max(0, img.data[i + 2] + n));
    }
    ctx.putImageData(img, 0, 0);
  }

  // Cream postcard edge
  ctx.strokeStyle = 'rgba(245, 235, 215, 0.95)';
  ctx.lineWidth = 22;
  ctx.strokeRect(11, 11, POSTCARD_WIDTH - 22, POSTCARD_HEIGHT - 22);
  ctx.strokeStyle = 'rgba(30, 20, 12, 0.55)';
  ctx.lineWidth = 4;
  ctx.strokeRect(22, 22, POSTCARD_WIDTH - 44, POSTCARD_HEIGHT - 44);
}

export async function exportPostcardJpeg(
  project: PostcardProject,
  photos: PhotoRecord[],
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = POSTCARD_WIDTH;
  canvas.height = POSTCARD_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');

  ctx.fillStyle = paperColor(project.style.paper);
  ctx.fillRect(0, 0, POSTCARD_WIDTH, POSTCARD_HEIGHT);

  const byId = new Map(photos.map((p) => [p.id, p]));
  const sorted = [...project.cards]
    .filter((c) => c.photoId && !c.hidden)
    .sort((a, b) => a.zIndex - b.zIndex);

  const photoImgs: HTMLImageElement[] = [];
  for (const p of photos) {
    if (!p.objectUrl) continue;
    try {
      photoImgs.push(await loadImage(p.objectUrl));
    } catch {
      // skip
    }
  }

  drawBleedUnderlay(ctx, photoImgs);

  for (const card of sorted) {
    const photo = byId.get(card.photoId!);
    if (!photo?.objectUrl) continue;
    try {
      const img = await loadImage(photo.objectUrl);
      drawPhotoInCard(ctx, img, card, project.style);
      drawTape(ctx, card, project.style.tape);
    } catch {
      // skip
    }
  }

  let artImg: HTMLImageElement | null = null;
  if (project.destinationArt.url) {
    try {
      artImg = await loadImage(project.destinationArt.url);
    } catch {
      artImg = null;
    }
  }

  const letterCount = project.destination.displayName.replace(/\s/g, '').length || 6;
  const vignetteUrls = createLetterFillVignettes(
    project.destination.displayName || 'Travel',
    Math.max(letterCount, 6),
  );
  const letterFillImgs: HTMLImageElement[] = [];
  for (const url of vignetteUrls) {
    try {
      letterFillImgs.push(await loadImage(url));
    } catch {
      // skip
    }
  }

  drawLargeLetters(
    ctx,
    project.destination.displayName,
    letterFillImgs,
    artImg,
    project.style,
  );
  applyVintageOverlay(ctx, project.style);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.92),
  );
  if (!blob) throw new Error('Export failed');
  return blob;
}

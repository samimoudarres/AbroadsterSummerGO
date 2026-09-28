import { coverFit } from './cropMath';
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

function drawLargeLetters(
  ctx: CanvasRenderingContext2D,
  text: string,
  art: HTMLImageElement | null,
  photoImgs: HTMLImageElement[],
  style: StyleSettings,
) {
  const display = text.toUpperCase() || 'YOUR PLACE';
  if (style.greetingsFrom) {
    ctx.save();
    ctx.translate(POSTCARD_WIDTH / 2, 360);
    ctx.rotate((-3 * Math.PI) / 180);
    ctx.textAlign = 'center';
    ctx.font = 'italic 700 58px Georgia, "Segoe Script", cursive';
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#14110e';
    ctx.fillStyle = '#f2d24b';
    ctx.strokeText('Greetings', -40, 0);
    ctx.fillText('Greetings', -40, 0);
    ctx.font = 'italic 700 32px Georgia, serif';
    ctx.fillStyle = '#c62828';
    ctx.strokeText('from', 130, 8);
    ctx.fillText('from', 130, 8);
    ctx.restore();
  }

  const letters = display.replace(/\s+/g, ' ').split('');
  const letterOnly = letters.filter((c) => c !== ' ');
  const long = letterOnly.length;
  let size =
    long > 14 ? 128 : long > 11 ? 152 : long > 8 ? 182 : long > 5 ? 218 : 255;

  ctx.font = `900 ${size}px Impact, Haettenschweiler, "Arial Black", sans-serif`;
  while (ctx.measureText(display).width > POSTCARD_WIDTH - 24 && size > 80) {
    size -= 4;
    ctx.font = `900 ${size}px Impact, Haettenschweiler, "Arial Black", sans-serif`;
  }

  const baseY = 640;
  const totalW = ctx.measureText(display).width;
  let x = (POSTCARD_WIDTH - totalW) / 2;
  let li = 0;

  for (let i = 0; i < letters.length; i++) {
    const ch = letters[i];
    if (ch === ' ') {
      x += ctx.measureText(' ').width;
      continue;
    }
    const mid = (long - 1) / 2;
    const t = long <= 1 ? 0 : (li - mid) / Math.max(mid, 1);
    const rot = t * 14 + (li % 2 === 0 ? -1.5 : 1.2);
    const lift = -Math.abs(t) * 36 + (1 - Math.abs(t)) * 52;
    const cw = ctx.measureText(ch).width;
    const letterSize = size * (1 + ((li * 17) % 7) * 0.012 - 0.03);

    ctx.save();
    ctx.translate(x + cw / 2, baseY + lift);
    ctx.rotate((rot * Math.PI) / 180);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 ${letterSize}px Impact, Haettenschweiler, "Arial Black", sans-serif`;

    // Deep 3D extrusion (terracotta)
    ctx.fillStyle = '#b84a1c';
    ctx.fillText(ch, 12, 14);
    ctx.fillStyle = '#d4622e';
    ctx.fillText(ch, 7, 8);

    // Thick black outline
    ctx.lineJoin = 'round';
    ctx.lineWidth = 16;
    ctx.strokeStyle = '#14110e';
    ctx.strokeText(ch, 0, 0);

    // Clip fill into letter — destination art preferred
    ctx.save();
    ctx.fillStyle = '#000';
    ctx.fillText(ch, 0, 0);
    ctx.globalCompositeOperation = 'source-in';
    const usePhoto = !art || li % 3 === 2;
    const fillImg =
      (usePhoto && photoImgs.length > 0
        ? photoImgs[li % photoImgs.length]
        : null) ||
      art ||
      (photoImgs.length > 0 ? photoImgs[li % photoImgs.length] : null);
    if (fillImg) {
      const sliceW = fillImg.naturalWidth / Math.max(long, 1);
      const sx = (li % Math.max(long, 1)) * sliceW * 0.85;
      ctx.drawImage(
        fillImg,
        sx,
        fillImg.naturalHeight * 0.05,
        Math.max(sliceW, fillImg.naturalWidth * 0.35),
        fillImg.naturalHeight * 0.9,
        -cw * 0.9,
        -letterSize * 0.75,
        cw * 1.8,
        letterSize * 1.5,
      );
    } else {
      ctx.fillStyle = '#e8a060';
      ctx.fillRect(-cw, -letterSize, cw * 2, letterSize * 2);
    }
    ctx.restore();

    // Cream inner keyline + outer stroke
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(250, 240, 220, 0.9)';
    ctx.strokeText(ch, 0, 0);
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#14110e';
    ctx.strokeText(ch, 0, 0);

    ctx.restore();
    x += cw * 0.94;
    li += 1;
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

  drawLargeLetters(
    ctx,
    project.destination.displayName,
    artImg,
    photoImgs,
    project.style,
  );
  applyVintageOverlay(ctx, project.style);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.92),
  );
  if (!blob) throw new Error('Export failed');
  return blob;
}

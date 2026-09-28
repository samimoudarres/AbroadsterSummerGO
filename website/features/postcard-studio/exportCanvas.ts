import { coverFit } from './cropMath';
import type { CardState, PhotoRecord, PostcardProject, StyleSettings } from './types';
import { POSTCARD_HEIGHT, POSTCARD_WIDTH } from './types';

function paperColor(paper: StyleSettings['paper']): string {
  if (paper === 'ivory') return '#f7ecd8';
  if (paper === 'kraft') return '#d8c3a3';
  return '#f3ddc5';
}

function borderPad(border: StyleSettings['border']): {
  top: number;
  side: number;
  bottom: number;
} {
  if (border === 'thin') return { top: 10, side: 10, bottom: 10 };
  if (border === 'thick') return { top: 18, side: 18, bottom: 28 };
  return { top: 14, side: 14, bottom: 42 };
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

  // shadow
  ctx.shadowColor = 'rgba(40,30,20,0.35)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetX = 4;
  ctx.shadowOffsetY = 8;

  // frame
  ctx.fillStyle = '#faf6ef';
  ctx.fillRect(-card.w / 2, -card.h / 2, card.w, card.h);
  ctx.shadowColor = 'transparent';

  // photo clip
  ctx.save();
  ctx.beginPath();
  ctx.rect(
    -card.w / 2 + pad.side,
    -card.h / 2 + pad.top,
    innerW,
    innerH,
  );
  ctx.clip();

  const { drawW, drawH } = coverFit(img.naturalWidth, img.naturalHeight, innerW, innerH);
  const sw = drawW * card.cropScale;
  const sh = drawH * card.cropScale;
  const ox = card.cropOffsetX * innerW;
  const oy = card.cropOffsetY * innerH;
  ctx.drawImage(img, -sw / 2 + ox, -sh / 2 + oy + (pad.top - pad.bottom) / 2, sw, sh);
  ctx.restore();

  // thin inner line
  ctx.strokeStyle = 'rgba(60,50,40,0.2)';
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
    tan: 'rgba(210, 180, 140, 0.72)',
    mint: 'rgba(160, 200, 180, 0.7)',
    coral: 'rgba(230, 140, 120, 0.7)',
  };
  const color = colors[tape] || colors.tan;
  ctx.save();
  ctx.translate(card.x + card.w / 2, card.y + 8);
  ctx.rotate(((card.rotation + (card.zIndex % 2 ? 12 : -10)) * Math.PI) / 180);
  ctx.fillStyle = color;
  ctx.fillRect(-48, -10, 96, 22);
  ctx.restore();
}

function drawTitle(
  ctx: CanvasRenderingContext2D,
  text: string,
  art: HTMLImageElement | null,
  style: StyleSettings,
) {
  const display = text.toUpperCase();
  if (!display) return;

  const greetY = 480;
  if (style.greetingsFrom) {
    ctx.save();
    ctx.font = 'italic 42px Georgia, "Times New Roman", serif';
    ctx.fillStyle = 'rgba(120, 55, 45, 0.85)';
    ctx.textAlign = 'center';
    ctx.fillText('Greetings from', POSTCARD_WIDTH / 2, greetY);
    ctx.restore();
  }

  // Dynamic font size
  let size = 168;
  ctx.font = `900 ${size}px Impact, Haettenschweiler, "Arial Black", sans-serif`;
  while (ctx.measureText(display).width > POSTCARD_WIDTH - 80 && size > 64) {
    size -= 4;
    ctx.font = `900 ${size}px Impact, Haettenschweiler, "Arial Black", sans-serif`;
  }

  const y = style.greetingsFrom ? 640 : 600;
  const letters = display.split('');
  const totalW = ctx.measureText(display).width;
  let x = (POSTCARD_WIDTH - totalW) / 2;

  letters.forEach((ch, i) => {
    if (ch === ' ') {
      x += ctx.measureText(' ').width;
      return;
    }
    const metrics = ctx.measureText(ch);
    const cw = metrics.width;
    const rot = ((i % 5) - 2) * 1.2;
    const dy = ((i % 3) - 1) * 3;

    ctx.save();
    ctx.translate(x + cw / 2 + 3, y + dy + 4);
    ctx.rotate((rot * Math.PI) / 180);
    ctx.fillStyle = 'rgba(200, 80, 50, 0.55)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 ${size}px Impact, Haettenschweiler, "Arial Black", sans-serif`;
    ctx.fillText(ch, 0, 0);
    ctx.restore();

    ctx.save();
    ctx.translate(x + cw / 2, y + dy);
    ctx.rotate((rot * Math.PI) / 180);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 ${size}px Impact, Haettenschweiler, "Arial Black", sans-serif`;

    // clip art into letter via destination-out trick: fill letter then clip
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.strokeStyle = '#2a2620';
    ctx.lineWidth = 10;
    ctx.strokeText(ch, 0, 0);

    if (art) {
      ctx.save();
      ctx.beginPath();
      // approximate clip using fillText + source-in
      ctx.fillStyle = '#000';
      ctx.fillText(ch, 0, 0);
      ctx.globalCompositeOperation = 'source-in';
      const sliceX = (i / Math.max(letters.length, 1)) * art.naturalWidth;
      const sliceW = art.naturalWidth / Math.max(letters.filter((c) => c !== ' ').length, 1);
      ctx.drawImage(
        art,
        sliceX,
        0,
        sliceW,
        art.naturalHeight,
        -cw * 0.7,
        -size * 0.65,
        cw * 1.4,
        size * 1.3,
      );
      ctx.restore();
      ctx.strokeStyle = 'rgba(250, 240, 220, 0.85)';
      ctx.lineWidth = 4;
      ctx.strokeText(ch, 0, 0);
      ctx.strokeStyle = '#1e1a16';
      ctx.lineWidth = 3;
      ctx.strokeText(ch, 0, 0);
    } else {
      ctx.fillStyle = '#e8c9a0';
      ctx.fillText(ch, 0, 0);
      ctx.strokeStyle = 'rgba(250, 240, 220, 0.9)';
      ctx.lineWidth = 4;
      ctx.strokeText(ch, 0, 0);
      ctx.strokeStyle = '#1e1a16';
      ctx.lineWidth = 3;
      ctx.strokeText(ch, 0, 0);
    }
    ctx.restore();

    x += cw * (style.titleVariant === 'slant' ? 0.96 : 1);
  });
}

function applyVintageOverlay(
  ctx: CanvasRenderingContext2D,
  style: StyleSettings,
) {
  const { warmth, grain, vignette, vintageIntensity } = style;
  if (warmth > 0) {
    ctx.fillStyle = `rgba(210, 140, 70, ${0.12 * warmth * vintageIntensity})`;
    ctx.fillRect(0, 0, POSTCARD_WIDTH, POSTCARD_HEIGHT);
  }
  if (vignette > 0) {
    const g = ctx.createRadialGradient(
      POSTCARD_WIDTH / 2,
      POSTCARD_HEIGHT / 2,
      POSTCARD_HEIGHT * 0.25,
      POSTCARD_WIDTH / 2,
      POSTCARD_HEIGHT / 2,
      POSTCARD_HEIGHT * 0.75,
    );
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(30,20,10,${0.45 * vignette * vintageIntensity})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, POSTCARD_WIDTH, POSTCARD_HEIGHT);
  }
  if (grain > 0) {
    const img = ctx.getImageData(0, 0, POSTCARD_WIDTH, POSTCARD_HEIGHT);
    const amount = 18 * grain * vintageIntensity;
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (Math.random() - 0.5) * amount;
      img.data[i] = Math.min(255, Math.max(0, img.data[i] + n));
      img.data[i + 1] = Math.min(255, Math.max(0, img.data[i + 1] + n));
      img.data[i + 2] = Math.min(255, Math.max(0, img.data[i + 2] + n));
    }
    ctx.putImageData(img, 0, 0);
  }
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

  // faint aged edge
  ctx.strokeStyle = 'rgba(120, 90, 60, 0.25)';
  ctx.lineWidth = 8;
  ctx.strokeRect(12, 12, POSTCARD_WIDTH - 24, POSTCARD_HEIGHT - 24);

  let artImg: HTMLImageElement | null = null;
  if (project.destinationArt.url) {
    try {
      artImg = await loadImage(project.destinationArt.url);
    } catch {
      artImg = null;
    }
  }

  drawTitle(ctx, project.destination.displayName, artImg, project.style);

  const byId = new Map(photos.map((p) => [p.id, p]));
  const sorted = [...project.cards]
    .filter((c) => c.photoId && !c.hidden)
    .sort((a, b) => a.zIndex - b.zIndex);

  for (const card of sorted) {
    const photo = byId.get(card.photoId!);
    if (!photo?.objectUrl) continue;
    try {
      const img = await loadImage(photo.objectUrl);
      drawPhotoInCard(ctx, img, card, project.style);
      drawTape(ctx, card, project.style.tape);
    } catch {
      // skip broken
    }
  }

  applyVintageOverlay(ctx, project.style);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.92),
  );
  if (!blob) throw new Error('Export failed');
  return blob;
}

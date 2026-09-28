/** Procedural vintage destination panorama (no AI). Returns a data URL. */

const W = 1600;
const H = 640;

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createFallbackDestinationArt(
  destination: string,
): string {
  if (typeof document === 'undefined') return '';
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const rnd = mulberry32(hashSeed(destination.toLowerCase() || 'travel'));

  // Mid-century sky bands
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, `hsl(${28 + rnd() * 20}, 55%, ${78 + rnd() * 8}%)`);
  sky.addColorStop(0.45, `hsl(${195 + rnd() * 25}, 35%, ${72 + rnd() * 6}%)`);
  sky.addColorStop(1, `hsl(${160 + rnd() * 20}, 28%, ${55 + rnd() * 10}%)`);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // Sun
  ctx.beginPath();
  ctx.fillStyle = `hsla(28, 90%, ${62 + rnd() * 10}%, 0.85)`;
  ctx.arc(200 + rnd() * 1200, 80 + rnd() * 120, 50 + rnd() * 40, 0, Math.PI * 2);
  ctx.fill();

  // Hills / water
  for (let layer = 0; layer < 4; layer++) {
    ctx.beginPath();
    const baseY = 280 + layer * 70;
    ctx.moveTo(0, H);
    ctx.lineTo(0, baseY);
    for (let x = 0; x <= W; x += 40) {
      const y =
        baseY +
        Math.sin(x * 0.008 + layer + rnd()) * (30 + layer * 8) +
        rnd() * 12;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    const hue = 25 + layer * 18 + rnd() * 15;
    ctx.fillStyle = `hsla(${hue}, ${40 - layer * 5}%, ${45 + layer * 6}%, 0.92)`;
    ctx.fill();
  }

  // Simple building silhouettes left-to-right
  const buildingCount = 5 + Math.floor(rnd() * 4);
  for (let i = 0; i < buildingCount; i++) {
    const bw = 60 + rnd() * 90;
    const bh = 80 + rnd() * 160;
    const bx = 80 + i * ((W - 160) / buildingCount) + rnd() * 30;
    const by = H - 120 - bh;
    ctx.fillStyle = `hsla(${15 + rnd() * 30}, 35%, ${35 + rnd() * 20}%, 0.9)`;
    ctx.fillRect(bx, by, bw, bh);
    // windows
    ctx.fillStyle = 'rgba(243, 221, 197, 0.55)';
    for (let wy = by + 16; wy < by + bh - 20; wy += 22) {
      for (let wx = bx + 10; wx < bx + bw - 12; wx += 18) {
        if (rnd() > 0.35) ctx.fillRect(wx, wy, 8, 12);
      }
    }
  }

  // Palm / plant marks
  ctx.strokeStyle = `hsla(140, 40%, 28%, 0.75)`;
  ctx.lineWidth = 3;
  for (let i = 0; i < 6; i++) {
    const px = 100 + rnd() * (W - 200);
    const py = H - 80 - rnd() * 40;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.quadraticCurveTo(px - 20, py - 60, px + 10, py - 100);
    ctx.stroke();
  }

  // Paper grain
  const img = ctx.getImageData(0, 0, W, H);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rnd() - 0.5) * 18;
    img.data[i] = Math.min(255, Math.max(0, img.data[i] + n));
    img.data[i + 1] = Math.min(255, Math.max(0, img.data[i + 1] + n));
    img.data[i + 2] = Math.min(255, Math.max(0, img.data[i + 2] + n));
  }
  ctx.putImageData(img, 0, 0);

  // Soft vignette
  const vig = ctx.createRadialGradient(
    W / 2,
    H / 2,
    H * 0.2,
    W / 2,
    H / 2,
    H * 0.75,
  );
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(40,30,20,0.28)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);

  return canvas.toDataURL('image/jpeg', 0.9);
}

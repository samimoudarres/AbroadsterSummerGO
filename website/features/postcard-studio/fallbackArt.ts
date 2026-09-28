/**
 * Mid-century large-letter destination panorama for clipping inside block letters.
 * Bright, poster-like, wordless. Used when Recraft is off.
 */
export function createFallbackDestinationArt(destination: string): string {
  if (typeof document === 'undefined') return '';
  const W = 1800;
  const H = 720;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  let h = 2166136261;
  for (let i = 0; i < destination.length; i++) {
    h ^= destination.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const rnd = (() => {
    let a = h >>> 0;
    return () => {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  })();

  // Teal sky band (classic linen postcard)
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#5db0c8');
  sky.addColorStop(0.35, '#8ec9d8');
  sky.addColorStop(0.55, '#f0c96a');
  sky.addColorStop(1, '#d4a056');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // Sun disc
  ctx.beginPath();
  ctx.fillStyle = '#f5d76e';
  ctx.arc(220 + rnd() * 200, 110, 70, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#c47a2a';
  ctx.lineWidth = 4;
  ctx.stroke();

  // Water / cove bands
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    const y0 = 300 + i * 55;
    ctx.moveTo(0, H);
    ctx.lineTo(0, y0);
    for (let x = 0; x <= W; x += 30) {
      ctx.lineTo(x, y0 + Math.sin(x * 0.01 + i) * 22 + rnd() * 8);
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fillStyle =
      i % 2 === 0
        ? `rgba(40, 140, 160, ${0.55 + i * 0.05})`
        : `rgba(30, 110, 130, ${0.5 + i * 0.04})`;
    ctx.fill();
  }

  // Whitewashed buildings / towers left→right (readable at letter scale)
  const motifs = 6;
  for (let i = 0; i < motifs; i++) {
    const bx = 60 + i * (W / motifs);
    const bw = 90 + rnd() * 70;
    const bh = 120 + rnd() * 180;
    const by = H - 160 - bh;
    ctx.fillStyle = i % 2 ? '#f4ebe0' : '#e8d5b8';
    ctx.strokeStyle = '#2a2620';
    ctx.lineWidth = 3;
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeRect(bx, by, bw, bh);
    // dome / arch
    if (rnd() > 0.4) {
      ctx.beginPath();
      ctx.arc(bx + bw / 2, by, bw * 0.35, Math.PI, 0);
      ctx.fillStyle = '#d96b4c';
      ctx.fill();
      ctx.stroke();
    }
    // windows
    ctx.fillStyle = '#3b6e8a';
    for (let wy = by + 24; wy < by + bh - 30; wy += 28) {
      for (let wx = bx + 14; wx < bx + bw - 18; wx += 22) {
        ctx.fillRect(wx, wy, 10, 14);
      }
    }
  }

  // Cypress / palms
  ctx.strokeStyle = '#2f5c3a';
  ctx.fillStyle = '#3f7a4a';
  ctx.lineWidth = 5;
  for (let i = 0; i < 8; i++) {
    const px = 80 + rnd() * (W - 160);
    const py = H - 90;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.quadraticCurveTo(px - 30, py - 90, px + 8, py - 160);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(px + 4, py - 150, 28, 50, -0.2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Screen-print style color offset (misregistration)
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = 'rgba(200, 80, 50, 0.08)';
  ctx.fillRect(4, 0, W, H);
  ctx.globalCompositeOperation = 'source-over';

  // Linen grain
  const img = ctx.getImageData(0, 0, W, H);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rnd() - 0.5) * 22;
    img.data[i] = Math.min(255, Math.max(0, img.data[i] + n));
    img.data[i + 1] = Math.min(255, Math.max(0, img.data[i + 1] + n));
    img.data[i + 2] = Math.min(255, Math.max(0, img.data[i + 2] + n));
  }
  ctx.putImageData(img, 0, 0);

  return canvas.toDataURL('image/jpeg', 0.92);
}

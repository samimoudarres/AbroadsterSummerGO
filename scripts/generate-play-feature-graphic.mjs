/**
 * Generates Google Play feature graphic 1024x500 from the app icon.
 * Output: store/play/feature-graphic.png
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'store', 'play');
fs.mkdirSync(outDir, { recursive: true });

const iconPath = path.join(root, 'assets', 'app-icon-1024.png');
const outPath = path.join(outDir, 'feature-graphic.png');

const W = 1024;
const H = 500;
const iconSize = 220;

const icon = await sharp(iconPath)
  .resize(iconSize, iconSize, {
    fit: 'contain',
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  })
  .png()
  .toBuffer();

const svg = Buffer.from(`
  <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#175864"/>
        <stop offset="100%" stop-color="#0F3D47"/>
      </linearGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#g)"/>
    <text x="520" y="230" font-family="Arial, Helvetica, sans-serif" font-size="64" font-weight="700" fill="#FFFFFF">Abroadster</text>
    <text x="520" y="290" font-family="Arial, Helvetica, sans-serif" font-size="28" fill="#C9E8EE">Study abroad, together</text>
  </svg>
`);

await sharp(svg)
  .composite([
    { input: icon, left: 120, top: Math.round((H - iconSize) / 2) },
  ])
  .png()
  .toFile(outPath);

console.log('Wrote', outPath);

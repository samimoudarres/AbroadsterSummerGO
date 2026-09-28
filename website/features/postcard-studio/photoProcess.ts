import { MAX_PHOTOS, MIN_PHOTOS } from './types';

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_EDGE = 1600;
const MIN_EDGE = 200;

export type PhotoProcessResult =
  | {
      ok: true;
      blob: Blob;
      width: number;
      height: number;
      name: string;
    }
  | { ok: false; error: string };

function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not decode image'));
    };
    img.src = url;
  });
}

export async function processPhotoFile(file: File): Promise<PhotoProcessResult> {
  const name = file.name || 'photo';
  const type = (file.type || '').toLowerCase();

  if (/heic|heif/.test(type) || /\.heic$|\.heif$/i.test(name)) {
    return {
      ok: false,
      error: `${name}: HEIC isn’t supported here. Convert to JPEG or PNG first.`,
    };
  }

  if (file.size > MAX_FILE_BYTES) {
    return {
      ok: false,
      error: `${name}: file is too large (max 25 MB).`,
    };
  }

  if (type && !/^image\/(jpeg|jpg|png|webp|gif)$/.test(type)) {
    return {
      ok: false,
      error: `${name}: use JPEG, PNG, or WebP.`,
    };
  }

  try {
    const img = await loadImageFromBlob(file);
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) {
      return { ok: false, error: `${name}: couldn’t read image size.` };
    }
    if (Math.min(w, h) < MIN_EDGE) {
      return {
        ok: false,
        error: `${name}: image is too small (need at least ${MIN_EDGE}px).`,
      };
    }

    const maxSide = Math.max(w, h);
    const scale = maxSide > MAX_EDGE ? MAX_EDGE / maxSide : 1;
    const tw = Math.round(w * scale);
    const th = Math.round(h * scale);
    const canvas = document.createElement('canvas');
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext('2d');
    if (!ctx) return { ok: false, error: `${name}: canvas unavailable.` };
    ctx.drawImage(img, 0, 0, tw, th);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.88),
    );
    if (!blob) return { ok: false, error: `${name}: could not process image.` };

    return { ok: true, blob, width: tw, height: th, name };
  } catch {
    return {
      ok: false,
      error: `${name}: couldn’t decode that file. Try another photo.`,
    };
  }
}

export function photoCountMessage(count: number): string | null {
  if (count < MIN_PHOTOS) {
    return `Add at least ${MIN_PHOTOS} photos (${count} selected).`;
  }
  if (count > MAX_PHOTOS) {
    return `You can use up to ${MAX_PHOTOS} photos.`;
  }
  return null;
}

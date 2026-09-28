'use client';

import type { CSSProperties } from 'react';
import type { PhotoRecord, TitleVariant } from './types';
import { POSTCARD_WIDTH } from './types';
import styles from './postcard-studio.module.css';

type Props = {
  text: string;
  artUrl: string | null;
  /** Cycle trip photos as secondary letter fills when art is thin */
  photos: PhotoRecord[];
  greetingsFrom: boolean;
  titleVariant: TitleVariant;
};

/**
 * Mid-century "large letter" title: arched, chunky 3D, each glyph filled
 * with destination art (and trip photos as alternate slices) — never AI-spelled.
 */
export function LargeLetterTitle({
  text,
  artUrl,
  photos,
  greetingsFrom,
  titleVariant,
}: Props) {
  const display = (text || 'YOUR PLACE').toUpperCase();
  const chars = display.split('');
  const letterCount = chars.filter((c) => c !== ' ').length;
  const long = display.replace(/\s/g, '').length;

  // Dominate the 9:16 canvas — classic large-letter scale
  const fontSize =
    long > 14 ? 132 : long > 11 ? 158 : long > 8 ? 188 : long > 5 ? 228 : 268;

  let letterIndex = 0;

  return (
    <div className={styles.titleLayer} aria-label={display}>
      {greetingsFrom ? (
        <div className={styles.greetingsVintage}>
          <span className={styles.greetingsWord}>Greetings</span>
          <span className={styles.greetingsFromWord}>from</span>
        </div>
      ) : null}

      <div
        className={`${styles.bigWordArc} ${
          titleVariant === 'stack'
            ? styles.bigWordStack
            : titleVariant === 'slant'
              ? styles.bigWordSlant
              : ''
        }`}
        style={
          {
            '--letter-size': `${fontSize}px`,
          } as CSSProperties
        }
      >
        {chars.map((ch, i) => {
          if (ch === ' ') {
            return <span key={`sp-${i}`} className={styles.letterSpace} />;
          }
          const idx = letterIndex++;
          const mid = (letterCount - 1) / 2;
          const t = letterCount <= 1 ? 0 : (idx - mid) / Math.max(mid, 1);
          // Stronger arc + diagonal path (hand-set large-letter feel)
          const slantExtra = titleVariant === 'slant' ? t * 6 : 0;
          const rot = t * 14 + slantExtra + (idx % 2 === 0 ? -1.5 : 1.2);
          const lift = -Math.abs(t) * 36 + (1 - Math.abs(t)) * 52;
          const scaleJitter = 1 + ((idx * 17) % 7) * 0.012 - 0.03;

          // Destination art first (landmark fills); trip photos as alternates
          const photo = photos.length ? photos[idx % photos.length] : null;
          const usePhotoSlice = !artUrl || idx % 3 === 2;
          const fillUrl =
            (usePhotoSlice ? photo?.objectUrl : null) ||
            artUrl ||
            photo?.objectUrl ||
            undefined;
          const bgPos = `${(idx / Math.max(letterCount - 1, 1)) * 100}% ${
            30 + (idx % 3) * 18
          }%`;

          return (
            <span
              key={`${ch}-${i}`}
              className={styles.blockLetter}
              style={
                {
                  transform: `translateY(${lift}px) rotate(${rot}deg) scale(${scaleJitter})`,
                  '--fill-image': fillUrl ? `url(${fillUrl})` : 'none',
                  '--fill-pos': bgPos,
                  zIndex: 10 + idx,
                } as CSSProperties
              }
              data-letter={ch}
            >
              <span className={styles.blockLetterDepth} aria-hidden>
                {ch}
              </span>
              <span className={styles.blockLetterFace}>{ch}</span>
              <span className={styles.blockLetterStroke} aria-hidden>
                {ch}
              </span>
            </span>
          );
        })}
      </div>

      <div className={styles.titleWidthGuard} style={{ width: POSTCARD_WIDTH }} />
    </div>
  );
}

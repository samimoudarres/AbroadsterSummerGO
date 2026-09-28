'use client';

import type { CSSProperties } from 'react';
import type { TitleVariant } from './types';
import { POSTCARD_WIDTH } from './types';
import { regionLabelFor } from './destinationPresets';
import styles from './postcard-studio.module.css';

type Props = {
  text: string;
  /** Per-letter landmark vignettes (preset / generated) */
  letterFills: string[];
  /** Wide art fallback if a letter lacks a vignette */
  artUrl: string | null;
  greetingsFrom: boolean;
  titleVariant: TitleVariant;
};

/**
 * Mid-century large-letter title: arched block glyphs, mustard 3D extrusion,
 * cursive “Greetings”, region label — landmark fills, never AI-spelled text.
 */
export function LargeLetterTitle({
  text,
  letterFills,
  artUrl,
  greetingsFrom,
  titleVariant,
}: Props) {
  const display = (text || 'YOUR PLACE').toUpperCase();
  const chars = display.split('');
  const letterCount = chars.filter((c) => c !== ' ').length;
  const long = display.replace(/\s/g, '').length;
  const region = regionLabelFor(text);

  const fontSize =
    long > 14 ? 118 : long > 11 ? 142 : long > 8 ? 172 : long > 5 ? 210 : 248;

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
          // Seaside / LA path: rising diagonal arc
          const slantExtra = titleVariant === 'slant' ? t * 5 : 0;
          const rot = t * 12 + slantExtra;
          const lift = -Math.abs(t) * 42 + (1 - Math.abs(t)) * 58 + t * 18;

          const fillUrl =
            letterFills[idx] ||
            letterFills[idx % Math.max(letterFills.length, 1)] ||
            artUrl ||
            undefined;

          return (
            <span
              key={`${ch}-${i}`}
              className={styles.blockLetter}
              style={
                {
                  transform: `translateY(${lift}px) rotate(${rot}deg)`,
                  '--fill-image': fillUrl ? `url(${fillUrl})` : 'none',
                  '--fill-pos': '50% 45%',
                  zIndex: 10 + idx,
                } as CSSProperties
              }
              data-letter={ch}
            >
              <span className={styles.blockLetterExtrude} aria-hidden>
                {ch}
              </span>
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

      {region ? <div className={styles.regionLabel}>{region}</div> : null}

      <div className={styles.titleWidthGuard} style={{ width: POSTCARD_WIDTH }} />
    </div>
  );
}

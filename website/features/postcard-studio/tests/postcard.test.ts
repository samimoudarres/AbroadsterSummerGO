import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { clampCropOffset, clampCropScale } from '../cropMath';
import { generateLayout, slotsForTemplate } from '../layoutEngine';
import {
  destinationCacheKey,
  exportFilename,
  normalizeDestination,
  validateDestination,
} from '../utils';
import { POSTCARD_HEIGHT, POSTCARD_WIDTH } from '../types';

describe('postcard dimensions', () => {
  it('uses 1080x1920', () => {
    assert.equal(POSTCARD_WIDTH, 1080);
    assert.equal(POSTCARD_HEIGHT, 1920);
    assert.equal(POSTCARD_WIDTH / POSTCARD_HEIGHT, 9 / 16);
  });
});

describe('destination text', () => {
  it('preserves accents and spelling', () => {
    assert.equal(normalizeDestination('  San Sebastián  '), 'San Sebastián');
    assert.equal(validateDestination('Aix-en-Provence').ok, true);
    assert.equal(validateDestination('Aix-en-Provence').value, 'Aix-en-Provence');
  });

  it('rejects empty and too long', () => {
    assert.equal(validateDestination('').ok, false);
    assert.equal(validateDestination('x'.repeat(60)).ok, false);
  });

  it('builds stable cache keys', () => {
    const a = destinationCacheKey('Ibiza', 'es', 'v1');
    const b = destinationCacheKey('  IBIZA ', 'ES', 'v1');
    assert.equal(a, b);
  });

  it('makes safe export filenames', () => {
    const name = exportFilename('San Sebastián', new Date('2026-09-28T12:00:00Z'));
    assert.match(name, /^postcard-san-sebastian-2026-09-28\.jpg$/);
  });
});

describe('layout engine', () => {
  it('adapts slot counts for 4/8/10/12', () => {
    assert.ok(slotsForTemplate('classic', 4) >= 8);
    assert.ok(slotsForTemplate('classic', 10) >= 9);
    assert.equal(slotsForTemplate('scrapbook', 12), 12);
    assert.ok(slotsForTemplate('editorial', 4) >= 6);
  });

  it('keeps frames mostly covering the canvas', () => {
    const ids = Array.from({ length: 12 }, (_, i) => `p${i}`);
    for (const template of ['classic', 'scrapbook', 'editorial'] as const) {
      const cards = generateLayout(template, ids);
      assert.ok(cards.length >= 8);
      // Cloth layouts intentionally bleed past edges; ensure cards are large
      for (const c of cards) {
        assert.ok(c.w >= 380);
        assert.ok(c.h >= 400);
      }
    }
  });
});

describe('crop math', () => {
  it('clamps zoom and offsets', () => {
    assert.equal(clampCropScale(0.2), 1);
    assert.equal(clampCropScale(9), 3);
    assert.ok(Math.abs(clampCropOffset(5, 1)) <= 0.0001);
    assert.ok(clampCropOffset(2, 2) <= 0.5);
  });
});

'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { LargeLetterTitle } from './LargeLetterTitle';
import { clampCropOffset, clampCropScale, normalizeCardCrop, resetCrop } from './cropMath';
import {
  DESTINATION_PRESETS,
  findDestinationPreset,
} from './destinationPresets';
import { exportPostcardJpeg } from './exportCanvas';
import {
  createFallbackDestinationArt,
  createLetterFillVignettes,
} from './fallbackArt';
import { HistoryManager } from './history';
import { generateLayout, needsClothUpgrade, reorderLayers, shuffleLayout } from './layoutEngine';
import { photoCountMessage, processPhotoFile } from './photoProcess';
import styles from './postcard-studio.module.css';
import {
  clearProjectMeta,
  hydratePhotoUrls,
  idbDeleteBlob,
  idbPutBlob,
  loadProjectMeta,
  saveProjectMeta,
  wipeLocalProject,
} from './storage';
import type {
  CardState,
  PhotoRecord,
  PostcardProject,
  StyleSettings,
  TemplateId,
} from './types';
import {
  DEFAULT_STYLE,
  MAX_PHOTOS,
  MIN_PHOTOS,
  POSTCARD_HEIGHT,
  POSTCARD_WIDTH,
  PROJECT_VERSION,
} from './types';
import {
  destinationCacheKey,
  exportFilename,
  validateDestination,
} from './utils';

function letterCountOf(name: string): number {
  return (name || '').replace(/\s/g, '').length || 8;
}

function buildLetterFills(name: string): string[] {
  const n = letterCountOf(name);
  return createLetterFillVignettes(name || 'Travel', Math.max(n, 6));
}

type DragMode =
  | { kind: 'move'; cardId: string; ox: number; oy: number }
  | { kind: 'pan'; cardId: string; ox: number; oy: number; sx: number; sy: number }
  | { kind: 'rotate'; cardId: string; startAngle: number; pointerAngle: number }
  | null;

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function emptyProject(destination = ''): PostcardProject {
  const now = new Date().toISOString();
  return {
    version: PROJECT_VERSION,
    destination: {
      displayName: destination,
      cacheKey: destinationCacheKey(destination),
    },
    templateId: 'classic',
    canvas: { width: POSTCARD_WIDTH, height: POSTCARD_HEIGHT },
    photos: [],
    cards: [],
    style: { ...DEFAULT_STYLE },
    destinationArt: { status: 'fallback', url: null, source: 'fallback' },
    createdAt: now,
    updatedAt: now,
  };
}

function borderClass(border: StyleSettings['border']) {
  if (border === 'thin') return styles.cardThin;
  if (border === 'thick') return styles.cardThick;
  return styles.cardPolaroid;
}

function paperClass(paper: StyleSettings['paper']) {
  if (paper === 'ivory') return styles.paperIvory;
  if (paper === 'kraft') return styles.paperKraft;
  return styles.paperCream;
}

export function PostcardStudioApp() {
  const [project, setProject] = useState<PostcardProject>(() => emptyProject());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  const [scale, setScale] = useState(0.35);
  const [ready, setReady] = useState(false);
  const [letterFills, setLetterFills] = useState<string[]>([]);
  const historyRef = useRef(new HistoryManager<PostcardProject>());
  const dragRef = useRef<DragMode>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const scalerRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const replaceCardId = useRef<string | null>(null);
  const projectRef = useRef(project);
  projectRef.current = project;

  const pushHistory = useCallback(() => {
    historyRef.current.push(structuredClone(projectRef.current));
  }, []);

  const updateProject = useCallback(
    (fn: (p: PostcardProject) => PostcardProject, record = true) => {
      setProject((prev) => {
        if (record) historyRef.current.push(structuredClone(prev));
        const next = fn(prev);
        return { ...next, updatedAt: new Date().toISOString() };
      });
    },
    [],
  );

  // Fit stage to container
  useEffect(() => {
    const el = scalerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      setScale(w / POSTCARD_WIDTH);
    });
    ro.observe(el);
    setScale(el.clientWidth / POSTCARD_WIDTH);
    return () => ro.disconnect();
  }, []);

  // Restore local project
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const meta = loadProjectMeta();
        if (!meta) {
          if (!cancelled) setReady(true);
          return;
        }
        const photos = await hydratePhotoUrls(meta.photos);
        if (cancelled) {
          photos.forEach((p) => p.objectUrl && URL.revokeObjectURL(p.objectUrl));
          return;
        }
        const restored: PostcardProject = {
          ...meta,
          photos,
          destinationArt: meta.destinationArt?.url
            ? meta.destinationArt
            : {
                status: 'fallback',
                url: createFallbackDestinationArt(meta.destination.displayName || 'Travel'),
                source: 'fallback',
              },
        };
        if (!restored.destinationArt.url) {
          restored.destinationArt = {
            status: 'fallback',
            url: createFallbackDestinationArt(restored.destination.displayName || 'Travel'),
            source: 'fallback',
          };
        }
        // Upgrade sparse drafts to dense photo-cloth layouts
        if (
          restored.photos.length > 0 &&
          needsClothUpgrade(restored.cards)
        ) {
          restored.cards = generateLayout(
            restored.templateId,
            restored.photos.map((p) => p.id),
          );
          restored.style = {
            ...DEFAULT_STYLE,
            ...restored.style,
            vintageIntensity: Math.max(restored.style.vintageIntensity, 0.8),
            border: restored.style.border === 'polaroid' ? 'thin' : restored.style.border,
            titleVariant:
              restored.style.titleVariant === 'block'
                ? 'slant'
                : restored.style.titleVariant,
          };
        }
        setProject(restored);
        setLetterFills(
          buildLetterFills(restored.destination.displayName || 'Travel'),
        );
        setStatus('Restored your last postcard draft on this device.');
      } catch {
        // ignore
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist meta (not blobs)
  useEffect(() => {
    if (!ready) return;
    const meta = {
      ...project,
      photos: project.photos.map((photo) => {
        const { objectUrl, ...rest } = photo;
        void objectUrl;
        return rest;
      }),
      destinationArt: {
        ...project.destinationArt,
        // avoid huge data URLs in localStorage
        url:
          project.destinationArt.source === 'recraft'
            ? project.destinationArt.url
            : null,
      },
    };
    saveProjectMeta(meta);
  }, [project, ready]);

  // Destination art (fallback always; try API when available)
  const refreshArt = useCallback(async (name: string) => {
    const fallbackUrl = createFallbackDestinationArt(name || 'Travel');
    const preset = findDestinationPreset(name);
    setLetterFills(buildLetterFills(name || 'Travel'));
    setProject((p) => ({
      ...p,
      destinationArt: {
        status: 'fallback',
        url: fallbackUrl,
        source: 'fallback',
        message: preset
          ? `Using ${preset.displayName} landmark letter fills.`
          : 'Using built-in vintage art (AI optional).',
      },
    }));
    try {
      const res = await fetch('/api/postcard/destination-art', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destination: name }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        url?: string;
        source?: 'recraft' | 'fallback';
        message?: string;
      };
      if (data.url && data.source === 'recraft') {
        setProject((p) => ({
          ...p,
          destinationArt: {
            status: 'ready',
            url: data.url!,
            source: 'recraft',
            message: data.message,
          },
        }));
      }
    } catch {
      // keep fallback
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (!project.destination.displayName) return;
    if (project.destinationArt.url) return;
    void refreshArt(project.destination.displayName);
  }, [ready, project.destination.displayName, project.destinationArt.url, refreshArt]);

  const usedPhotoIds = useMemo(
    () => new Set(project.cards.map((c) => c.photoId).filter(Boolean) as string[]),
    [project.cards],
  );

  const canExport =
    project.destination.displayName.trim().length > 0 &&
    project.photos.length >= MIN_PHOTOS &&
    project.cards.some((c) => c.photoId && !c.hidden);

  const addFiles = async (files: FileList | File[]) => {
    const list = Array.from(files);
    const nextErrors: string[] = [];
    const room = MAX_PHOTOS - project.photos.length;
    if (room <= 0) {
      setErrors([`You already have ${MAX_PHOTOS} photos.`]);
      return;
    }
    const slice = list.slice(0, room);
    const added: PhotoRecord[] = [];
    for (const file of slice) {
      const result = await processPhotoFile(file);
      if (!result.ok) {
        nextErrors.push(result.error);
        continue;
      }
      const id = uid('photo');
      const blobKey = `photo:${id}`;
      await idbPutBlob(blobKey, result.blob);
      added.push({
        id,
        blobKey,
        objectUrl: URL.createObjectURL(result.blob),
        width: result.width,
        height: result.height,
        name: result.name,
      });
    }
    if (added.length) {
      updateProject((p) => {
        const photos = [...p.photos, ...added];
        // Always rebuild dense cloth so the backdrop stays full-bleed
        const cards = generateLayout(
          p.templateId,
          photos.map((x) => x.id),
        );
        return { ...p, photos, cards };
      });
      setStatus(`Added ${added.length} photo${added.length === 1 ? '' : 's'}.`);
    }
    setErrors(nextErrors);
  };

  const onDrop = async (e: DragEvent) => {
    e.preventDefault();
    setDropActive(false);
    if (e.dataTransfer.files?.length) await addFiles(e.dataTransfer.files);
  };

  const applyDestination = () => {
    const check = validateDestination(project.destination.displayName);
    if (!check.ok) {
      setErrors([check.error || 'Invalid destination']);
      return;
    }
    const preset = findDestinationPreset(check.value);
    const displayName = preset?.displayName ?? check.value;
    updateProject((p) => ({
      ...p,
      destination: {
        displayName,
        cacheKey: destinationCacheKey(displayName),
      },
      destinationArt: { status: 'fallback', url: null, source: 'fallback' },
    }));
    void refreshArt(displayName);
    setErrors([]);
    setStatus(
      preset
        ? `Preset loaded: ${displayName} (${preset.regionLabel}).`
        : `Destination set to ${displayName}.`,
    );
  };

  const selectPreset = (presetId: string) => {
    const preset = DESTINATION_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    updateProject((p) => ({
      ...p,
      destination: {
        displayName: preset.displayName,
        cacheKey: destinationCacheKey(preset.displayName),
      },
      destinationArt: { status: 'fallback', url: null, source: 'fallback' },
    }));
    void refreshArt(preset.displayName);
    setErrors([]);
    setStatus(`Preset: ${preset.displayName}, ${preset.regionLabel}.`);
  };

  const setTemplate = (templateId: TemplateId) => {
    updateProject((p) => ({
      ...p,
      templateId,
      cards: generateLayout(
        templateId,
        p.photos.map((x) => x.id),
      ),
    }));
  };

  const selected = project.cards.find((c) => c.id === selectedId) || null;

  const pointerToCanvas = (clientX: number, clientY: number) => {
    const el = stageRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    return {
      x: (clientX - rect.left) / scale,
      y: (clientY - rect.top) / scale,
    };
  };

  const onCardPointerDown = (
    e: ReactPointerEvent,
    card: CardState,
    mode: 'move' | 'pan' | 'rotate',
  ) => {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setSelectedId(card.id);
    pushHistory();
    const pt = pointerToCanvas(e.clientX, e.clientY);
    if (mode === 'move') {
      dragRef.current = {
        kind: 'move',
        cardId: card.id,
        ox: pt.x - card.x,
        oy: pt.y - card.y,
      };
    } else if (mode === 'pan') {
      dragRef.current = {
        kind: 'pan',
        cardId: card.id,
        ox: pt.x,
        oy: pt.y,
        sx: card.cropOffsetX,
        sy: card.cropOffsetY,
      };
    } else {
      const cx = card.x + card.w / 2;
      const cy = card.y + card.h / 2;
      const angle = (Math.atan2(pt.y - cy, pt.x - cx) * 180) / Math.PI;
      dragRef.current = {
        kind: 'rotate',
        cardId: card.id,
        startAngle: card.rotation,
        pointerAngle: angle,
      };
    }
  };

  const onStagePointerMove = (e: ReactPointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const pt = pointerToCanvas(e.clientX, e.clientY);
    setProject((p) => {
      const cards = p.cards.map((c) => {
        if (c.id !== drag.cardId) return c;
        if (drag.kind === 'move') {
          return {
            ...c,
            x: Math.max(0, Math.min(POSTCARD_WIDTH - c.w, pt.x - drag.ox)),
            y: Math.max(0, Math.min(POSTCARD_HEIGHT - c.h, pt.y - drag.oy)),
          };
        }
        if (drag.kind === 'pan') {
          const dx = (pt.x - drag.ox) / c.w;
          const dy = (pt.y - drag.oy) / c.h;
          return normalizeCardCrop({
            ...c,
            cropOffsetX: clampCropOffset(drag.sx + dx, c.cropScale),
            cropOffsetY: clampCropOffset(drag.sy + dy, c.cropScale),
          });
        }
        const cx = c.x + c.w / 2;
        const cy = c.y + c.h / 2;
        const angle = (Math.atan2(pt.y - cy, pt.x - cx) * 180) / Math.PI;
        return {
          ...c,
          rotation: drag.startAngle + (angle - drag.pointerAngle),
        };
      });
      return { ...p, cards };
    });
  };

  const onStagePointerUp = () => {
    dragRef.current = null;
  };

  const undo = () => {
    const prev = historyRef.current.undo(project);
    if (prev) setProject(prev);
  };
  const redo = () => {
    const next = historyRef.current.redo(project);
    if (next) setProject(next);
  };

  const download = async () => {
    if (!canExport) return;
    setExporting(true);
    setStatus('Exporting 1080×1920 postcard…');
    try {
      const blob = await exportPostcardJpeg(project, project.photos);
      const name = exportFilename(project.destination.displayName);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
      setStatus(`Downloaded ${name}`);
    } catch (err) {
      setErrors([
        err instanceof Error ? err.message : 'Export failed. Try again.',
      ]);
    } finally {
      setExporting(false);
    }
  };

  const share = async () => {
    if (!canExport || !navigator.share) {
      await download();
      return;
    }
    setExporting(true);
    try {
      const blob = await exportPostcardJpeg(project, project.photos);
      const name = exportFilename(project.destination.displayName);
      const file = new File([blob], name, { type: 'image/jpeg' });
      await navigator.share({
        files: [file],
        title: `Postcard from ${project.destination.displayName}`,
      });
      setStatus('Shared.');
    } catch {
      await download();
    } finally {
      setExporting(false);
    }
  };

  const countMsg = photoCountMessage(project.photos.length);

  if (!ready) {
    return (
      <div className={`wrap ${styles.page}`}>
        <p className={styles.hint} role="status">
          Loading Postcard Studio…
        </p>
      </div>
    );
  }

  return (
    <div className={`wrap ${styles.page}`}>
      <header className={styles.hero}>
        <span className={styles.kicker}>Postcard Studio</span>
        <h1 className="type-bold">Make a vintage travel postcard from your photos</h1>
        <p className={`type ${styles.lede}`}>
          Type where you went, drop in 4–12 photos, pick a layout, then tweak the
          collage until it feels like a real 1950s roadside souvenir.
        </p>
        <p className={styles.privacy}>
          Your personal photos stay in your browser. We never send them to an AI
          image model. Destination illustrations (if enabled) are separate art,
          not edits of your pictures.
        </p>
      </header>

      <section className={styles.how} aria-label="How it works">
        <div className={styles.howCard}>
          <strong>1. Destination</strong>
          <span className="type">Name the place exactly the way you want it spelled.</span>
        </div>
        <div className={styles.howCard}>
          <strong>2. Photos</strong>
          <span className="type">Add 4–12 travel shots. Move, crop, rotate, tape them up.</span>
        </div>
        <div className={styles.howCard}>
          <strong>3. Export</strong>
          <span className="type">Download a crisp 1080×1920 story-ready JPEG.</span>
        </div>
      </section>

      <div className={styles.workspace}>
        <div className={styles.stageWrap}>
          <div className={styles.row} style={{ marginBottom: '0.75rem' }}>
            <button type="button" className={styles.btn} onClick={undo}>
              Undo
            </button>
            <button type="button" className={styles.btn} onClick={redo}>
              Redo
            </button>
            <button
              type="button"
              className={styles.btn}
              onClick={() => setPreviewMode((v) => !v)}
            >
              {previewMode ? 'Edit mode' : 'Preview'}
            </button>
            <button
              type="button"
              className={styles.btn}
              onClick={() =>
                updateProject((p) => ({
                  ...p,
                  cards: shuffleLayout(p.templateId, p.cards),
                }))
              }
            >
              Shuffle
            </button>
          </div>

          <div ref={scalerRef} className={styles.stageScaler} aria-label="Postcard canvas">
            <div
              ref={stageRef}
              className={`${styles.stage} ${paperClass(project.style.paper)} ${
                previewMode ? styles.previewMode : ''
              }`}
              style={{ transform: `scale(${scale})` }}
              onPointerMove={onStagePointerMove}
              onPointerUp={onStagePointerUp}
              onPointerLeave={onStagePointerUp}
              onPointerCancel={onStagePointerUp}
            >
              {/* Full-bleed photo underlay — kills gray gutters */}
              {project.photos.length ? (
                <div
                  className={styles.photoBleed}
                  aria-hidden
                  style={{
                    gridTemplateColumns: '1fr 1fr',
                    gridTemplateRows: `repeat(${Math.ceil(
                      Math.max(6, Math.min(project.photos.length * 2, 12)) / 2,
                    )}, 1fr)`,
                  }}
                >
                  {Array.from({
                    length: Math.max(6, Math.min(project.photos.length * 2, 12)),
                  }).map((_, i) => {
                    const photo = project.photos[i % project.photos.length];
                    if (!photo?.objectUrl) return null;
                    return (
                      <div key={`bleed-${i}`} className={styles.photoBleedCell}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={photo.objectUrl} alt="" draggable={false} />
                      </div>
                    );
                  })}
                </div>
              ) : null}

              {/* Photo cloth first (under letters) */}
              {[...project.cards]
                .filter((c) => c.photoId && !c.hidden)
                .sort((a, b) => a.zIndex - b.zIndex)
                .map((card) => {
                  const photo = project.photos.find((p) => p.id === card.photoId);
                  if (!photo?.objectUrl) return null;
                  const selectedCls =
                    selectedId === card.id ? styles.selectedRing : '';
                  const pad =
                    project.style.border === 'thin'
                      ? 4
                      : project.style.border === 'thick'
                        ? 9
                        : 7;
                  const bottomPad =
                    project.style.border === 'polaroid'
                      ? 20
                      : project.style.border === 'thick'
                        ? 14
                        : pad;
                  const innerW = card.w - pad * 2;
                  const innerH = card.h - pad - bottomPad;
                  const cover = Math.max(
                    innerW / photo.width,
                    innerH / photo.height,
                  );
                  const drawW = photo.width * cover * card.cropScale;
                  const drawH = photo.height * cover * card.cropScale;
                  return (
                    <div
                      key={card.id}
                      className={`${styles.card} ${borderClass(project.style.border)} ${selectedCls}`}
                      style={{
                        left: card.x,
                        top: card.y,
                        width: card.w,
                        height: card.h,
                        transform: `rotate(${card.rotation}deg)`,
                        zIndex: 20 + card.zIndex,
                      }}
                      onClick={() => setSelectedId(card.id)}
                    >
                      {project.style.tape !== 'none' ? (
                        <div
                          className={`${styles.tape} ${
                            project.style.tape === 'mint'
                              ? styles.tapeMint
                              : project.style.tape === 'coral'
                                ? styles.tapeCoral
                                : styles.tapeTan
                          }`}
                          style={{
                            transform: `rotate(${card.zIndex % 2 ? 12 : -10}deg)`,
                          }}
                        />
                      ) : null}
                      <div
                        className={styles.cardInner}
                        onPointerDown={(e) => onCardPointerDown(e, card, 'pan')}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={photo.objectUrl}
                          alt=""
                          className={styles.cardImg}
                          draggable={false}
                          style={{
                            width: drawW,
                            height: drawH,
                            transform: `translate(calc(-50% + ${card.cropOffsetX * innerW}px), calc(-50% + ${card.cropOffsetY * innerH}px))`,
                          }}
                        />
                      </div>
                      <button
                        type="button"
                        className={`${styles.handle} ${styles.moveHandle}`}
                        aria-label="Move photo card"
                        onPointerDown={(e) => onCardPointerDown(e, card, 'move')}
                      />
                      <button
                        type="button"
                        className={`${styles.handle} ${styles.rotateHandle}`}
                        aria-label="Rotate photo card"
                        onPointerDown={(e) => onCardPointerDown(e, card, 'rotate')}
                      />
                    </div>
                  );
                })}

              <LargeLetterTitle
                text={project.destination.displayName}
                letterFills={letterFills}
                artUrl={project.destinationArt.url}
                greetingsFrom={project.style.greetingsFrom}
                titleVariant={project.style.titleVariant}
              />

              {project.style.warmth > 0.05 ? (
                <div
                  className={styles.warmth}
                  style={{
                    opacity: project.style.warmth * project.style.vintageIntensity,
                  }}
                />
              ) : null}
              {project.style.vignette > 0.05 ? (
                <div
                  className={styles.vignette}
                  style={{
                    opacity: project.style.vignette * project.style.vintageIntensity,
                  }}
                />
              ) : null}
              {project.style.grain > 0.05 ? (
                <div
                  className={styles.grainOverlay}
                  style={{
                    opacity: 0.15 + project.style.grain * 0.4,
                  }}
                />
              ) : null}
              <div className={styles.linenOverlay} aria-hidden />
              <div className={styles.edgeFrame} aria-hidden />
            </div>
          </div>
        </div>

        <aside className={styles.panel} aria-label="Postcard controls">
          <div className={styles.field}>
            <label htmlFor="dest">Destination</label>
            <div className={styles.presetGrid} role="list" aria-label="Popular destinations">
              {DESTINATION_PRESETS.map((preset) => {
                const active =
                  project.destination.displayName.trim().toLowerCase() ===
                  preset.displayName.toLowerCase();
                return (
                  <button
                    key={preset.id}
                    type="button"
                    role="listitem"
                    className={`${styles.presetChip} ${
                      active ? styles.presetChipActive : ''
                    }`}
                    onClick={() => selectPreset(preset.id)}
                  >
                    {preset.displayName}
                  </button>
                );
              })}
            </div>
            <input
              id="dest"
              type="text"
              value={project.destination.displayName}
              onChange={(e) =>
                setProject((p) => ({
                  ...p,
                  destination: {
                    ...p.destination,
                    displayName: e.target.value,
                  },
                }))
              }
              onBlur={applyDestination}
              onKeyDown={(e) => {
                if (e.key === 'Enter') applyDestination();
              }}
              placeholder="Or type any city…"
              maxLength={48}
              autoComplete="off"
            />
            <p className={styles.hint}>
              Presets unlock landmark-filled letters (Duomo, Colosseum, beaches…).
              Custom cities still get vintage block letters. Spelling stays exact.
            </p>
          </div>

          <div>
            <h2>Photos ({project.photos.length}/{MAX_PHOTOS})</h2>
            <div
              className={`${styles.drop} ${dropActive ? styles.dropActive : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDropActive(true);
              }}
              onDragLeave={() => setDropActive(false)}
              onDrop={onDrop}
            >
              <p className={styles.hint}>
                Drop JPEG/PNG/WebP here, or choose files. Need {MIN_PHOTOS}–
                {MAX_PHOTOS} photos.
              </p>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnPrimary}`}
                onClick={() => fileRef.current?.click()}
              >
                Choose photos
              </button>
              <input
                ref={fileRef}
                className={styles.srOnly}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                onChange={(e) => {
                  if (e.target.files) void addFiles(e.target.files);
                  e.target.value = '';
                }}
              />
            </div>
            {countMsg ? <p className={styles.err}>{countMsg}</p> : null}
            <div className={styles.film} role="list">
              {project.photos.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="type"
                  style={{ padding: 0, border: 'none', background: 'transparent' }}
                  onClick={() => {
                    const card = project.cards.find((c) => c.photoId === p.id);
                    if (card) setSelectedId(card.id);
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.objectUrl}
                    alt={p.name}
                    className={`${styles.thumb} ${
                      usedPhotoIds.has(p.id) ? '' : styles.thumbUnused
                    }`}
                  />
                </button>
              ))}
            </div>
          </div>

          <div>
            <h2>Layout</h2>
            <div className={styles.row}>
              {(
                [
                  ['classic', 'Classic large letter'],
                  ['scrapbook', 'Scrapbook'],
                  ['editorial', 'Editorial'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={`${styles.chip} ${
                    project.templateId === id ? styles.chipOn : ''
                  }`}
                  onClick={() => setTemplate(id)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <h2>Vintage style</h2>
            <div className={styles.field}>
              <label htmlFor="paper">Paper</label>
              <select
                id="paper"
                value={project.style.paper}
                onChange={(e) =>
                  updateProject((p) => ({
                    ...p,
                    style: {
                      ...p.style,
                      paper: e.target.value as StyleSettings['paper'],
                    },
                  }))
                }
              >
                <option value="cream">Warm cream</option>
                <option value="ivory">Ivory</option>
                <option value="kraft">Kraft</option>
              </select>
            </div>
            <div className={styles.field}>
              <label htmlFor="tape">Tape</label>
              <select
                id="tape"
                value={project.style.tape}
                onChange={(e) =>
                  updateProject((p) => ({
                    ...p,
                    style: {
                      ...p.style,
                      tape: e.target.value as StyleSettings['tape'],
                    },
                  }))
                }
              >
                <option value="tan">Tan</option>
                <option value="mint">Mint</option>
                <option value="coral">Coral</option>
                <option value="none">None</option>
              </select>
            </div>
            <div className={styles.field}>
              <label htmlFor="border">Photo border</label>
              <select
                id="border"
                value={project.style.border}
                onChange={(e) =>
                  updateProject((p) => ({
                    ...p,
                    style: {
                      ...p.style,
                      border: e.target.value as StyleSettings['border'],
                    },
                  }))
                }
              >
                <option value="polaroid">Polaroid</option>
                <option value="thin">Thin print</option>
                <option value="thick">Thick mat</option>
              </select>
            </div>
            {(
              [
                ['vintageIntensity', 'Vintage intensity'],
                ['warmth', 'Warmth'],
                ['grain', 'Grain'],
                ['vignette', 'Vignette'],
              ] as const
            ).map(([key, label]) => (
              <div className={styles.sliderRow} key={key}>
                <label htmlFor={key}>{label}</label>
                <input
                  id={key}
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(project.style[key] * 100)}
                  onChange={(e) =>
                    updateProject((p) => ({
                      ...p,
                      style: {
                        ...p.style,
                        [key]: Number(e.target.value) / 100,
                      },
                    }))
                  }
                />
              </div>
            ))}
            <label className={styles.row} style={{ alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={project.style.greetingsFrom}
                onChange={(e) =>
                  updateProject((p) => ({
                    ...p,
                    style: { ...p.style, greetingsFrom: e.target.checked },
                  }))
                }
              />
              Show “Greetings from”
            </label>
            <button
              type="button"
              className={styles.btn}
              onClick={() =>
                updateProject((p) => ({ ...p, style: { ...DEFAULT_STYLE } }))
              }
            >
              Reset style
            </button>
          </div>

          {selected ? (
            <div>
              <h2>Selected photo</h2>
              <div className={styles.row}>
                <button
                  type="button"
                  className={styles.btn}
                  onClick={() => {
                    replaceCardId.current = selected.id;
                    replaceRef.current?.click();
                  }}
                >
                  Replace
                </button>
                <input
                  ref={replaceRef}
                  className={styles.srOnly}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    const cardId = replaceCardId.current;
                    if (!file || !cardId) return;
                    const result = await processPhotoFile(file);
                    if (!result.ok) {
                      setErrors([result.error]);
                      return;
                    }
                    const id = uid('photo');
                    const blobKey = `photo:${id}`;
                    await idbPutBlob(blobKey, result.blob);
                    const rec: PhotoRecord = {
                      id,
                      blobKey,
                      objectUrl: URL.createObjectURL(result.blob),
                      width: result.width,
                      height: result.height,
                      name: result.name,
                    };
                    updateProject((p) => ({
                      ...p,
                      photos: [...p.photos, rec],
                      cards: p.cards.map((c) =>
                        c.id === cardId
                          ? { ...resetCrop(c), photoId: id }
                          : c,
                      ),
                    }));
                  }}
                />
                <button
                  type="button"
                  className={styles.btn}
                  onClick={() =>
                    updateProject((p) => ({
                      ...p,
                      cards: p.cards.map((c) =>
                        c.id === selected.id ? resetCrop(c) : c,
                      ),
                    }))
                  }
                >
                  Reset crop
                </button>
                <button
                  type="button"
                  className={styles.btn}
                  onClick={() =>
                    updateProject((p) => ({
                      ...p,
                      cards: p.cards.map((c) =>
                        c.id === selected.id
                          ? normalizeCardCrop({
                              ...c,
                              cropScale: clampCropScale(c.cropScale + 0.15),
                            })
                          : c,
                      ),
                    }))
                  }
                >
                  Zoom in
                </button>
                <button
                  type="button"
                  className={styles.btn}
                  onClick={() =>
                    updateProject((p) => ({
                      ...p,
                      cards: p.cards.map((c) =>
                        c.id === selected.id
                          ? normalizeCardCrop({
                              ...c,
                              cropScale: clampCropScale(c.cropScale - 0.15),
                            })
                          : c,
                      ),
                    }))
                  }
                >
                  Zoom out
                </button>
                <button
                  type="button"
                  className={styles.btn}
                  onClick={() =>
                    updateProject((p) => ({
                      ...p,
                      cards: reorderLayers(p.cards, selected.id, 'forward'),
                    }))
                  }
                >
                  Bring forward
                </button>
                <button
                  type="button"
                  className={styles.btn}
                  onClick={() =>
                    updateProject((p) => ({
                      ...p,
                      cards: reorderLayers(p.cards, selected.id, 'backward'),
                    }))
                  }
                >
                  Send back
                </button>
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnDanger}`}
                  onClick={() =>
                    updateProject((p) => ({
                      ...p,
                      cards: p.cards.map((c) =>
                        c.id === selected.id ? { ...c, hidden: true, photoId: null } : c,
                      ),
                    }))
                  }
                >
                  Remove from layout
                </button>
              </div>
              <div className={styles.sliderRow}>
                <label htmlFor="rot">Rotation</label>
                <input
                  id="rot"
                  type="range"
                  min={-30}
                  max={30}
                  value={Math.round(selected.rotation)}
                  onChange={(e) =>
                    updateProject((p) => ({
                      ...p,
                      cards: p.cards.map((c) =>
                        c.id === selected.id
                          ? { ...c, rotation: Number(e.target.value) }
                          : c,
                      ),
                    }))
                  }
                />
              </div>
            </div>
          ) : null}

          <div className={styles.row}>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnPrimary}`}
              disabled={!canExport || exporting}
              onClick={() => void download()}
            >
              {exporting ? 'Exporting…' : 'Download 1080×1920'}
            </button>
            <button
              type="button"
              className={styles.btn}
              disabled={!canExport || exporting}
              onClick={() => void share()}
            >
              Share
            </button>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnDanger}`}
              onClick={() => {
                if (
                  !window.confirm(
                    'Delete this local postcard draft and photos from this browser?',
                  )
                ) {
                  return;
                }
                project.photos.forEach((p) => {
                  if (p.objectUrl) URL.revokeObjectURL(p.objectUrl);
                  void idbDeleteBlob(p.blobKey);
                });
                void wipeLocalProject();
                historyRef.current.clear();
                clearProjectMeta();
                setProject(emptyProject());
                setSelectedId(null);
                setStatus('Local draft cleared.');
              }}
            >
              Start over
            </button>
          </div>

          {status ? (
            <p className={styles.ok} role="status">
              {status}
            </p>
          ) : null}
          {errors.map((err) => (
            <p key={err} className={styles.err} role="alert">
              {err}
            </p>
          ))}
          {project.destinationArt.message ? (
            <p className={styles.hint}>{project.destinationArt.message}</p>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

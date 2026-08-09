import React, { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  DEFAULT_CENTER,
  getMapStyle,
  hasMapboxToken,
  MAPBOX_TOKEN,
} from '../../lib/mapConfig';
import { colors } from '../../constants/theme';
import type { ProgramPin, TripPin, UserProfile } from '../../data/types';
import type { AbroadsterMapProps } from './mapTypes';

export type { AbroadsterMapProps } from './mapTypes';

async function ensureMapCss() {
  const id = hasMapboxToken ? 'mapbox-gl-css' : 'maplibre-gl-css';
  if (!document.getElementById(id)) {
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = hasMapboxToken
      ? 'https://api.mapbox.com/mapbox-gl-js/v3.15.0/mapbox-gl.css'
      : 'https://unpkg.com/maplibre-gl@5.21.1/dist/maplibre-gl.css';
    document.head.appendChild(link);
    await new Promise<void>((resolve) => {
      link.onload = () => resolve();
      link.onerror = () => resolve();
      setTimeout(() => resolve(), 600);
    });
  }

  // Let liquid-glass pin glows paint past the marker box (default clips)
  if (!document.getElementById('abroadster-marker-overflow')) {
    const style = document.createElement('style');
    style.id = 'abroadster-marker-overflow';
    style.textContent = `
      .mapboxgl-marker, .maplibregl-marker {
        overflow: visible !important;
      }
    `;
    document.head.appendChild(style);
  }
}

/** Soft pin aura — kept subtle so clusters don't form a neon cloud */
function liquidGlassGlow(color: string): string {
  return `0px 0px 12px 2px ${color}99, 0px 2px 6px rgba(0,0,0,0.14)`;
}

function preparePinWrap(wrap: HTMLDivElement) {
  wrap.style.display = 'flex';
  wrap.style.flexDirection = 'column';
  wrap.style.alignItems = 'center';
  wrap.style.width = 'max-content';
  wrap.style.cursor = 'pointer';
  wrap.style.overflow = 'visible';
  // Room for glow so Mapbox/MapLibre don't hard-clip it
  wrap.style.padding = '14px';
  wrap.style.margin = '-14px';
  wrap.style.boxSizing = 'content-box';
}

async function waitForSize(el: HTMLElement): Promise<void> {
  for (let i = 0; i < 50; i++) {
    if (el.clientWidth > 20 && el.clientHeight > 20) return;
    await new Promise((r) => setTimeout(r, 40));
  }
}

export default function AbroadsterMap({
  styleMode,
  people,
  trips,
  programs,
  onRegionChange,
  onPersonPress,
  onTripPress,
  onProgramPress,
  flyTo,
  userLocation,
  searchPin,
  mapActive = true,
  selectedPersonId = null,
}: AbroadsterMapProps) {
  const mapNodeRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markersByKeyRef = useRef<Map<string, { marker: any; sig: string }>>(
    new Map(),
  );
  const markerLibRef = useRef<any>(null);
  const onRegionChangeRef = useRef(onRegionChange);
  const callbacksRef = useRef({ onPersonPress, onTripPress, onProgramPress });
  const styleModeRef = useRef(styleMode);
  styleModeRef.current = styleMode;

  useEffect(() => {
    onRegionChangeRef.current = onRegionChange;
    callbacksRef.current = { onPersonPress, onTripPress, onProgramPress };
  });

  useEffect(() => {
    let cancelled = false;
    let ro: ResizeObserver | null = null;

    async function init() {
      try {
        await ensureMapCss();
        const el = mapNodeRef.current;
        if (!el || cancelled) return;

        el.style.position = 'absolute';
        el.style.inset = '0px';
        el.style.width = '100%';
        el.style.height = '100%';

        await waitForSize(el);
        if (cancelled) return;

        let GL: any;
        let MarkerClass: any;

        if (hasMapboxToken) {
          const mapboxgl = await import('mapbox-gl');
          GL = mapboxgl.default;
          GL.accessToken = MAPBOX_TOKEN;
          MarkerClass = mapboxgl.Marker;
        } else {
          const maplibregl = await import('maplibre-gl');
          GL = maplibregl.default;
          MarkerClass = maplibregl.Marker;
        }

        if (cancelled) return;
        markerLibRef.current = MarkerClass;

        const map = new GL.Map({
          container: el,
          style: getMapStyle(styleModeRef.current),
          center: [DEFAULT_CENTER.longitude, DEFAULT_CENTER.latitude],
          zoom: DEFAULT_CENTER.zoom,
          attributionControl: false,
        });

        map.addControl(new GL.AttributionControl({ compact: true }), 'bottom-left');
        mapRef.current = map;

        const emitRegion = () => {
          if (!mapRef.current) return;
          const c = map.getCenter();
          const b = map.getBounds();
          onRegionChangeRef.current(
            { latitude: c.lat, longitude: c.lng },
            {
              west: b.getWest(),
              south: b.getSouth(),
              east: b.getEast(),
              north: b.getNorth(),
            },
            map.getZoom(),
          );
        };

        map.on('load', () => {
          map.resize();
          emitRegion();
        });
        map.on('moveend', emitRegion);
        map.on('error', (e: any) => {
          console.error('Mapbox/MapLibre error', e?.error || e);
        });

        ro = new ResizeObserver(() => map.resize());
        ro.observe(el);
      } catch (err) {
        console.error('Map init failed', err);
      }
    }

    init();

    return () => {
      cancelled = true;
      ro?.disconnect();
      markersByKeyRef.current.forEach((entry) => entry.marker.remove());
      markersByKeyRef.current.clear();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      map.setStyle(getMapStyle(styleMode));
      map.once('style.load', () => map.resize());
    };
    if (map.isStyleLoaded?.() || map.loaded()) apply();
    else map.once('load', apply);
  }, [styleMode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !flyTo) return;
    map.flyTo({
      center: [flyTo.longitude, flyTo.latitude],
      zoom: flyTo.zoom ?? 13.5,
      essential: true,
      duration: 1200,
    });
  }, [flyTo]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || typeof document === 'undefined') return;
    // Keep existing markers when tab is hidden — skip work, no teardown flicker
    if (!mapActive) return;
    let cancelled = false;

    async function renderMarkers() {
      const MarkerClass = markerLibRef.current;
      if (!MarkerClass || cancelled || !mapRef.current) return;

      const { ensureImageUri } = await import('../../lib/images');
      const next = new Map<string, { marker: any; sig: string }>();

      const upsert = (
        key: string,
        sig: string,
        lng: number,
        lat: number,
        el: HTMLElement,
        anchor?: string,
      ) => {
        const prev = markersByKeyRef.current.get(key);
        if (prev && prev.sig === sig) {
          prev.marker.setLngLat([lng, lat]);
          next.set(key, prev);
          return;
        }
        prev?.marker.remove();
        const marker = new MarkerClass({
          element: el,
          ...(anchor ? { anchor } : {}),
        })
          .setLngLat([lng, lat])
          .addTo(mapRef.current);
        next.set(key, { marker, sig });
      };

      for (const program of programs) {
        const logoUri = (await ensureImageUri(program.logo)) || '';
        if (cancelled) return;
        const key = `program:${program.id}`;
        const sig = `${logoUri}|${program.accent || ''}|${program.latitude}|${program.longitude}`;
        const el = buildProgramMarker(program, logoUri);
        el.onclick = (e) => {
          e.stopPropagation();
          callbacksRef.current.onProgramPress(program);
        };
        upsert(key, sig, program.longitude, program.latitude, el, 'bottom');
      }

      for (const trip of trips) {
        const glow =
          trip.status === 'upcoming'
            ? colors.statusOrangeGlow
            : colors.statusYellowGlow;
        const avatarUris = await Promise.all(
          trip.members.map((m) => ensureImageUri(m.avatar)),
        );
        if (cancelled) return;
        const key = `trip:${trip.id}`;
        const sig = `${trip.status}|${avatarUris.join(',')}|${trip.latitude}|${trip.longitude}|${shortNames(trip)}`;
        const el = buildGroupMarker(avatarUris, glow, shortNames(trip));
        el.onclick = (e) => {
          e.stopPropagation();
          callbacksRef.current.onTripPress(trip);
        };
        upsert(key, sig, trip.longitude, trip.latitude, el, 'bottom');
      }

      for (const person of people) {
        const rawAvatar = await ensureImageUri(person.avatar);
        const { defaultAvatarUrl } = await import('../../lib/images');
        const avatarUri = rawAvatar || defaultAvatarUrl(person.fullName || person.firstName);
        if (cancelled) return;
        const key = `person:${person.id}`;
        const selected = selectedPersonId === person.id;
        const sig = `${avatarUri}|${person.latitude}|${person.longitude}|${person.isCurrentUser ? 'me' : ''}|${selected ? 'sel' : ''}`;
        const el = buildPersonMarker(person, avatarUri, selected);
        el.onclick = (e) => {
          e.stopPropagation();
          callbacksRef.current.onPersonPress(person);
        };
        upsert(key, sig, person.longitude, person.latitude, el, 'bottom');
      }

      // GPS blue dot only when "me" isn't already shown as a profile pin
      // (or GPS is far from the host pin — then keep both for honesty).
      const mePin = people.find((p) => p.isCurrentUser);
      const showGpsDot =
        !!userLocation &&
        (!mePin ||
          Math.hypot(
            userLocation.latitude - mePin.latitude,
            userLocation.longitude - mePin.longitude,
          ) > 0.35);
      if (userLocation && showGpsDot) {
        const el = document.createElement('div');
        el.style.width = '16px';
        el.style.height = '16px';
        el.style.borderRadius = '50%';
        el.style.background = '#175864';
        el.style.border = '3px solid white';
        el.style.boxShadow = '0 0 0 6px rgba(26,115,232,0.25)';
        upsert(
          'user-location',
          `${userLocation.latitude}|${userLocation.longitude}`,
          userLocation.longitude,
          userLocation.latitude,
          el,
        );
      }

      if (searchPin) {
        const wrap = document.createElement('div');
        wrap.style.display = 'flex';
        wrap.style.flexDirection = 'column';
        wrap.style.alignItems = 'center';
        wrap.style.pointerEvents = 'none';
        const pin = document.createElement('div');
        pin.style.width = '18px';
        pin.style.height = '18px';
        pin.style.borderRadius = '50% 50% 50% 0';
        pin.style.transform = 'rotate(-45deg)';
        pin.style.background = '#E53935';
        pin.style.border = '2.5px solid white';
        pin.style.boxShadow = '0 2px 8px rgba(0,0,0,0.28)';
        wrap.appendChild(pin);
        if (searchPin.label) {
          const label = document.createElement('div');
          label.textContent = searchPin.label;
          label.style.marginTop = '6px';
          label.style.padding = '2px 8px';
          label.style.borderRadius = '10px';
          label.style.background = 'rgba(255,255,255,0.95)';
          label.style.fontSize = '11px';
          label.style.fontWeight = '600';
          label.style.color = '#222';
          label.style.whiteSpace = 'nowrap';
          label.style.boxShadow = '0 1px 4px rgba(0,0,0,0.15)';
          wrap.appendChild(label);
        }
        upsert(
          'search-pin',
          `${searchPin.latitude}|${searchPin.longitude}|${searchPin.label ?? ''}`,
          searchPin.longitude,
          searchPin.latitude,
          wrap,
          'bottom',
        );
      }

      for (const [key, entry] of markersByKeyRef.current) {
        if (!next.has(key)) entry.marker.remove();
      }
      markersByKeyRef.current = next;
    }

    const ready = () => {
      renderMarkers().catch(console.error);
    };
    if (map.loaded()) ready();
    else map.once('load', ready);
    map.on('style.load', ready);

    // Retry shortly in case map loads after markers effect first runs
    const retry = setTimeout(ready, 800);

    return () => {
      cancelled = true;
      clearTimeout(retry);
      map.off('style.load', ready);
    };
  }, [people, trips, programs, userLocation, searchPin, mapActive, selectedPersonId]);

  return (
    <View style={styles.container} collapsable={false}>
      {React.createElement('div', {
        ref: (node: HTMLDivElement | null) => {
          mapNodeRef.current = node;
        },
        style: webMapStyle,
      })}
    </View>
  );
}

const webMapStyle: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  width: '100%',
  height: '100%',
};

function shortNames(trip: TripPin): { title: string; subtitle: string } {
  const names = trip.members.map((m) => m.firstName);
  const title =
    names.length > 1 ? `${names[0]}, ${names[1].slice(0, 3)}...` : names[0];
  const subtitle = trip.status === 'upcoming' ? 'Upcoming trip' : 'Planning trip';
  return { title, subtitle };
}

/** Compact pin label — resets RN-web div defaults so the box hugs text. */
function appendPinLabel(
  parent: HTMLElement,
  title: string,
  subtitle: string,
  opts?: { titleSize?: string; subtitleSize?: string },
) {
  const label = document.createElement('div');
  label.style.display = 'block';
  label.style.boxSizing = 'border-box';
  label.style.marginTop = '3px';
  label.style.marginLeft = '0';
  label.style.marginRight = '0';
  label.style.marginBottom = '0';
  label.style.background = 'white';
  label.style.borderRadius = '4px';
  label.style.boxShadow = '0px 1px 3px rgba(0,0,0,0.22)';
  label.style.padding = '1px 4px';
  label.style.width = 'max-content';
  label.style.maxWidth = '78px';
  label.style.minWidth = '0';
  label.style.minHeight = '0';
  label.style.flexShrink = '0';
  label.style.alignSelf = 'center';
  label.style.textAlign = 'center';
  label.style.lineHeight = '1';
  label.style.overflow = 'hidden';

  const name = document.createElement('div');
  name.textContent = title;
  name.style.display = 'block';
  name.style.boxSizing = 'border-box';
  name.style.fontFamily = 'Nunito Sans, sans-serif';
  name.style.fontWeight = '800';
  name.style.fontSize = opts?.titleSize ?? '7px';
  name.style.lineHeight = '1.15';
  name.style.color = '#000';
  name.style.whiteSpace = 'nowrap';
  name.style.overflow = 'hidden';
  name.style.textOverflow = 'ellipsis';
  name.style.maxWidth = '70px';
  name.style.minHeight = '0';
  name.style.padding = '0';
  name.style.margin = '0';

  const sub = document.createElement('div');
  sub.textContent = subtitle;
  sub.style.display = 'block';
  sub.style.boxSizing = 'border-box';
  sub.style.fontFamily = 'Nunito Sans, sans-serif';
  sub.style.fontWeight = '500';
  sub.style.fontSize = opts?.subtitleSize ?? '5px';
  sub.style.lineHeight = '1.15';
  sub.style.color = colors.textMuted;
  sub.style.whiteSpace = 'nowrap';
  sub.style.overflow = 'hidden';
  sub.style.textOverflow = 'ellipsis';
  sub.style.maxWidth = '70px';
  sub.style.minHeight = '0';
  sub.style.padding = '0';
  sub.style.margin = '0';

  label.appendChild(name);
  label.appendChild(sub);
  parent.appendChild(label);
}

function buildPersonMarker(
  person: UserProfile,
  avatarUri: string,
  selected = false,
): HTMLDivElement {
  const wrap = document.createElement('div');
  preparePinWrap(wrap);
  // Person avatars above program logos when they share a spot
  wrap.style.zIndex = selected ? '6' : '4';
  const isMe = Boolean(person.isCurrentUser);
  const emphasize = isMe || selected;

  const ring = document.createElement('div');
  ring.style.width = emphasize ? '52px' : '45px';
  ring.style.height = emphasize ? '52px' : '45px';
  ring.style.flexShrink = '0';
  ring.style.borderRadius = '100px';
  ring.style.border = emphasize ? '3px solid #175864' : '2.5px solid white';
  ring.style.boxShadow = emphasize
    ? '0 0 0 5px rgba(23,88,100,0.3), 0 6px 16px rgba(0,0,0,0.22)'
    : liquidGlassGlow(colors.statusGreenGlow);
  ring.style.overflow = 'hidden';
  ring.style.background = '#eee';

  const img = document.createElement('img');
  img.src = avatarUri;
  img.alt = person.firstName;
  img.style.width = '100%';
  img.style.height = '100%';
  img.style.objectFit = 'cover';
  ring.appendChild(img);

  wrap.appendChild(ring);
  appendPinLabel(
    wrap,
    isMe ? 'You' : person.firstName,
    isMe ? person.hostCity || person.homeUniversity : person.homeUniversity,
  );
  return wrap;
}

function buildGroupMarker(
  avatarUris: string[],
  glow: string,
  labels: { title: string; subtitle: string },
): HTMLDivElement {
  const wrap = document.createElement('div');
  preparePinWrap(wrap);

  const ring = document.createElement('div');
  ring.style.width = '45px';
  ring.style.height = '45px';
  ring.style.flexShrink = '0';
  ring.style.borderRadius = '100px';
  ring.style.border = '2.5px solid white';
  ring.style.boxShadow = liquidGlassGlow(glow);
  ring.style.background = colors.groupAvatarBg;
  ring.style.position = 'relative';
  ring.style.overflow = 'hidden';

  const positions = [
    { left: 3, top: 5, size: 21 },
    { left: 22, top: 14, size: 17 },
    { left: 8, top: 26, size: 15 },
    { left: 24, top: 4, size: 13 },
  ];

  avatarUris.slice(0, 4).forEach((uri, i) => {
    const img = document.createElement('img');
    img.src = uri;
    const pos = positions[i];
    img.style.position = 'absolute';
    img.style.left = `${pos.left}px`;
    img.style.top = `${pos.top}px`;
    img.style.width = `${pos.size}px`;
    img.style.height = `${pos.size}px`;
    img.style.borderRadius = '100px';
    img.style.objectFit = 'cover';
    ring.appendChild(img);
  });

  wrap.appendChild(ring);
  appendPinLabel(wrap, labels.title, labels.subtitle);
  return wrap;
}

function buildProgramMarker(program: ProgramPin, logoUri: string): HTMLDivElement {
  const wrap = document.createElement('div');
  preparePinWrap(wrap);
  wrap.style.zIndex = '2';

  const ring = document.createElement('div');
  ring.style.width = '65px';
  ring.style.height = '65px';
  ring.style.flexShrink = '0';
  ring.style.borderRadius = '100px';
  ring.style.border = '2.5px solid white';
  ring.style.boxShadow = liquidGlassGlow(colors.programBlue);
  ring.style.overflow = 'hidden';
  ring.style.background = program.accent || colors.programBlue;
  ring.style.display = 'flex';
  ring.style.alignItems = 'center';
  ring.style.justifyContent = 'center';

  const letter = document.createElement('div');
  letter.textContent = (program.shortName || program.name || '?')
    .trim()
    .charAt(0)
    .toUpperCase();
  letter.style.fontFamily = 'system-ui, sans-serif';
  letter.style.fontWeight = '800';
  letter.style.fontSize = '22px';
  letter.style.color = 'white';
  ring.appendChild(letter);

  if (logoUri) {
    const img = document.createElement('img');
    img.src = logoUri;
    img.alt = program.shortName || program.name;
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = 'cover';
    img.style.position = 'absolute';
    img.style.inset = '0';
    img.onerror = () => {
      img.remove();
    };
    ring.style.position = 'relative';
    ring.appendChild(img);
  }

  wrap.appendChild(ring);
  appendPinLabel(wrap, program.shortName, `${program.studentCount} students here`, {
    titleSize: '7px',
    subtitleSize: '5px',
  });
  return wrap;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#E8EEF2',
    position: 'relative',
    width: '100%',
    height: '100%',
    minHeight: 400,
  },
});

import React, { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  DEFAULT_CENTER,
  getMapStyle,
  hasMapboxToken,
  MAPBOX_TOKEN,
} from '../../lib/mapConfig';
import { colors } from '../../constants/theme';

export interface DestinationMapPreviewProps {
  latitude: number | null;
  longitude: number | null;
  pinLabel?: string;
}

async function ensureMapCss() {
  const id = hasMapboxToken ? 'mapbox-gl-css' : 'maplibre-gl-css';
  if (document.getElementById(id)) return;
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

export default function DestinationMapPreview({
  latitude,
  longitude,
  pinLabel,
}: DestinationMapPreviewProps) {
  const mapNodeRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const markerLibRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!mapNodeRef.current) return;
      await ensureMapCss();
      if (cancelled || !mapNodeRef.current) return;

      const mod = hasMapboxToken
        ? await import('mapbox-gl')
        : await import('maplibre-gl');
      const mapboxgl = (mod as any).default ?? mod;
      if (hasMapboxToken) mapboxgl.accessToken = MAPBOX_TOKEN;
      markerLibRef.current = mapboxgl;

      const map = new mapboxgl.Map({
        container: mapNodeRef.current,
        style: getMapStyle('regular'),
        center: [
          longitude ?? DEFAULT_CENTER.longitude,
          latitude ?? DEFAULT_CENTER.latitude,
        ],
        zoom: latitude != null ? 10.5 : DEFAULT_CENTER.zoom - 1,
        attributionControl: false,
        interactive: true,
      });
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
      mapRef.current = map;
    })();

    return () => {
      cancelled = true;
      markerRef.current?.remove?.();
      markerRef.current = null;
      mapRef.current?.remove?.();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const mapboxgl = markerLibRef.current;
    if (!map || !mapboxgl || latitude == null || longitude == null) return;

    const fly = () => {
      map.flyTo({
        center: [longitude, latitude],
        zoom: 11,
        essential: true,
        duration: 900,
      });
      markerRef.current?.remove?.();
      const el = document.createElement('div');
      el.style.width = '28px';
      el.style.height = '28px';
      el.style.borderRadius = '14px';
      el.style.background = colors.programBlue;
      el.style.border = '3px solid #fff';
      el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.35)';
      if (pinLabel) el.title = pinLabel;
      markerRef.current = new mapboxgl.Marker({ element: el })
        .setLngLat([longitude, latitude])
        .addTo(map);
    };

    if (map.loaded()) fly();
    else map.once('load', fly);
  }, [latitude, longitude, pinLabel]);

  return (
    <View style={styles.wrap}>
      <div ref={mapNodeRef} style={styles.mapDom as any} />
      <View style={styles.fade} pointerEvents="none" />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: 168,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#E8EEF5',
    borderWidth: 1,
    borderColor: 'rgba(23,88,100,0.12)',
  },
  mapDom: {
    width: '100%',
    height: '100%',
  },
  fade: {
    ...StyleSheet.absoluteFill,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
});

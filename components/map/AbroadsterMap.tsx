import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Mapbox, {
  Camera,
  MapView,
  MarkerView,
  type MapState,
} from '@rnmapbox/maps';
import {
  DEFAULT_CENTER,
  getMapStyle,
  hasMapboxToken,
  MAPBOX_TOKEN,
} from '../../lib/mapConfig';
import { clusterMapPins } from '../../lib/map/clusterPins';
import type { AbroadsterMapProps } from './mapTypes';
import {
  ClusterPinView,
  GpsDotView,
  PersonPinView,
  ProgramPinView,
  SearchPinView,
  TripPinView,
} from './MapPinViews';

if (MAPBOX_TOKEN) {
  void Mapbox.setAccessToken(MAPBOX_TOKEN);
}

/**
 * Native Mapbox map with camera-synced MarkerViews + zoom clustering.
 */
export default function AbroadsterMap({
  styleMode,
  people,
  trips,
  programs,
  onRegionChange,
  onPersonPress,
  onTripPress,
  onProgramPress,
  onClusterPress,
  flyTo,
  userLocation,
  searchPin,
  mapActive = true,
  selectedPersonId = null,
  onMapPress,
}: AbroadsterMapProps) {
  const cameraRef = useRef<React.ComponentRef<typeof Camera>>(null);
  const onRegionChangeRef = useRef(onRegionChange);
  const regionEmitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [zoom, setZoom] = useState(DEFAULT_CENTER.zoom);

  useEffect(() => {
    onRegionChangeRef.current = onRegionChange;
  });

  useEffect(() => {
    return () => {
      if (regionEmitTimer.current) clearTimeout(regionEmitTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!flyTo || !cameraRef.current) return;
    try {
      cameraRef.current.setCamera({
        centerCoordinate: [flyTo.longitude, flyTo.latitude],
        zoomLevel: flyTo.zoom ?? 13.5,
        animationDuration: 900,
        animationMode: 'flyTo',
      });
    } catch {
      // ignore
    }
  }, [flyTo]);

  const emitFromState = useCallback((state: MapState) => {
    const z = state.properties.zoom ?? DEFAULT_CENTER.zoom;
    setZoom(z);
    if (regionEmitTimer.current) clearTimeout(regionEmitTimer.current);
    regionEmitTimer.current = setTimeout(() => {
      const center = state.properties.center;
      const bounds = state.properties.bounds;
      if (!center || center.length < 2) return;
      const lng = center[0];
      const lat = center[1];
      const west = bounds?.sw?.[0] ?? lng - 0.05;
      const south = bounds?.sw?.[1] ?? lat - 0.04;
      const east = bounds?.ne?.[0] ?? lng + 0.05;
      const north = bounds?.ne?.[1] ?? lat + 0.04;
      onRegionChangeRef.current(
        { latitude: lat, longitude: lng },
        { west, south, east, north },
        z,
      );
    }, 80);
  }, []);

  const styleURL = useMemo(() => getMapStyle(styleMode), [styleMode]);

  const clusters = useMemo(
    () => clusterMapPins(people, trips, programs, zoom),
    [people, trips, programs, zoom],
  );

  const mePin = people.find((p) => p.isCurrentUser);
  const showGpsDot =
    !!userLocation &&
    (!mePin ||
      Math.hypot(
        userLocation.latitude - mePin.latitude,
        userLocation.longitude - mePin.longitude,
      ) > 0.35);

  const handleClusterPress = useCallback(
    (cluster: (typeof clusters)[number]) => {
      if (cluster.isSingleton && cluster.members.length === 1) {
        const m = cluster.members[0];
        if (m.kind === 'person') onPersonPress(m.person);
        else if (m.kind === 'trip') onTripPress(m.trip);
        else onProgramPress(m.program);
        return;
      }
      if (onClusterPress) {
        onClusterPress({
          latitude: cluster.latitude,
          longitude: cluster.longitude,
          people: cluster.members
            .filter((m) => m.kind === 'person')
            .map((m) => (m as { kind: 'person'; person: (typeof people)[number] }).person),
          trips: cluster.members
            .filter((m) => m.kind === 'trip')
            .map((m) => (m as { kind: 'trip'; trip: (typeof trips)[number] }).trip),
          programs: cluster.members
            .filter((m) => m.kind === 'program')
            .map(
              (m) =>
                (m as { kind: 'program'; program: (typeof programs)[number] })
                  .program,
            ),
        });
        return;
      }
      // Default: open first person, else first trip, else first program
      const person = cluster.members.find((m) => m.kind === 'person');
      if (person && person.kind === 'person') {
        onPersonPress(person.person);
        return;
      }
      const trip = cluster.members.find((m) => m.kind === 'trip');
      if (trip && trip.kind === 'trip') {
        onTripPress(trip.trip);
        return;
      }
      const program = cluster.members.find((m) => m.kind === 'program');
      if (program && program.kind === 'program') {
        onProgramPress(program.program);
      }
    },
    [onPersonPress, onTripPress, onProgramPress, onClusterPress],
  );

  if (!hasMapboxToken) {
    return (
      <View style={[styles.container, styles.tokenMissing]} pointerEvents="none" />
    );
  }

  return (
    <View style={styles.container} pointerEvents={mapActive ? 'auto' : 'none'}>
      <MapView
        style={StyleSheet.absoluteFill}
        styleURL={styleURL}
        compassEnabled={false}
        logoEnabled
        attributionEnabled
        scaleBarEnabled={false}
        pitchEnabled={false}
        rotateEnabled={false}
        onPress={() => onMapPress?.()}
        onCameraChanged={emitFromState}
        onMapIdle={emitFromState}
      >
        <Camera
          ref={cameraRef}
          defaultSettings={{
            centerCoordinate: [
              DEFAULT_CENTER.longitude,
              DEFAULT_CENTER.latitude,
            ],
            zoomLevel: DEFAULT_CENTER.zoom,
          }}
          animationMode="flyTo"
          animationDuration={0}
        />

        {clusters.map((cluster) => {
          if (cluster.isSingleton && cluster.members.length === 1) {
            const m = cluster.members[0];
            if (m.kind === 'program') {
              return (
                <MarkerView
                  key={cluster.id}
                  coordinate={[cluster.longitude, cluster.latitude]}
                  allowOverlap
                  anchor={{ x: 0.5, y: 0.55 }}
                >
                  <ProgramPinView
                    program={m.program}
                    onPress={() => onProgramPress(m.program)}
                  />
                </MarkerView>
              );
            }
            if (m.kind === 'trip') {
              return (
                <MarkerView
                  key={cluster.id}
                  coordinate={[cluster.longitude, cluster.latitude]}
                  allowOverlap
                  anchor={{ x: 0.5, y: 0.55 }}
                >
                  <TripPinView
                    trip={m.trip}
                    onPress={() => onTripPress(m.trip)}
                  />
                </MarkerView>
              );
            }
            const selected = selectedPersonId === m.person.id;
            return (
              <MarkerView
                key={cluster.id}
                coordinate={[cluster.longitude, cluster.latitude]}
                allowOverlap
                isSelected={selected || Boolean(m.person.isCurrentUser)}
                anchor={{ x: 0.5, y: 0.55 }}
              >
                <PersonPinView
                  person={m.person}
                  selected={selected}
                  onPress={() => onPersonPress(m.person)}
                />
              </MarkerView>
            );
          }

          return (
            <MarkerView
              key={cluster.id}
              coordinate={[cluster.longitude, cluster.latitude]}
              allowOverlap
              anchor={{ x: 0.5, y: 0.55 }}
            >
              <ClusterPinView
                cluster={cluster}
                onPress={() => handleClusterPress(cluster)}
              />
            </MarkerView>
          );
        })}

        {showGpsDot && userLocation ? (
          <MarkerView
            key="user-location"
            coordinate={[userLocation.longitude, userLocation.latitude]}
            allowOverlap
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <GpsDotView />
          </MarkerView>
        ) : null}

        {searchPin ? (
          <MarkerView
            key="search-pin"
            coordinate={[searchPin.longitude, searchPin.latitude]}
            allowOverlap
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <SearchPinView label={searchPin.label} />
          </MarkerView>
        ) : null}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#DDE5EA',
  },
  tokenMissing: {
    backgroundColor: '#C5D0D6',
  },
});

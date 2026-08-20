import type { LatLngBounds } from '../../lib/geo';
import type { MapStyleMode, ProgramPin, TripPin, UserProfile } from '../../data/types';

export interface MapCamera {
  latitude: number;
  longitude: number;
  zoom: number;
}

export interface AbroadsterMapProps {
  styleMode: MapStyleMode;
  people: UserProfile[];
  trips: TripPin[];
  programs: ProgramPin[];
  onRegionChange: (
    center: { latitude: number; longitude: number },
    bounds: LatLngBounds,
    zoom: number,
  ) => void;
  onPersonPress: (user: UserProfile) => void;
  onTripPress: (trip: TripPin) => void;
  onProgramPress: (program: ProgramPin) => void;
  /** Multi-entity cluster tap (zoom / open drawer). Optional. */
  onClusterPress?: (payload: {
    latitude: number;
    longitude: number;
    people: UserProfile[];
    trips: TripPin[];
    programs: ProgramPin[];
  }) => void;
  flyTo?: MapCamera | null;
  userLocation?: { latitude: number; longitude: number } | null;
  /** Temporary pin from place search (city / country / landmark). */
  searchPin?: { latitude: number; longitude: number; label?: string } | null;
  /** When false, skip marker work (map tab hidden). */
  mapActive?: boolean;
  /** Highlight / keep visible the person selected from the list. */
  selectedPersonId?: string | null;
  onMapPress?: () => void;
}

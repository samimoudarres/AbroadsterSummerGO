import * as Location from 'expo-location';

export type DeviceCoords = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
};

let permissionAsked = false;

/** Request When-In-Use location permission (no background). */
export async function requestLocationPermission(): Promise<boolean> {
  try {
    const current = await Location.getForegroundPermissionsAsync();
    if (current.granted) return true;
    if (current.status === Location.PermissionStatus.DENIED && permissionAsked) {
      return false;
    }
    permissionAsked = true;
    const next = await Location.requestForegroundPermissionsAsync();
    return next.granted;
  } catch {
    return false;
  }
}

export async function getCurrentDeviceLocation(): Promise<DeviceCoords | null> {
  try {
    const ok = await requestLocationPermission();
    if (!ok) return null;
    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return {
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
    };
  } catch {
    return null;
  }
}

/** Watch GPS while the map tab is active. Caller must remove the subscription. */
export async function watchDeviceLocation(
  onUpdate: (coords: DeviceCoords) => void,
): Promise<Location.LocationSubscription | null> {
  try {
    const ok = await requestLocationPermission();
    if (!ok) return null;
    return await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 4000,
        distanceInterval: 12,
      },
      (pos) => {
        onUpdate({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
      },
    );
  } catch {
    return null;
  }
}

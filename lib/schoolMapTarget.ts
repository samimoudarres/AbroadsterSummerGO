import type { MapCamera } from '../components/map/mapTypes';
import {
  getInstitutionByName,
  getLocalStudyPrograms,
  getProgramByName,
} from './schools/catalog';

/** Common US campus coordinates keyed by lowercase match fragments / aliases. */
const US_CAMPUSES: Record<string, MapCamera> = {
  'syracuse university': { latitude: 43.0392, longitude: -76.1351, zoom: 12 },
  syracuse: { latitude: 43.0392, longitude: -76.1351, zoom: 12 },
  'indiana university': { latitude: 39.1682, longitude: -86.523, zoom: 12 },
  indiana: { latitude: 39.1682, longitude: -86.523, zoom: 12 },
  'ut austin': { latitude: 30.2849, longitude: -97.7341, zoom: 12 },
  'university of texas at austin': {
    latitude: 30.2849,
    longitude: -97.7341,
    zoom: 12,
  },
  'the university of texas at austin': {
    latitude: 30.2849,
    longitude: -97.7341,
    zoom: 12,
  },
  'university of texas': { latitude: 30.2849, longitude: -97.7341, zoom: 12 },
  ucla: { latitude: 34.0689, longitude: -118.4452, zoom: 12 },
  'university of california, los angeles': {
    latitude: 34.0689,
    longitude: -118.4452,
    zoom: 12,
  },
  'boston university': { latitude: 42.3505, longitude: -71.1054, zoom: 12 },
  bu: { latitude: 42.3505, longitude: -71.1054, zoom: 12 },
  'university of michigan': { latitude: 42.278, longitude: -83.7382, zoom: 12 },
  'university of michigan - ann arbor': {
    latitude: 42.278,
    longitude: -83.7382,
    zoom: 12,
  },
  michigan: { latitude: 42.278, longitude: -83.7382, zoom: 12 },
  nyu: { latitude: 40.7295, longitude: -73.9965, zoom: 12 },
  'new york university': { latitude: 40.7295, longitude: -73.9965, zoom: 12 },
  'cu boulder': { latitude: 40.0076, longitude: -105.2659, zoom: 12 },
  'university of colorado': { latitude: 40.0076, longitude: -105.2659, zoom: 12 },
  'university of colorado boulder': {
    latitude: 40.0076,
    longitude: -105.2659,
    zoom: 12,
  },
  'penn state': { latitude: 40.7982, longitude: -77.8599, zoom: 12 },
  'pennsylvania state university': {
    latitude: 40.7982,
    longitude: -77.8599,
    zoom: 12,
  },
  'university of florida': { latitude: 29.6436, longitude: -82.3549, zoom: 12 },
  'ohio state': { latitude: 40.0067, longitude: -83.0305, zoom: 12 },
  'the ohio state university': {
    latitude: 40.0067,
    longitude: -83.0305,
    zoom: 12,
  },
  'university of washington': {
    latitude: 47.6553,
    longitude: -122.3035,
    zoom: 12,
  },
  'georgia tech': { latitude: 33.7756, longitude: -84.3963, zoom: 12 },
  'georgia institute of technology': {
    latitude: 33.7756,
    longitude: -84.3963,
    zoom: 12,
  },
  'usc': { latitude: 34.0224, longitude: -118.2851, zoom: 12 },
  'university of southern california': {
    latitude: 34.0224,
    longitude: -118.2851,
    zoom: 12,
  },
  'northwestern university': {
    latitude: 42.0565,
    longitude: -87.6753,
    zoom: 12,
  },
  northwestern: { latitude: 42.0565, longitude: -87.6753, zoom: 12 },
  'duke university': { latitude: 36.0014, longitude: -78.9382, zoom: 12 },
  duke: { latitude: 36.0014, longitude: -78.9382, zoom: 12 },
  'cornell university': { latitude: 42.4534, longitude: -76.4735, zoom: 12 },
  cornell: { latitude: 42.4534, longitude: -76.4735, zoom: 12 },
  'university of wisconsin': {
    latitude: 43.0766,
    longitude: -89.4125,
    zoom: 12,
  },
  'university of wisconsin-madison': {
    latitude: 43.0766,
    longitude: -89.4125,
    zoom: 12,
  },
};

function matchCampus(q: string): MapCamera | null {
  const exact = US_CAMPUSES[q];
  if (exact) return exact;
  for (const [key, cam] of Object.entries(US_CAMPUSES)) {
    if (q.includes(key) || key.includes(q)) return cam;
  }
  return null;
}

/** Resolve a school / program label to a map camera target. */
export function schoolMapTarget(label: string): MapCamera | null {
  const q = label.trim().toLowerCase();
  if (!q) return null;

  const prog =
    getProgramByName(label) ||
    getLocalStudyPrograms().find(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.short_name.toLowerCase().includes(q) ||
        q.includes(p.short_name.toLowerCase()),
    );

  if (prog) {
    return { latitude: prog.latitude, longitude: prog.longitude, zoom: 13.2 };
  }

  const byAlias = matchCampus(q);
  if (byAlias) return byAlias;

  const inst = getInstitutionByName(label);
  if (inst) {
    const fromName = matchCampus(inst.name.toLowerCase());
    if (fromName) return fromName;
  }

  return null;
}

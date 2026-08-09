// Local avatar assets from Figma
export const avatars = {
  matilda: require('../assets/avatars/matilda.png'),
  cole: require('../assets/avatars/cole.png'),
  jack: require('../assets/avatars/jack.png'),
  luke: require('../assets/avatars/luke.png'),
  marcos: require('../assets/avatars/marcos.png'),
  chelsea: require('../assets/avatars/chelsea.png'),
  emily: require('../assets/avatars/emily.png'),
  sebastian: require('../assets/avatars/sebastian.png'),
  ciee: require('../assets/avatars/ciee.png'),
  ies: require('../assets/avatars/ies.png'),
  // reuse for extra students until more assets
  mi: require('../assets/avatars/emily.png'),
  currentUser: require('../assets/avatars/marcos.png'),
} as const;

import type {
  FilterChip,
  ProgramPin,
  TripPin,
  UserProfile,
} from './types';
import { scatterAround } from '../lib/userLocation';
import {
  buildFilterChips,
  listStudyProgramPins,
} from '../lib/schools/catalog';

/** Paris neighborhood hubs — seed users cluster naturally around these, not in lines. */
const PARIS_NEIGHBORHOODS = [
  { lat: 48.8867, lng: 2.3431 }, // Montmartre
  { lat: 48.8606, lng: 2.3376 }, // Louvre / 1st
  { lat: 48.853, lng: 2.3499 }, // Île de la Cité
  { lat: 48.8462, lng: 2.3372 }, // Latin Quarter
  { lat: 48.8698, lng: 2.3078 }, // Champs-Élysées
  { lat: 48.8499, lng: 2.372}, // Bastille / 11th
  { lat: 48.8738, lng: 2.295 }, // near Arc / 16th-ish
  { lat: 48.8414, lng: 2.3208 }, // Montparnasse
  { lat: 48.8635, lng: 2.361 }, // Le Marais
  { lat: 48.879, lng: 2.367 }, // Canal Saint-Martin
  { lat: 48.833, lng: 2.355 }, // 13th
  { lat: 48.892, lng: 2.344 }, // Pigalle north
];

/**
 * Demo-only seed students. Coordinates are organic scatters for the mock map.
 * Real users will get lat/lng from resolveMapLocation() via GPS / city privacy —
 * these seeded values are NOT used as a production placement algorithm.
 */
function seedExtraStudents(): UserProfile[] {
  const firstNames = [
    'Ava', 'Noah', 'Mia', 'Liam', 'Zoe', 'Ethan', 'Chloe', 'Owen', 'Grace', 'Caleb',
    'Lily', 'Henry', 'Sofia', 'Jack', 'Ella', 'Leo', 'Nora', 'Ryan', 'Aria', 'Max',
    'Ruby', 'Ian', 'Vera', 'Jude', 'Quinn', 'Parker', 'Reese', 'Skye', 'Finn', 'Jade',
  ];

  const unis = [
    'Indiana University',
    'Syracuse University',
    'UCLA',
    'University of Michigan',
    'NYU',
    'Boston University',
    'Penn State',
    'University of Texas',
    'Duke University',
  ];

  const programs = [
    'NYU in London',
    'CEA Barcelona',
    'CIEE Paris',
    'IES Paris',
    'Syracuse Florence',
  ];

  const extras: UserProfile[] = [];
  for (let i = 0; i < 220; i++) {
    const first = firstNames[i % firstNames.length];
    const last = `Student${i + 1}`;
    const isFriend = i < 12;
    const hub = PARIS_NEIGHBORHOODS[i % PARIS_NEIGHBORHOODS.length];
    // Spread within ~0.8–2.4 km of a neighborhood hub (natural clusters, not rays)
    const radiusKm = 0.8 + ((i * 17) % 17) / 10;
    const pos = scatterAround(hub.lat, hub.lng, `seed-${i}`, radiusKm);

    extras.push({
      id: `seed-${i}`,
      firstName: first,
      lastName: last,
      fullName: `${first} ${last}`,
      avatar: Object.values(avatars)[i % 8],
      homeUniversity: unis[i % unis.length],
      studyAbroadProgram: programs[i % programs.length],
      hostCity: 'Paris',
      hostCountry: 'France',
      semester: 'Fall 2026',
      countriesVisited: 2 + (i % 8),
      isFriend,
      // Mix of privacy modes for demo realism
      locationPrivacy: i % 11 === 0 ? 'exact' : 'city',
      latitude: pos.latitude,
      longitude: pos.longitude,
      locationLabel: 'Paris, France',
      passportBadges: ['France', 'Italy', 'Spain'].slice(0, 1 + (i % 3)),
      albums: [],
      posts: [],
    });
  }
  return extras;
}

export const CURRENT_USER_ID = 'user-me';

export const featuredUsers: UserProfile[] = [
  {
    id: 'user-matilda',
    firstName: 'Matilda',
    lastName: 'Shane',
    fullName: 'Matilda Shane',
    avatar: avatars.matilda,
    homeUniversity: 'CU Boulder',
    studyAbroadProgram: 'NYU in London',
    hostCity: 'London',
    hostCountry: 'United Kingdom',
    semester: 'Fall 2026',
    instagram: '@matildashane',
    bio: 'CU Boulder → NYU London. Always down for a weekend trip.',
    countriesVisited: 6,
    isFriend: true,
    locationPrivacy: 'exact',
    latitude: 48.8482,
    longitude: 2.3275,
    locationLabel: 'Paris, France',
    newPosts: 1,
    passportBadges: ['France', 'UK', 'Italy', 'Spain', 'Netherlands', 'Belgium'],
    albums: [
      {
        id: 'alb-1',
        title: 'Paris',
        cover: avatars.matilda,
        locationName: 'Paris, France',
        latitude: 48.8566,
        longitude: 2.3522,
        photos: [avatars.matilda, avatars.cole],
      },
      {
        id: 'alb-2',
        title: 'London',
        cover: avatars.cole,
        locationName: 'London, UK',
        latitude: 51.5074,
        longitude: -0.1278,
        photos: [avatars.cole],
      },
    ],
    posts: [
      {
        id: 'p1',
        image: avatars.matilda,
        locationName: 'Sacre Coeur',
        caption: 'Morning views in Montmartre',
      },
      {
        id: 'p2',
        image: avatars.cole,
        locationName: 'Seine',
        caption: 'Golden hour walks',
      },
      {
        id: 'p3',
        image: avatars.chelsea,
        locationName: 'Marais',
        caption: 'Hidden cafe gem',
      },
    ],
  },
  {
    id: 'user-cole',
    firstName: 'Cole',
    lastName: 'Brelio',
    fullName: 'Cole Brelio',
    avatar: avatars.cole,
    homeUniversity: 'Princeton',
    studyAbroadProgram: 'NYU in London',
    hostCity: 'London',
    hostCountry: 'United Kingdom',
    semester: 'Fall 2026',
    instagram: '@colebrelio',
    bio: 'Princeton abroad. Looking for travel buddies.',
    countriesVisited: 4,
    isFriend: true,
    locationPrivacy: 'exact',
    latitude: 48.8625,
    longitude: 2.365,
    locationLabel: 'Paris, France',
    newPosts: 1,
    passportBadges: ['France', 'UK', 'Germany', 'Czechia'],
    albums: [
      {
        id: 'alb-c1',
        title: 'Paris Weekend',
        cover: avatars.cole,
        locationName: 'Paris, France',
        latitude: 48.8566,
        longitude: 2.3522,
        photos: [avatars.cole],
      },
    ],
    posts: [
      {
        id: 'pc1',
        image: avatars.cole,
        locationName: 'Louvre',
        caption: 'Art day',
      },
      {
        id: 'pc2',
        image: avatars.jack,
        locationName: 'Latin Quarter',
        caption: 'Late night eats',
      },
    ],
  },
  {
    id: 'user-jack',
    firstName: 'Jack',
    lastName: 'Miller',
    fullName: 'Jack Miller',
    avatar: avatars.jack,
    homeUniversity: 'Syracuse University',
    studyAbroadProgram: 'NYU in London',
    hostCity: 'London',
    hostCountry: 'United Kingdom',
    semester: 'Fall 2026',
    countriesVisited: 3,
    isFriend: true,
    locationPrivacy: 'city',
    latitude: 51.5074,
    longitude: -0.1278,
    locationLabel: 'London, UK',
    passportBadges: ['UK', 'France', 'Spain'],
    albums: [],
    posts: [],
  },
  {
    id: 'user-luke',
    firstName: 'Luke',
    lastName: 'Harrison',
    fullName: 'Luke Harrison',
    avatar: avatars.luke,
    homeUniversity: 'Syracuse University',
    studyAbroadProgram: 'NYU in London',
    hostCity: 'London',
    hostCountry: 'United Kingdom',
    semester: 'Fall 2026',
    countriesVisited: 5,
    isFriend: true,
    locationPrivacy: 'city',
    latitude: 51.51,
    longitude: -0.13,
    locationLabel: 'London, UK',
    passportBadges: ['UK', 'France', 'Italy', 'Portugal', 'Ireland'],
    albums: [],
    posts: [],
  },
  {
    id: 'user-marcos',
    firstName: 'Marcos',
    lastName: 'Diaz',
    fullName: 'Marcos Diaz',
    avatar: avatars.marcos,
    homeUniversity: 'Indiana University',
    studyAbroadProgram: 'NYU in London',
    hostCity: 'London',
    hostCountry: 'United Kingdom',
    semester: 'Fall 2026',
    countriesVisited: 4,
    isFriend: true,
    locationPrivacy: 'city',
    latitude: 51.509,
    longitude: -0.12,
    locationLabel: 'London, UK',
    passportBadges: ['UK', 'France', 'Spain', 'Morocco'],
    albums: [],
    posts: [],
  },
  {
    id: 'user-chelsea',
    firstName: 'Chelsea',
    lastName: 'Nguyen',
    fullName: 'Chelsea Nguyen',
    avatar: avatars.chelsea,
    homeUniversity: 'UCLA',
    studyAbroadProgram: 'NYU in London',
    hostCity: 'London',
    hostCountry: 'United Kingdom',
    semester: 'Fall 2026',
    countriesVisited: 2,
    isFriend: true,
    locationPrivacy: 'city',
    latitude: 51.503,
    longitude: -0.14,
    locationLabel: 'London, UK',
    passportBadges: ['UK', 'France'],
    albums: [],
    posts: [],
  },
  {
    id: 'user-emily',
    firstName: 'Emily',
    lastName: 'Ross',
    fullName: 'Emily Ross',
    avatar: avatars.emily,
    homeUniversity: 'Boston University',
    studyAbroadProgram: 'NYU in London',
    hostCity: 'London',
    hostCountry: 'United Kingdom',
    semester: 'Fall 2026',
    countriesVisited: 3,
    isFriend: true,
    locationPrivacy: 'city',
    latitude: 51.515,
    longitude: -0.11,
    locationLabel: 'London, UK',
    passportBadges: ['UK', 'France', 'Belgium'],
    albums: [],
    posts: [],
  },
  {
    id: 'user-sebastian',
    firstName: 'Sebastian',
    lastName: 'Cole',
    fullName: 'Sebastian Cole',
    avatar: avatars.sebastian,
    homeUniversity: 'NYU',
    studyAbroadProgram: 'NYU in London',
    hostCity: 'London',
    hostCountry: 'United Kingdom',
    semester: 'Fall 2026',
    countriesVisited: 7,
    isFriend: true,
    locationPrivacy: 'city',
    latitude: 51.52,
    longitude: -0.125,
    locationLabel: 'London, UK',
    passportBadges: ['UK', 'France', 'Italy', 'Greece', 'Croatia', 'Austria', 'Germany'],
    albums: [],
    posts: [],
  },
  {
    id: 'user-mia',
    firstName: 'Mia',
    lastName: 'Park',
    fullName: 'Mia Park',
    avatar: avatars.mi,
    homeUniversity: 'University of Michigan',
    studyAbroadProgram: 'NYU in London',
    hostCity: 'London',
    hostCountry: 'United Kingdom',
    semester: 'Fall 2026',
    countriesVisited: 3,
    isFriend: true,
    locationPrivacy: 'city',
    latitude: 51.508,
    longitude: -0.135,
    locationLabel: 'London, UK',
    passportBadges: ['UK', 'France', 'Netherlands'],
    albums: [],
    posts: [],
  },
];

export const currentUser: UserProfile = {
  id: CURRENT_USER_ID,
  firstName: 'Sam',
  lastName: 'Rivera',
  fullName: 'Sam Rivera',
  avatar: avatars.currentUser,
  homeUniversity: 'Indiana University',
  studyAbroadProgram: 'NYU in London',
  hostCity: 'London',
  hostCountry: 'United Kingdom',
  semester: 'Fall 2026',
  instagram: '@samabroad',
  bio: 'IU → NYU London. Building the map of our semester.',
  countriesVisited: 5,
  isFriend: false,
  locationPrivacy: 'exact',
  latitude: 48.86,
  longitude: 2.34,
  locationLabel: 'Paris, France',
  passportBadges: ['UK', 'France', 'Spain', 'Italy', 'Portugal'],
  albums: [],
  posts: [],
};

export const allUsers: UserProfile[] = [
  currentUser,
  ...featuredUsers,
  ...seedExtraStudents(),
];

export const trips: TripPin[] = [
  {
    id: 'trip-jack-paris',
    memberIds: ['user-jack', 'user-luke', 'user-marcos'],
    members: [
      { userId: 'user-jack', firstName: 'Jack', avatar: avatars.jack },
      { userId: 'user-luke', firstName: 'Luke', avatar: avatars.luke },
      { userId: 'user-marcos', firstName: 'Marcos', avatar: avatars.marcos },
    ],
    status: 'upcoming',
    openToJoin: false,
    destinationCity: 'Paris',
    destinationCountry: 'France',
    latitude: 48.858,
    longitude: 2.345,
    dateLabel: 'Visiting Paris Friday 10/16 - Sunday 10/18',
    dateStart: '2026-10-16',
    dateEnd: '2026-10-18',
    homeBaseCity: 'London',
  },
  {
    id: 'trip-chelsea-paris',
    memberIds: ['user-chelsea', 'user-emily', 'user-sebastian', 'user-mia'],
    members: [
      { userId: 'user-chelsea', firstName: 'Chelsea', avatar: avatars.chelsea },
      { userId: 'user-emily', firstName: 'Emily', avatar: avatars.emily },
      { userId: 'user-sebastian', firstName: 'Sebastian', avatar: avatars.sebastian },
      { userId: 'user-mia', firstName: 'Mia', avatar: avatars.mi },
    ],
    status: 'planning',
    openToJoin: true,
    destinationCity: 'Paris',
    destinationCountry: 'France',
    latitude: 48.8535,
    longitude: 2.332,
    dateLabel: 'Visiting Paris TBD',
    homeBaseCity: 'London',
  },
];

export const programs: ProgramPin[] = listStudyProgramPins().map((p) => ({
  ...p,
  // Prefer real seed roster size; never invent a demo hash count.
  studentCount: getProgramStudents(p.name).length,
}));

export const filterChips: FilterChip[] = buildFilterChips();

export function getUserById(id: string): UserProfile | undefined {
  return allUsers.find((u) => u.id === id);
}

export function getProgramStudents(programName: string): UserProfile[] {
  return allUsers.filter(
    (u) =>
      u.studyAbroadProgram === programName ||
      u.studyAbroadProgram.toLowerCase().includes(programName.toLowerCase()) ||
      programName.toLowerCase().includes(u.studyAbroadProgram.toLowerCase()),
  );
}

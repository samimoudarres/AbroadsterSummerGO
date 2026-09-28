/**
 * Popular study-abroad destinations with curated landmark motifs.
 * Letter spelling always comes from displayName (never AI-generated text).
 */

export type LandmarkMotif =
  | 'duomo'
  | 'colosseum'
  | 'canal'
  | 'tower'
  | 'beach'
  | 'cove'
  | 'palace'
  | 'bridge'
  | 'castle'
  | 'mountains'
  | 'skyline'
  | 'plaza'
  | 'harbor'
  | 'temple'
  | 'cathedral'
  | 'cliff';

export type DestinationPreset = {
  id: string;
  /** Exact spelling shown on the postcard */
  displayName: string;
  /** Region / country line under the large letters (like CALIFORNIA) */
  regionLabel: string;
  aliases: string[];
  landmarks: LandmarkMotif[];
  /** Vintage postcard color accents */
  sky: [string, string];
  water: string;
  accent: string;
};

export const DESTINATION_PRESETS: DestinationPreset[] = [
  {
    id: 'florence',
    displayName: 'Florence',
    regionLabel: 'ITALY',
    aliases: ['firenze', 'florence italy'],
    landmarks: ['duomo', 'bridge', 'plaza', 'cathedral', 'tower', 'palace'],
    sky: ['#6eb4c8', '#f0c56a'],
    water: '#3a8fa8',
    accent: '#c45a2a',
  },
  {
    id: 'rome',
    displayName: 'Rome',
    regionLabel: 'ITALY',
    aliases: ['roma', 'rome italy'],
    landmarks: ['colosseum', 'plaza', 'cathedral', 'bridge', 'palace', 'temple'],
    sky: ['#7ab8d0', '#e8b85a'],
    water: '#4a9bb0',
    accent: '#b84428',
  },
  {
    id: 'milan',
    displayName: 'Milan',
    regionLabel: 'ITALY',
    aliases: ['milano', 'milan italy'],
    landmarks: ['cathedral', 'plaza', 'skyline', 'palace', 'tower', 'bridge'],
    sky: ['#8ab8c8', '#d4c48a'],
    water: '#5a9aaa',
    accent: '#8a4030',
  },
  {
    id: 'venice',
    displayName: 'Venice',
    regionLabel: 'ITALY',
    aliases: ['venezia', 'venice italy'],
    landmarks: ['canal', 'bridge', 'plaza', 'cathedral', 'harbor', 'palace'],
    sky: ['#6aa8c0', '#f2c070'],
    water: '#2e7a98',
    accent: '#c05040',
  },
  {
    id: 'ibiza',
    displayName: 'Ibiza',
    regionLabel: 'SPAIN',
    aliases: ['eivissa', 'ibiza spain'],
    landmarks: ['beach', 'cove', 'cliff', 'harbor', 'plaza', 'tower'],
    sky: ['#4aa8c8', '#f5d078'],
    water: '#1e9aaa',
    accent: '#e07040',
  },
  {
    id: 'mallorca',
    displayName: 'Mallorca',
    regionLabel: 'SPAIN',
    aliases: ['majorca', 'palma', 'mallorca spain'],
    landmarks: ['cathedral', 'cove', 'beach', 'cliff', 'harbor', 'mountains'],
    sky: ['#5ab0d0', '#f0c860'],
    water: '#20a0b0',
    accent: '#d06038',
  },
  {
    id: 'barcelona',
    displayName: 'Barcelona',
    regionLabel: 'SPAIN',
    aliases: ['bcn', 'barcelona spain'],
    landmarks: ['cathedral', 'beach', 'harbor', 'plaza', 'tower', 'skyline'],
    sky: ['#68b0c8', '#e8c070'],
    water: '#2e90a8',
    accent: '#c84838',
  },
  {
    id: 'madrid',
    displayName: 'Madrid',
    regionLabel: 'SPAIN',
    aliases: ['madrid spain'],
    landmarks: ['palace', 'plaza', 'cathedral', 'bridge', 'skyline', 'tower'],
    sky: ['#88b8c8', '#e0c080'],
    water: '#5a98a8',
    accent: '#b03828',
  },
  {
    id: 'nice',
    displayName: 'Nice',
    regionLabel: 'FRANCE',
    aliases: ['nice france', 'côte d\'azur'],
    landmarks: ['beach', 'harbor', 'plaza', 'cliff', 'cove', 'palace'],
    sky: ['#58b0d8', '#f2d070'],
    water: '#1898b8',
    accent: '#e85840',
  },
  {
    id: 'paris',
    displayName: 'Paris',
    regionLabel: 'FRANCE',
    aliases: ['paris france'],
    landmarks: ['tower', 'bridge', 'cathedral', 'plaza', 'palace', 'skyline'],
    sky: ['#90b8c8', '#d8c090'],
    water: '#4a8898',
    accent: '#a04050',
  },
  {
    id: 'london',
    displayName: 'London',
    regionLabel: 'UK',
    aliases: ['london uk', 'london england'],
    landmarks: ['bridge', 'tower', 'palace', 'cathedral', 'skyline', 'plaza'],
    sky: ['#88a8b8', '#c8b890'],
    water: '#3a7088',
    accent: '#883040',
  },
  {
    id: 'interlaken',
    displayName: 'Interlaken',
    regionLabel: 'SWITZERLAND',
    aliases: ['interlaken switzerland'],
    landmarks: ['mountains', 'cove', 'bridge', 'cliff', 'harbor', 'skyline'],
    sky: ['#70b0d8', '#e8d090'],
    water: '#2a88a8',
    accent: '#406848',
  },
  {
    id: 'budapest',
    displayName: 'Budapest',
    regionLabel: 'HUNGARY',
    aliases: ['budapest hungary'],
    landmarks: ['bridge', 'palace', 'cathedral', 'canal', 'castle', 'plaza'],
    sky: ['#78a8c0', '#e0b870'],
    water: '#3a7898',
    accent: '#984030',
  },
  {
    id: 'prague',
    displayName: 'Prague',
    regionLabel: 'CZECHIA',
    aliases: ['praha', 'prague czech'],
    landmarks: ['bridge', 'castle', 'cathedral', 'plaza', 'tower', 'palace'],
    sky: ['#80a8c0', '#d8b878'],
    water: '#3a7090',
    accent: '#884838',
  },
  {
    id: 'athens',
    displayName: 'Athens',
    regionLabel: 'GREECE',
    aliases: ['athens greece'],
    landmarks: ['temple', 'plaza', 'harbor', 'cliff', 'palace', 'skyline'],
    sky: ['#68b0d8', '#f0d080'],
    water: '#2898b8',
    accent: '#c06040',
  },
  {
    id: 'amsterdam',
    displayName: 'Amsterdam',
    regionLabel: 'NETHERLANDS',
    aliases: ['amsterdam netherlands'],
    landmarks: ['canal', 'bridge', 'plaza', 'tower', 'harbor', 'skyline'],
    sky: ['#78a8c0', '#d0b888'],
    water: '#2a6888',
    accent: '#c04838',
  },
  {
    id: 'lisbon',
    displayName: 'Lisbon',
    regionLabel: 'PORTUGAL',
    aliases: ['lisboa', 'lisbon portugal'],
    landmarks: ['harbor', 'bridge', 'plaza', 'cliff', 'palace', 'cathedral'],
    sky: ['#60b0d0', '#f0c868'],
    water: '#1e90a8',
    accent: '#d05038',
  },
  {
    id: 'dublin',
    displayName: 'Dublin',
    regionLabel: 'IRELAND',
    aliases: ['dublin ireland'],
    landmarks: ['bridge', 'castle', 'plaza', 'cathedral', 'harbor', 'skyline'],
    sky: ['#70a0b0', '#c8b888'],
    water: '#3a7080',
    accent: '#386848',
  },
];

function norm(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

export function findDestinationPreset(
  displayName: string,
): DestinationPreset | null {
  const n = norm(displayName);
  if (!n) return null;
  for (const p of DESTINATION_PRESETS) {
    if (norm(p.displayName) === n) return p;
    if (p.aliases.some((a) => norm(a) === n || n.includes(norm(a)))) return p;
  }
  // Starts-with match for "Florence, Italy"
  for (const p of DESTINATION_PRESETS) {
    if (n.startsWith(norm(p.displayName))) return p;
  }
  return null;
}

export function regionLabelFor(displayName: string): string | null {
  return findDestinationPreset(displayName)?.regionLabel ?? null;
}

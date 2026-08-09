/** Exact Figma / logo header teal — use everywhere brand teal appears. */
export const BRAND_TEAL = '#175864';

export const colors = {
  black: '#000000',
  white: '#FFFFFF',
  textMuted: '#7C7C7C',
  divider: '#E6E0D8',
  searchTrack: '#D9D9D9',
  groupAvatarBg: '#E8E8E8',
  statusGreen: '#00A603',
  statusGreenGlow: '#0FAE37',
  statusOrange: '#E08601',
  statusOrangeGlow: '#F7B104',
  statusYellow: '#E0C201',
  statusYellowGlow: '#E0C201',
  /** Primary brand teal (#175864) — CTAs, links, map accents */
  programBlue: BRAND_TEAL,
  /** Primary brand teal — stamps, highlights, active states */
  openJoin: BRAND_TEAL,
  /** Slightly lighter wash for secondary accents (still on-brand) */
  newPost: '#2A7A88',
  filterPurple: '#9B51E0',
  filterGray: '#9D9D9D',
  navInactive: 'rgba(0,0,0,0.5)',
  brandTeal: BRAND_TEAL,
  brandTealDeep: BRAND_TEAL,
  brandCream: '#F6F3EE',
  brandCoral: '#E23A3A',
  brandMint: '#E7F2F1',
  /** Filled stamp when the current user has stamped a post */
  stampActive: BRAND_TEAL,
} as const;

export const fonts = {
  regular: 'NunitoSans_400Regular',
  bold: 'NunitoSans_700Bold',
  extraBold: 'NunitoSans_800ExtraBold',
} as const;

export const statusLabels = {
  here: 'In Paris, France',
  upcoming: 'Upcoming Trip',
  planning: 'Planning a Trip',
  past: 'Past Trip',
  openToJoin: 'Open to Join!',
} as const;

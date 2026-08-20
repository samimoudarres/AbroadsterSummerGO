/**
 * Legal docs live inside the app; public HTTPS URLs are for App Store Connect.
 * Hosted copies live on the marketing site (proper HTML pages).
 */
const hostedBase =
  process.env.EXPO_PUBLIC_LEGAL_BASE_URL?.replace(/\/$/, '') ||
  'https://abroadster.vercel.app';

export const LEGAL_URLS = {
  termsPath: '/terms',
  privacyPath: '/privacy',
  supportEmail: 'samimoudarres@hotmail.com',
  /** Public URLs for App Store / Play listing fields */
  privacyUrl: `${hostedBase}/privacy`,
  termsUrl: `${hostedBase}/terms`,
  deleteAccountUrl: `${hostedBase}/delete-account`,
} as const;

/**
 * Legal docs live inside the app; public HTTPS URLs are for App Store Connect.
 * Hosted copies live under Supabase Storage public/legal.
 */
const hostedBase =
  process.env.EXPO_PUBLIC_LEGAL_BASE_URL?.replace(/\/$/, '') ||
  'https://ajwnvwvpvasxkwpfdsvo.supabase.co/storage/v1/object/public/legal';

export const LEGAL_URLS = {
  termsPath: '/terms',
  privacyPath: '/privacy',
  supportEmail: 'support@abroadster.com',
  /** Public URLs for App Store / Play listing fields */
  privacyUrl: `${hostedBase}/privacy.html`,
  termsUrl: `${hostedBase}/terms.html`,
  deleteAccountUrl: `${hostedBase}/delete-account.html`,
} as const;

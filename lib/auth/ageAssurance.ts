import { Platform } from 'react-native';

export type AgeCheckReason =
  | 'under13'
  | 'declined'
  | 'unavailable'
  | 'unknown';

export type AgeCheckResult =
  | { ok: true }
  | { ok: false; reason: AgeCheckReason; message: string };

const MIN_AGE = 13;

export const AGE_MESSAGES = {
  under13: 'You must be at least 13 years old to use Abroadster.',
  declined:
    'Share your age range with Abroadster to continue. Apple’s Age Range prompt confirms you are 13 or older.',
  unavailable:
    'Sign in to your Apple Account on this iPhone, then try again. Abroadster uses Apple Declared Age Range to confirm you are 13+.',
  unknown: 'Could not confirm your age range. Try again in a moment.',
} as const;

/** Skip a second Apple sheet in the same app session after a successful check. */
let allowedThisSession = false;
let inFlight: Promise<AgeCheckResult> | null = null;

export function markAgeAllowedThisSession(): void {
  allowedThisSession = true;
}

export function resetAgeAllowedThisSession(): void {
  allowedThisSession = false;
}

function iosMajorVersion(): number {
  if (Platform.OS !== 'ios') return 0;
  const raw = Platform.Version;
  if (typeof raw === 'number') return raw;
  const parsed = parseInt(String(raw).split('.')[0] ?? '', 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Declared Age Range needs iOS 26 + an Xcode 26-built binary.
 * TestFlight builds on current EAS Xcode still hard-crash the process when the
 * native module is invoked (JS try/catch cannot catch that). Keep disabled until
 * EAS ships Xcode 26; signup birthday (≥13) remains the age gate.
 */
function supportsDeclaredAgeRangeNative(): boolean {
  return false;
  // Re-enable when production binaries are built with Xcode 26+:
  // return Platform.OS === 'ios' && iosMajorVersion() >= 26;
}

function errorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error) {
    return String((error as { code?: string }).code || '');
  }
  return '';
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error || '');
}

/** Exported for walkthrough checks. */
export function interpretAgeRange(
  lowerBound: number | null | undefined,
  upperBound: number | null | undefined,
): AgeCheckResult {
  if (upperBound != null && upperBound < MIN_AGE) {
    return { ok: false, reason: 'under13', message: AGE_MESSAGES.under13 };
  }
  if (lowerBound != null && lowerBound < MIN_AGE) {
    return { ok: false, reason: 'under13', message: AGE_MESSAGES.under13 };
  }
  if (lowerBound != null && lowerBound >= MIN_AGE) {
    return { ok: true };
  }
  // iOS < 26 native fallback is lowerBound 18; open-ended adult is null/null or null + 13+.
  if (lowerBound == null && (upperBound == null || upperBound >= MIN_AGE)) {
    return { ok: true };
  }
  return { ok: false, reason: 'unknown', message: AGE_MESSAGES.unknown };
}

function mapThrownError(error: unknown): AgeCheckResult {
  const code = errorCode(error);
  const msg = errorMessage(error).toLowerCase();
  if (code === 'ERR_AGE_RANGE_USER_DECLINED' || msg.includes('declin')) {
    return { ok: false, reason: 'declined', message: AGE_MESSAGES.declined };
  }
  if (
    code === 'ERR_AGE_RANGE_NOT_AVAILABLE' ||
    msg.includes('not available') ||
    msg.includes('not signed')
  ) {
    return { ok: false, reason: 'unavailable', message: AGE_MESSAGES.unavailable };
  }
  return { ok: false, reason: 'unknown', message: AGE_MESSAGES.unknown };
}

async function requestIosAgeRange(): Promise<AgeCheckResult> {
  try {
    // Dynamic import — never load the native module during cold start on iOS < 26.
    const AgeRange = await import('expo-age-range');
    const range = await Promise.race([
      AgeRange.requestAgeRangeAsync({ threshold1: MIN_AGE }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('age-range-timeout')), 3500),
      ),
    ]);
    const result = interpretAgeRange(range.lowerBound, range.upperBound);
    if (result.ok) markAgeAllowedThisSession();
    return result;
  } catch (error) {
    // Fail open on timeouts / native module faults so launch never hard-locks.
    if (errorMessage(error).includes('age-range-timeout')) {
      markAgeAllowedThisSession();
      return { ok: true };
    }
    return mapThrownError(error);
  }
}

/**
 * Confirm the user may use social features (13+).
 * iOS 26+: Apple Declared Age Range (dynamic import).
 * Older iOS / Android / web: allow — birthday gate already covers signup.
 */
export async function ensureAgeAllowedForSocial(): Promise<AgeCheckResult> {
  if (allowedThisSession) return { ok: true };
  if (Platform.OS !== 'ios') return { ok: true };
  if (!supportsDeclaredAgeRangeNative()) {
    markAgeAllowedThisSession();
    return { ok: true };
  }
  if (inFlight) return inFlight;

  inFlight = requestIosAgeRange().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

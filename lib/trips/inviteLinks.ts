import type { ChatTrip } from '../../data/chatTypes';
import { shortCalendarRange } from './dates';

/** App Store listing for Abroadster (ASC App Apple ID). */
export const APP_STORE_URL =
  'https://apps.apple.com/app/id6800081262';

const LEGAL_BASE = (
  process.env.EXPO_PUBLIC_LEGAL_BASE_URL ||
  'https://ajwnvwvpvasxkwpfdsvo.supabase.co/storage/v1/object/public/legal'
).replace(/\/$/, '');

/** Custom scheme — opens Abroadster when installed. */
export function tripInviteDeepLink(token: string): string {
  return `abroadster://trip/${encodeURIComponent(token)}`;
}

/**
 * HTTPS smart link: opens the app when installed, otherwise the App Store.
 * Hosted at legal bucket invite.html (see store/web/invite.html).
 */
export function tripInviteHttpsLink(token: string): string {
  return `${LEGAL_BASE}/invite.html?t=${encodeURIComponent(token)}`;
}

/** Public share URL used in copy / Messages (HTTPS so it works in SMS). */
export function tripInviteShareUrl(trip: ChatTrip): string {
  const token = trip.inviteToken ?? trip.id;
  return tripInviteHttpsLink(token);
}

export function buildTripInviteShareMessage(opts: {
  inviterName: string;
  trip: ChatTrip;
}): string {
  const { inviterName, trip } = opts;
  const city = trip.destinationCity || 'a trip';
  const country = trip.destinationCountry?.trim();
  const place = country ? `${city}, ${country}` : city;
  const dates =
    trip.dateStart && trip.dateEnd
      ? shortCalendarRange(trip.dateStart, trip.dateEnd)
      : null;
  const link = tripInviteShareUrl(trip);
  const who = inviterName.trim() || 'A friend';
  const lines = [
    `${who} is inviting you to join their trip to ${place} on Abroadster.`,
  ];
  if (dates) lines.push(`Dates: ${dates}`);
  lines.push('');
  lines.push(`Open the invite: ${link}`);
  lines.push('');
  lines.push(
    `Don’t have Abroadster yet? Download it free: ${APP_STORE_URL}`,
  );
  return lines.join('\n');
}

/** Parse trip invite token from abroadster:// or HTTPS invite URLs. */
export function parseTripInviteTokenFromUrl(url: string): string | null {
  if (!url) return null;
  try {
    const trimmed = url.trim();
    // abroadster://trip/TOKEN or abroadster:///trip/TOKEN
    const scheme = trimmed.match(
      /^abroadster:\/\/(?:\/)?trip\/([^/?#]+)/i,
    );
    if (scheme?.[1]) return decodeURIComponent(scheme[1]);

    // expo-dev / linking may produce exp://.../--/trip/TOKEN
    const path = trimmed.match(/\/trip\/([^/?#]+)/i);
    if (path?.[1] && /invite\.html/i.test(trimmed) === false) {
      // Prefer query param for invite.html
      if (!/invite\.html/i.test(trimmed)) {
        const tok = decodeURIComponent(path[1]);
        if (tok && tok !== 'preview') return tok;
      }
    }

    const q = trimmed.match(/[?&#]t=([^&#]+)/i);
    if (q?.[1]) return decodeURIComponent(q[1]);
  } catch {
    // ignore
  }
  return null;
}

/**
 * Official Abroadster product account — special cased in profile + onboarding feed.
 */
export const ABROADSTER_OFFICIAL_ID = 'fa989cf9-6770-48d3-a715-dd095c6dee38';

/** Hardcoded cities stat on the official profile header. */
export const ABROADSTER_OFFICIAL_CITIES = 197;

/**
 * Curated onboarding posts (create trip → post to feed → join everyone).
 * Order is intentional for the first-3 home-feed visits.
 */
export const ABROADSTER_CURATED_POST_IDS = {
  createTrip: 'adfe5362-4d8d-4086-aace-916d91012970',
  makePost: '9c6daa39-9472-4cc6-880d-05edc73ad073',
  joinEveryone: '48fdba81-c90c-4d9a-8ac4-204718aab1dd',
} as const;

export function isAbroadsterOfficial(
  userId: string | null | undefined,
): boolean {
  return Boolean(userId && userId === ABROADSTER_OFFICIAL_ID);
}

/**
 * Shared invite copy for the welcome notification + share sheet.
 */
import { APP_STORE_URL } from '../trips/inviteLinks';

export const INVITE_FRIENDS_KIND = 'invite_friends';

export const INVITE_SHARE_MESSAGE =
  `Let’s make our next trip on Abroadster! Sign up and check out my profile! ${APP_STORE_URL}`;

export function inviteNotificationSeed(userId: string) {
  return {
    user_id: userId,
    kind: INVITE_FRIENDS_KIND,
    title: 'Invite your friends',
    body: 'Create your first trip and bring your people onto Abroadster.',
    data: {
      action: 'invite_friends',
      appStoreUrl: APP_STORE_URL,
    },
  };
}

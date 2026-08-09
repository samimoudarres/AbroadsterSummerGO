/** In-memory + AsyncStorage last-opened community chat (survives reload). */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ChannelSlug } from '../../data/chatTypes';

const STORAGE_KEY = 'abroadster.chat.lastSession.v1';

export type LastChatSession =
  | { type: 'community'; communityId: string; slug: ChannelSlug }
  | { type: 'dm'; threadId: string; otherUserId: string }
  | { type: 'trip'; channelId: string; tripId: string; title: string };

let lastChat: LastChatSession | null = null;
let hydrated = false;

function isValidSession(value: unknown): value is LastChatSession {
  if (!value || typeof value !== 'object') return false;
  const v = value as LastChatSession;
  if (v.type === 'community') {
    return Boolean(v.communityId && v.slug);
  }
  if (v.type === 'dm') {
    return Boolean(v.threadId && v.otherUserId);
  }
  if (v.type === 'trip') {
    return Boolean(v.channelId && v.tripId);
  }
  return false;
}

export async function hydrateLastChatSession(): Promise<LastChatSession | null> {
  if (hydrated) return lastChat;
  hydrated = true;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return lastChat;
    const parsed = JSON.parse(raw);
    if (isValidSession(parsed)) lastChat = parsed;
  } catch {
    // ignore corrupt storage
  }
  return lastChat;
}

export function getLastChatSession(): LastChatSession | null {
  return lastChat;
}

export function setLastChatSession(next: LastChatSession | null): void {
  lastChat = next;
  void (async () => {
    try {
      if (!next) await AsyncStorage.removeItem(STORAGE_KEY);
      else await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  })();
}

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { LocalAccount } from './types';

const ACCOUNTS_KEY = 'abroadster.auth.localAccounts.v1';
const SESSION_KEY = 'abroadster.auth.localSession.v1';
const REMEMBER_KEY = 'abroadster.auth.remember.v1';
const RECOVERY_KEY = 'abroadster.auth.passwordRecovery.v1';

export async function loadLocalAccounts(): Promise<LocalAccount[]> {
  try {
    const raw = await AsyncStorage.getItem(ACCOUNTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveLocalAccounts(accounts: LocalAccount[]): Promise<void> {
  await AsyncStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}

export async function getLocalSessionId(): Promise<string | null> {
  try {
    return (await AsyncStorage.getItem(SESSION_KEY)) || null;
  } catch {
    return null;
  }
}

export async function setLocalSessionId(userId: string | null): Promise<void> {
  if (!userId) {
    await AsyncStorage.removeItem(SESSION_KEY);
    return;
  }
  await AsyncStorage.setItem(SESSION_KEY, userId);
}

/** Remember login identifier only — never persist passwords. */
export type RememberedLogin = {
  identifier: string;
};

export async function getRememberedLogin(): Promise<RememberedLogin | null> {
  try {
    const raw = await AsyncStorage.getItem(REMEMBER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { identifier?: string; password?: string };
    const identifier = String(parsed.identifier ?? '').trim();
    if (!identifier) return null;
    // Migrate legacy entries that stored a plaintext password
    if (parsed.password) {
      await setRememberedLogin({ identifier });
    }
    return { identifier };
  } catch {
    return null;
  }
}

export async function setRememberedLogin(
  value: RememberedLogin | null,
): Promise<void> {
  if (!value?.identifier?.trim()) {
    await AsyncStorage.removeItem(REMEMBER_KEY);
    return;
  }
  await AsyncStorage.setItem(
    REMEMBER_KEY,
    JSON.stringify({ identifier: value.identifier.trim() }),
  );
}

/** True while the user is mid email-recovery (must not enter AppShell). */
export async function getPasswordRecoveryPending(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(RECOVERY_KEY)) === '1';
  } catch {
    return false;
  }
}

export async function setPasswordRecoveryPending(
  pending: boolean,
): Promise<void> {
  if (!pending) {
    await AsyncStorage.removeItem(RECOVERY_KEY);
    return;
  }
  await AsyncStorage.setItem(RECOVERY_KEY, '1');
}

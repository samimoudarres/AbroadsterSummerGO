import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import * as Linking from 'expo-linking';
import { chatRepo, initChat } from '../chat/repository';
import type { AuthSession, SignupDraft } from './types';
import {
  restoreSession,
  signInWithIdentifier,
  signOut as authSignOut,
  signUpWithDraft,
  deleteMyAccount as authDeleteMyAccount,
} from './authService';
import {
  getPasswordRecoveryPending,
  getRememberedLogin,
  setPasswordRecoveryPending,
} from './authStorage';
import { consumePasswordRecoveryUrl } from './passwordReset';
import { resetAgeAllowedThisSession } from './ageAssurance';
import { hasSupabase, supabase } from '../supabase';
import {
  requestLaunchPermissions,
  requestAndRegisterPush,
} from '../push/permissions';
import { startNotificationRealtimeBridge } from '../push/realtimeBridge';

/** Join home + abroad school chats as soon as a live session exists. */
async function ensureSchoolChats(): Promise<void> {
  try {
    await initChat();
    await chatRepo.getMyCommunities();
  } catch {
    // Profile/schools may still be incomplete; Community Retry covers this
  }
}

type AuthContextValue = {
  ready: boolean;
  session: AuthSession | null;
  /** Mid email-link password recovery — stay on auth UI, not AppShell. */
  passwordRecovery: boolean;
  beginPasswordRecovery: () => void;
  clearPasswordRecovery: () => Promise<void>;
  /** After signup: land on map with Europe + home-uni filter + suggested overlay. */
  openMapOnboardingAfterAuth: boolean;
  clearOpenMapOnboardingAfterAuth: () => void;
  signUp: (draft: SignupDraft) => Promise<void>;
  signIn: (
    identifier: string,
    password: string,
    remember: boolean,
  ) => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  rememberedIdentifier: string;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [openMapOnboardingAfterAuth, setOpenMapOnboardingAfterAuth] =
    useState(false);
  const [rememberedIdentifier, setRememberedIdentifier] = useState('');
  const stopPushBridge = useRef<(() => void) | null>(null);

  const beginPasswordRecovery = useCallback(() => {
    setPasswordRecovery(true);
  }, []);

  const clearPasswordRecovery = useCallback(async () => {
    await setPasswordRecoveryPending(false);
    setPasswordRecovery(false);
    if (hasSupabase && supabase) {
      try {
        // Drop recovery session so it can't open AppShell
        await supabase.auth.signOut({ scope: 'local' });
      } catch {
        // ignore
      }
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const remembered = await getRememberedLogin();
        if (!cancelled && remembered) {
          setRememberedIdentifier(remembered.identifier || '');
        }
        const recovery = await getPasswordRecoveryPending();
        if (!cancelled && recovery) {
          setPasswordRecovery(true);
        }
        const restored = recovery ? null : await restoreSession();
        if (!cancelled) {
          setSession(restored);
          setReady(true);
        }
        if (!cancelled) {
          if (restored) {
            await ensureSchoolChats();
            void requestAndRegisterPush();
          } else {
            await initChat();
          }
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Deep links from password-reset emails
  useEffect(() => {
    let alive = true;
    const handleUrl = async (url: string | null) => {
      if (!url || !alive) return;
      const ok = await consumePasswordRecoveryUrl(url);
      if (ok && alive) {
        setPasswordRecovery(true);
        setSession(null);
      }
    };
    void Linking.getInitialURL().then((url) => void handleUrl(url));
    const sub = Linking.addEventListener('url', ({ url }) => {
      void handleUrl(url);
    });
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  useEffect(() => {
    stopPushBridge.current?.();
    stopPushBridge.current = null;
    if (!session?.userId) return;
    stopPushBridge.current = startNotificationRealtimeBridge(session.userId);
    return () => {
      stopPushBridge.current?.();
      stopPushBridge.current = null;
    };
  }, [session?.userId]);

  const signUp = useCallback(async (draft: SignupDraft) => {
    const s = await signUpWithDraft(draft);
    await ensureSchoolChats();
    await requestLaunchPermissions();
    setSession(s);
    setOpenMapOnboardingAfterAuth(true);
  }, []);

  const signIn = useCallback(
    async (identifier: string, password: string, remember: boolean) => {
      await setPasswordRecoveryPending(false);
      setPasswordRecovery(false);
      const s = await signInWithIdentifier(identifier, password, remember);
      await ensureSchoolChats();
      void requestAndRegisterPush();
      setSession(s);
      setOpenMapOnboardingAfterAuth(false);
    },
    [],
  );

  const signOut = useCallback(async () => {
    stopPushBridge.current?.();
    stopPushBridge.current = null;
    try {
      await authSignOut();
    } finally {
      // Always leave the signed-in shell, even if network sign-out fails
      setSession(null);
      setOpenMapOnboardingAfterAuth(false);
      resetAgeAllowedThisSession();
      await setPasswordRecoveryPending(false);
      setPasswordRecovery(false);
    }
  }, []);

  const deleteAccount = useCallback(async () => {
    stopPushBridge.current?.();
    stopPushBridge.current = null;
    try {
      await authDeleteMyAccount();
    } finally {
      setSession(null);
      setOpenMapOnboardingAfterAuth(false);
      resetAgeAllowedThisSession();
      await setPasswordRecoveryPending(false);
      setPasswordRecovery(false);
    }
  }, []);

  const clearOpenMapOnboardingAfterAuth = useCallback(() => {
    setOpenMapOnboardingAfterAuth(false);
  }, []);

  const value = useMemo(
    () => ({
      ready,
      session,
      passwordRecovery,
      beginPasswordRecovery,
      clearPasswordRecovery,
      openMapOnboardingAfterAuth,
      clearOpenMapOnboardingAfterAuth,
      signUp,
      signIn,
      signOut,
      deleteAccount,
      rememberedIdentifier,
    }),
    [
      ready,
      session,
      passwordRecovery,
      beginPasswordRecovery,
      clearPasswordRecovery,
      openMapOnboardingAfterAuth,
      clearOpenMapOnboardingAfterAuth,
      signUp,
      signIn,
      signOut,
      deleteAccount,
      rememberedIdentifier,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

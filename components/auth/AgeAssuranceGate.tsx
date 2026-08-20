import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { BRAND_TEAL, colors, fonts } from '../../constants/theme';
import {
  ensureAgeAllowedForSocial,
  type AgeCheckReason,
} from '../../lib/auth/ageAssurance';
import { useAuth } from '../../lib/auth/AuthContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type GateState =
  | { kind: 'checking' }
  | { kind: 'allowed' }
  | { kind: 'retry'; reason: AgeCheckReason; message: string }
  | { kind: 'blocked' };

/**
 * Runs Apple Declared Age Range before social tabs so demo login still shows Age Assurance.
 */
export function AgeAssuranceGate({ children }: { children: React.ReactNode }) {
  const { signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const [gate, setGate] = useState<GateState>({ kind: 'checking' });
  const [busy, setBusy] = useState(false);

  const runCheck = useCallback(async () => {
    setGate({ kind: 'checking' });
    try {
      const result = await ensureAgeAllowedForSocial();
      if (result.ok) {
        setGate({ kind: 'allowed' });
        return;
      }
      if (result.reason === 'under13') {
        setGate({ kind: 'blocked' });
        return;
      }
      setGate({
        kind: 'retry',
        reason: result.reason,
        message: result.message,
      });
    } catch {
      setGate({
        kind: 'retry',
        reason: 'unknown',
        message: 'Could not confirm your age range. Try again in a moment.',
      });
    }
  }, []);

  useEffect(() => {
    void runCheck();
  }, [runCheck]);

  const onLogOut = async () => {
    setBusy(true);
    try {
      await signOut();
    } finally {
      setBusy(false);
    }
  };

  if (gate.kind === 'allowed') {
    return <>{children}</>;
  }

  if (gate.kind === 'checking') {
    return (
      <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <ActivityIndicator color={colors.white} size="large" />
        <Text style={styles.busyLabel}>Confirming age range…</Text>
      </View>
    );
  }

  const title =
    gate.kind === 'blocked'
      ? 'Abroadster is 13+'
      : 'Age verification needed';
  const body =
    gate.kind === 'blocked'
      ? 'You must be at least 13 years old to use Abroadster. Social features (map, feed, chat, and trips) are not available.'
      : gate.message;

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
      {gate.kind === 'retry' ? (
        <Pressable
          style={[styles.btn, busy && styles.btnDisabled]}
          onPress={() => void runCheck()}
          disabled={busy}
        >
          <Text style={styles.btnText}>Try again</Text>
        </Pressable>
      ) : null}
      <Pressable
        style={[styles.btnGhost, busy && styles.btnDisabled]}
        onPress={() => void onLogOut()}
        disabled={busy}
      >
        {busy ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <Text style={styles.btnGhostText}>Log out</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BRAND_TEAL,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  busyLabel: {
    marginTop: 16,
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.white,
  },
  title: {
    fontFamily: fonts.extraBold,
    fontSize: 26,
    color: colors.white,
    textAlign: 'center',
    marginBottom: 12,
  },
  body: {
    fontFamily: fonts.regular,
    fontSize: 16,
    lineHeight: 24,
    color: 'rgba(255,255,255,0.92)',
    textAlign: 'center',
    marginBottom: 28,
  },
  btn: {
    backgroundColor: colors.white,
    borderRadius: 28,
    paddingVertical: 14,
    paddingHorizontal: 28,
    minWidth: 220,
    alignItems: 'center',
    marginBottom: 12,
  },
  btnText: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: BRAND_TEAL,
  },
  btnGhost: {
    borderRadius: 28,
    paddingVertical: 14,
    paddingHorizontal: 28,
    minWidth: 220,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.7)',
  },
  btnGhostText: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.white,
  },
  btnDisabled: {
    opacity: 0.5,
  },
});

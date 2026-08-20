import React, { Suspense, lazy } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { AuthRoot } from '../components/auth/AuthRoot';
import { AgeAssuranceGate } from '../components/auth/AgeAssuranceGate';
import { useAuth } from '../lib/auth/AuthContext';
import { BRAND_TEAL } from '../constants/theme';

/** Lazy-load heavy native shell (maps / bottom-sheet) so login cold-start stays light. */
const AppShell = lazy(() =>
  import('../components/shell/AppShell').then((m) => ({ default: m.AppShell })),
);

function BootSpinner({ dark }: { dark?: boolean }) {
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: dark ? BRAND_TEAL : '#fff',
      }}
    >
      <ActivityIndicator color={dark ? '#fff' : BRAND_TEAL} size="large" />
    </View>
  );
}

export default function Index() {
  const { ready, session, passwordRecovery } = useAuth();

  if (!ready) {
    return <BootSpinner dark />;
  }

  // Recovery sessions must stay on auth UI until a new password is saved
  if (!session || passwordRecovery) {
    return <AuthRoot />;
  }

  return (
    <Suspense fallback={<BootSpinner dark />}>
      <AgeAssuranceGate>
        <AppShell />
      </AgeAssuranceGate>
    </Suspense>
  );
}

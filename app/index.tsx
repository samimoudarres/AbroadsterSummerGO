import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { AppShell } from '../components/shell/AppShell';
import { AuthRoot } from '../components/auth/AuthRoot';
import { useAuth } from '../lib/auth/AuthContext';
import { BRAND_TEAL } from '../constants/theme';

export default function Index() {
  const { ready, session, passwordRecovery } = useAuth();

  if (!ready) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: BRAND_TEAL,
        }}
      >
        <ActivityIndicator color="#fff" size="large" />
      </View>
    );
  }

  // Recovery sessions must stay on auth UI until a new password is saved
  if (!session || passwordRecovery) {
    return <AuthRoot />;
  }

  return <AppShell />;
}

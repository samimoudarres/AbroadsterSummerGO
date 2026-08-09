import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack } from 'expo-router';
import {
  useFonts,
  NunitoSans_400Regular,
  NunitoSans_700Bold,
  NunitoSans_800ExtraBold,
} from '@expo-google-fonts/nunito-sans';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PhoneShell } from '../components/layout/PhoneShell';
import { AuthProvider } from '../lib/auth/AuthContext';

export default function RootLayout() {
  const [loaded] = useFonts({
    NunitoSans_400Regular,
    NunitoSans_700Bold,
    NunitoSans_800ExtraBold,
  });

  if (!loaded) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <PhoneShell>
          <StatusBar style="dark" />
          <Stack screenOptions={{ headerShown: false }} />
        </PhoneShell>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

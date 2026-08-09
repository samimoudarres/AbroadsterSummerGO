import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { useAuth } from '../../lib/auth/AuthContext';
import { consumePasswordRecoveryUrl } from '../../lib/auth/passwordReset';
import { BRAND_TEAL } from '../../constants/theme';

/**
 * Landing route for Supabase recovery emails (`abroadster://auth/reset-password`
 * or https web). Consumes tokens, then returns to `/` where AuthRoot shows
 * the new-password form.
 */
export default function AuthResetPasswordRoute() {
  const router = useRouter();
  const { beginPasswordRecovery } = useAuth();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const url = await Linking.getInitialURL();
      if (url) {
        const ok = await consumePasswordRecoveryUrl(url);
        if (ok) beginPasswordRecovery();
      }
      if (typeof window !== 'undefined' && window.location?.href) {
        const ok = await consumePasswordRecoveryUrl(window.location.href);
        if (ok) beginPasswordRecovery();
      }
      if (!cancelled) {
        router.replace('/');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router, beginPasswordRecovery]);

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

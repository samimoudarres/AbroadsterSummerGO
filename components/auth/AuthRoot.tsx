import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';
import { useAuth } from '../../lib/auth/AuthContext';
import type { AuthScreen } from '../../lib/auth/types';
import { BRAND_TEAL } from '../../constants/theme';
import { WelcomeScreen } from './WelcomeScreen';
import { LoginScreen } from './LoginScreen';
import { SignupFlow } from './SignupFlow';
import { ForgotPasswordScreen } from './ForgotPasswordScreen';
import { ResetPasswordScreen } from './ResetPasswordScreen';

/** Unauthenticated stack: welcome → login | create account | password reset. */
export function AuthRoot() {
  const {
    ready,
    rememberedIdentifier,
    passwordRecovery,
    clearPasswordRecovery,
  } = useAuth();
  const [screen, setScreen] = useState<AuthScreen>('welcome');
  const [loginBanner, setLoginBanner] = useState<string | null>(null);
  const [forgotIdentifier, setForgotIdentifier] = useState('');

  useEffect(() => {
    if (passwordRecovery) {
      setScreen('reset-password');
    }
  }, [passwordRecovery]);

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

  if (screen === 'login') {
    return (
      <LoginScreen
        onBack={() => {
          setLoginBanner(null);
          setScreen('welcome');
        }}
        onGoCreate={() => {
          setLoginBanner(null);
          setScreen('signup');
        }}
        onForgotPassword={() => {
          setForgotIdentifier(rememberedIdentifier || '');
          setScreen('forgot-password');
        }}
        banner={loginBanner}
      />
    );
  }
  if (screen === 'signup') {
    return <SignupFlow onBackToWelcome={() => setScreen('welcome')} />;
  }
  if (screen === 'forgot-password') {
    return (
      <ForgotPasswordScreen
        initialIdentifier={forgotIdentifier}
        onBack={() => setScreen('login')}
        onDone={() => {
          setLoginBanner('Password updated. Log in with your new password.');
          setScreen('login');
          Alert.alert(
            'Password updated',
            'You can log in with your new password now.',
          );
        }}
      />
    );
  }
  if (screen === 'reset-password') {
    return (
      <ResetPasswordScreen
        onBack={() => {
          void clearPasswordRecovery();
          setScreen('login');
        }}
        onDone={() => {
          void clearPasswordRecovery();
          setLoginBanner('Password updated. Log in with your new password.');
          setScreen('login');
          Alert.alert(
            'Password updated',
            'You can log in with your new password now.',
          );
        }}
      />
    );
  }
  return (
    <WelcomeScreen
      onCreateAccount={() => setScreen('signup')}
      onLogin={() => setScreen('login')}
    />
  );
}

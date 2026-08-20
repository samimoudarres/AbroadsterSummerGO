import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { colors } from '../../constants/theme';
import { requestPasswordReset } from '../../lib/auth/passwordReset';
import { AuthStepHeader } from './AuthStepHeader';
import { authStyles as s } from './authStyles';

interface ForgotPasswordScreenProps {
  initialIdentifier?: string;
  onBack: () => void;
  onDone: () => void;
}

type Step = 'identifier' | 'email_sent';

export function ForgotPasswordScreen({
  initialIdentifier = '',
  onBack,
  onDone,
}: ForgotPasswordScreenProps) {
  const [step, setStep] = useState<Step>('identifier');
  const [identifier, setIdentifier] = useState(initialIdentifier);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onContinueIdentifier = async () => {
    setError(null);
    const raw = identifier.trim();
    if (!raw) {
      setError('Enter the phone or email on your account.');
      return;
    }

    setBusy(true);
    try {
      await requestPasswordReset(raw);
      setStep('email_sent');
    } catch (e: any) {
      setError(e?.message || 'Could not send reset email.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={s.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <AuthStepHeader
        onBack={() => {
          if (step === 'identifier') onBack();
          else {
            setError(null);
            setStep('identifier');
          }
        }}
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={s.stepBody}>
          {step === 'identifier' ? (
            <>
              <Text style={s.title}>Forgot password?</Text>
              <Text style={s.subtitle}>
                Enter the phone number or email on your account. If an account
                exists, we’ll send a reset link to the email on your profile.
              </Text>

              <Text style={s.label}>Phone or email</Text>
              <TextInput
                style={s.input}
                value={identifier}
                onChangeText={setIdentifier}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                placeholder="Phone number or email"
                placeholderTextColor={colors.textMuted}
              />
              {error ? <Text style={s.error}>{error}</Text> : null}
            </>
          ) : null}

          {step === 'email_sent' ? (
            <>
              <Text style={s.title}>Check your email</Text>
              <Text style={s.subtitle}>
                If an account exists for{' '}
                <Text style={{ fontWeight: '700', color: colors.black }}>
                  {identifier.trim()}
                </Text>
                , we sent a password reset link to the email on your profile.
                Open it on this device, then choose a new password.
              </Text>
              <Text style={[s.muted, { marginBottom: 16, lineHeight: 20 }]}>
                The link expires after a while. Didn’t get it? Check spam, or try
                again in a few minutes.
              </Text>
            </>
          ) : null}
        </View>
      </ScrollView>

      <View style={s.footer}>
        {step === 'identifier' ? (
          <Pressable
            style={[s.primaryBtn, busy && s.primaryBtnDisabled]}
            onPress={() => void onContinueIdentifier()}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={s.primaryBtnText}>Continue</Text>
            )}
          </Pressable>
        ) : null}

        {step === 'email_sent' ? (
          <Pressable style={s.primaryBtn} onPress={onDone}>
            <Text style={s.primaryBtnText}>Back to log in</Text>
          </Pressable>
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );
}

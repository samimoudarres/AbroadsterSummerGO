import React, { useMemo, useState } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../constants/theme';
import { hasSupabase } from '../../lib/supabase';
import {
  detectResetMethod,
  resetPasswordWithIdentity,
  sendPasswordResetEmail,
} from '../../lib/auth/passwordReset';
import { AuthStepHeader } from './AuthStepHeader';
import { BirthdayPicker, defaultBirthday } from './BirthdayPicker';
import { authStyles as s } from './authStyles';

interface ForgotPasswordScreenProps {
  initialIdentifier?: string;
  onBack: () => void;
  onDone: () => void;
}

type Step = 'identifier' | 'email_sent' | 'identity';

export function ForgotPasswordScreen({
  initialIdentifier = '',
  onBack,
  onDone,
}: ForgotPasswordScreenProps) {
  const [step, setStep] = useState<Step>('identifier');
  const [identifier, setIdentifier] = useState(initialIdentifier);
  const [birthday, setBirthday] = useState(defaultBirthday());
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const method = useMemo(
    () => detectResetMethod(identifier),
    [identifier],
  );

  const onContinueIdentifier = async () => {
    setError(null);
    const raw = identifier.trim();
    if (!raw) {
      setError('Enter the phone or email on your account.');
      return;
    }

    if (method === 'identity' || !hasSupabase) {
      setStep('identity');
      return;
    }

    setBusy(true);
    try {
      await sendPasswordResetEmail(raw);
      setStep('email_sent');
    } catch (e: any) {
      const msg = String(e?.message || '');
      if (msg === 'LOCAL_IDENTITY_RESET') {
        setStep('identity');
        return;
      }
      // If email send fails, fall back to birthday verification so users aren't stuck
      setStep('identity');
      setError(
        msg.includes('misconfigured')
          ? msg
          : 'Couldn’t send email — verify with your birthday instead.',
      );
    } finally {
      setBusy(false);
    }
  };

  const onSubmitIdentity = async () => {
    setError(null);
    setBusy(true);
    try {
      await resetPasswordWithIdentity({
        identifier,
        birthday,
        newPassword: password,
        confirmPassword: confirm,
      });
      onDone();
    } catch (e: any) {
      setError(e?.message || 'Could not reset password.');
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
                Enter the phone number or email on your account. We’ll help you
                set a new password.
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
                , we sent a link to reset your password. Open it on this device,
                then choose a new password.
              </Text>
              <Text style={[s.muted, { marginBottom: 16, lineHeight: 20 }]}>
                The link expires after a while. Didn’t get it? Check spam, or
                reset with your birthday instead.
              </Text>
              <Pressable
                onPress={() => {
                  setError(null);
                  setStep('identity');
                }}
              >
                <Text style={s.link}>Use birthday instead</Text>
              </Pressable>
            </>
          ) : null}

          {step === 'identity' ? (
            <>
              <Text style={s.title}>Verify it’s you</Text>
              <Text style={s.subtitle}>
                Confirm the birthday on your account, then choose a new
                password.
              </Text>

              <Text style={s.label}>Account</Text>
              <Text
                style={[
                  s.input,
                  { color: colors.textMuted, paddingVertical: 14 },
                ]}
              >
                {identifier.trim()}
              </Text>

              <Text style={s.label}>Birthday</Text>
              <View style={{ marginBottom: 8 }}>
                <BirthdayPicker value={birthday} onChange={setBirthday} />
              </View>

              <Text style={s.label}>New password</Text>
              <View style={{ position: 'relative' }}>
                <TextInput
                  style={[s.input, { paddingRight: 48 }]}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPw}
                  placeholder="At least 6 characters"
                  placeholderTextColor={colors.textMuted}
                />
                <Pressable
                  onPress={() => setShowPw((v) => !v)}
                  style={{ position: 'absolute', right: 14, top: 14 }}
                  hitSlop={8}
                >
                  <Ionicons
                    name={showPw ? 'eye-off-outline' : 'eye-outline'}
                    size={22}
                    color={colors.textMuted}
                  />
                </Pressable>
              </View>

              <Text style={s.label}>Confirm password</Text>
              <TextInput
                style={s.input}
                value={confirm}
                onChangeText={setConfirm}
                secureTextEntry={!showPw}
                placeholder="Re-enter new password"
                placeholderTextColor={colors.textMuted}
              />
              {error ? <Text style={s.error}>{error}</Text> : null}
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

        {step === 'identity' ? (
          <Pressable
            style={[s.primaryBtn, busy && s.primaryBtnDisabled]}
            onPress={() => void onSubmitIdentity()}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={s.primaryBtnText}>Reset password</Text>
            )}
          </Pressable>
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );
}

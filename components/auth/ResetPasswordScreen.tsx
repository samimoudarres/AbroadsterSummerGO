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
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../constants/theme';
import { completePasswordRecovery } from '../../lib/auth/passwordReset';
import { AuthStepHeader } from './AuthStepHeader';
import { authStyles as s } from './authStyles';

interface ResetPasswordScreenProps {
  onBack: () => void;
  onDone: () => void;
}

/** Shown after the user opens a recovery link from email. */
export function ResetPasswordScreen({
  onBack,
  onDone,
}: ResetPasswordScreenProps) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async () => {
    setError(null);
    setBusy(true);
    try {
      await completePasswordRecovery(password, confirm);
      onDone();
    } catch (e: any) {
      setError(e?.message || 'Could not update password.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={s.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <AuthStepHeader onBack={onBack} />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
      >
      <View style={s.stepBody}>
        <Text style={s.title}>Choose a new password</Text>
        <Text style={s.subtitle}>
          You’re resetting from your email link. Pick a new password, then log
          in.
        </Text>

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
      </View>
      </ScrollView>

      <View style={s.footer}>
        <Pressable
          style={[s.primaryBtn, busy && s.primaryBtnDisabled]}
          onPress={() => void onSubmit()}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={s.primaryBtnText}>Save password</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

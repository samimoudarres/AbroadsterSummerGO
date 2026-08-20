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
import { useAuth } from '../../lib/auth/AuthContext';
import { BRAND_TEAL, colors } from '../../constants/theme';
import { AuthStepHeader } from './AuthStepHeader';
import { authStyles as s } from './authStyles';

interface LoginScreenProps {
  onBack: () => void;
  onGoCreate: () => void;
  onForgotPassword: () => void;
  banner?: string | null;
}

export function LoginScreen({
  onBack,
  onGoCreate,
  onForgotPassword,
  banner,
}: LoginScreenProps) {
  const { signIn, rememberedIdentifier } = useAuth();
  const [identifier, setIdentifier] = useState(rememberedIdentifier);
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(Boolean(rememberedIdentifier));
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async () => {
    setError(null);
    setBusy(true);
    try {
      await signIn(identifier, password, remember);
    } catch (e: any) {
      setError(e?.message || 'Could not log in.');
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
        <Text style={s.title}>Log in</Text>
        <Text style={s.subtitle}>
          Use your phone number, email, or student email and password.
        </Text>

        {banner ? (
          <Text
            style={[
              s.muted,
              {
                color: BRAND_TEAL,
                marginBottom: 16,
                lineHeight: 20,
              },
            ]}
          >
            {banner}
          </Text>
        ) : null}

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

        <Text style={s.label}>Password</Text>
        <View style={{ position: 'relative' }}>
          <TextInput
            style={[s.input, { paddingRight: 48 }]}
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPw}
            placeholder="Password"
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

        <View
          style={[
            s.row,
            { justifyContent: 'space-between', marginBottom: 8 },
          ]}
        >
          <Pressable
            style={s.row}
            onPress={() => setRemember((v) => !v)}
            hitSlop={8}
          >
            <Ionicons
              name={remember ? 'checkbox' : 'square-outline'}
              size={22}
              color={remember ? BRAND_TEAL : colors.textMuted}
            />
            <Text style={s.muted}>Remember email or phone</Text>
          </Pressable>
          <Pressable onPress={onForgotPassword} hitSlop={8}>
            <Text style={s.link}>Forgot password?</Text>
          </Pressable>
        </View>

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
            <Text style={s.primaryBtnText}>Log in</Text>
          )}
        </Pressable>
        <Pressable onPress={onGoCreate} style={{ alignItems: 'center' }}>
          <Text style={s.muted}>
            New here? <Text style={s.link}>Create account</Text>
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

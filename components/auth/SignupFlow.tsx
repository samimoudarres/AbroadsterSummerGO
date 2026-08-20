import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../../lib/auth/AuthContext';
import type { SignupDraft, SignupStep } from '../../lib/auth/types';
import type { ContactKind } from '../../lib/auth/validation';
import {
  formatPhoneDisplay,
  isOldEnough,
  isValidPassword,
  normalizePhone,
} from '../../lib/auth/validation';
import { validateContact } from '../../lib/auth/authService';
import { requestGalleryPermission } from '../../lib/feed/galleryAssets';
import { chatRepo } from '../../lib/chat/repository';
import { computeExplorerScoreMiles } from '../../lib/explorerScore';
import { resolveSchoolVisual } from '../../lib/schools/catalog';
import { toImageSource } from '../../lib/images';
import { BRAND_TEAL, colors, fonts } from '../../constants/theme';
import { SchoolPicker } from '../schools/SchoolPicker';
import { AuthStepHeader } from './AuthStepHeader';
import { BirthdayPicker, defaultBirthday } from './BirthdayPicker';
import { ensureAgeAllowedForSocial } from '../../lib/auth/ageAssurance';
import { authStyles as s } from './authStyles';
import { AvatarCropModal } from '../common/AvatarCropModal';
import {
  LegalDocumentModal,
  type LegalDocKind,
} from '../legal/LegalDocumentModal';

const STEPS: SignupStep[] = [
  'name',
  'contact',
  'password',
  'birthday',
  'homeSchool',
  'abroadProgram',
  'terms',
  'photo',
];

interface SignupFlowProps {
  onBackToWelcome: () => void;
}

export function SignupFlow({ onBackToWelcome }: SignupFlowProps) {
  const { signUp } = useAuth();
  const [step, setStep] = useState<SignupStep>('name');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmPw, setConfirmPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [legalDoc, setLegalDoc] = useState<LegalDocKind | null>(null);
  const [cropUri, setCropUri] = useState<string | null>(null);

  const [draft, setDraft] = useState<SignupDraft>({
    firstName: '',
    lastName: '',
    contactKind: 'student',
    contactValue: '',
    password: '',
    rememberLogin: true,
    birthday: defaultBirthday(),
    homeUniversity: '',
    studyAbroadProgram: '',
    hostCity: '',
    hostCountry: '',
    avatarUri: null,
    agreedToTerms: false,
  });
  const [homeUnis, setHomeUnis] = useState<string[]>([]);
  const [programsOnApp, setProgramsOnApp] = useState<string[]>([]);

  useEffect(() => {
    void (async () => {
      try {
        const profiles = await chatRepo.listProfiles();
        setHomeUnis(profiles.map((p) => p.homeUniversity).filter(Boolean));
        setProgramsOnApp(
          profiles.map((p) => p.studyAbroadProgram).filter(Boolean),
        );
      } catch {
        // catalog counts still work without roster
      }
    })();
  }, []);

  const stepIndex = STEPS.indexOf(step);
  const progress = (stepIndex + 1) / STEPS.length;
  const previewMiles = useMemo(
    () =>
      draft.homeUniversity && draft.studyAbroadProgram
        ? computeExplorerScoreMiles({
            homeUniversity: draft.homeUniversity,
            studyAbroadProgram: draft.studyAbroadProgram,
            hostCity: draft.hostCity,
            hostCountry: draft.hostCountry,
            trips: [],
          })
        : 0,
    [
      draft.homeUniversity,
      draft.studyAbroadProgram,
      draft.hostCity,
      draft.hostCountry,
    ],
  );

  const patch = (p: Partial<SignupDraft>) =>
    setDraft((d) => ({ ...d, ...p }));

  const goBack = () => {
    setError(null);
    if (stepIndex === 0) {
      onBackToWelcome();
      return;
    }
    setStep(STEPS[stepIndex - 1]);
  };

  const goNext = async () => {
    if (busy) return;
    setError(null);
    if (step === 'name') {
      if (!draft.firstName.trim() || !draft.lastName.trim()) {
        setError('Enter your first and last name.');
        return;
      }
      setStep('contact');
      return;
    }
    if (step === 'contact') {
      const err = validateContact(draft.contactKind, draft.contactValue);
      if (err) {
        setError(err);
        return;
      }
      setStep('password');
      return;
    }
    if (step === 'password') {
      if (!isValidPassword(draft.password)) {
        setError('Password must be at least 6 letters or numbers.');
        return;
      }
      if (draft.password !== confirmPw) {
        setError('Passwords do not match.');
        return;
      }
      setStep('birthday');
      return;
    }
    if (step === 'birthday') {
      if (!isOldEnough(draft.birthday, 13)) {
        setError('You must be at least 13 years old to use Abroadster.');
        return;
      }
      if (Platform.OS === 'ios') {
        Keyboard.dismiss();
        setBusy(true);
        try {
          const apple = await ensureAgeAllowedForSocial();
          if (!apple.ok) {
            setError(apple.message);
            return;
          }
        } catch {
          setError('Could not confirm your age range. Try again in a moment.');
          return;
        } finally {
          setBusy(false);
        }
      }
      setStep('homeSchool');
      return;
    }
    if (step === 'homeSchool') {
      if (!draft.homeUniversity.trim()) {
        setError('Search and select your home school.');
        return;
      }
      setStep('abroadProgram');
      return;
    }
    if (step === 'abroadProgram') {
      if (!draft.studyAbroadProgram.trim()) {
        setError('Search and select your study abroad program.');
        return;
      }
      setStep('terms');
      return;
    }
    if (step === 'terms') {
      if (!draft.agreedToTerms) {
        setError('Please agree to continue.');
        return;
      }
      // Native OS notification permission before finishing account
      try {
        const { ensureNotificationPermission } = await import(
          '../../lib/push/permissions'
        );
        await ensureNotificationPermission();
      } catch {
        // optional — can enable later in settings
      }
      setStep('photo');
      return;
    }
    if (step === 'photo') {
      setBusy(true);
      try {
        await signUp(draft);
      } catch (e: any) {
        setError(e?.message || 'Could not create account.');
      } finally {
        setBusy(false);
      }
    }
  };

  const pickAvatar = async () => {
    const ok = await requestGalleryPermission();
    if (!ok) {
      setError('Photo library permission is required to add a profile photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      // Custom crop UI handles framing — native editor is limited / inconsistent
      allowsEditing: false,
      quality: 1,
    });
    if (!result.canceled && result.assets[0]?.uri) {
      setError(null);
      setCropUri(result.assets[0].uri);
    }
  };

  const contactPlaceholder = useMemo(() => {
    if (draft.contactKind === 'phone') return '(555) 123-4567';
    if (draft.contactKind === 'student') return 'name@school.edu';
    return 'you@email.com';
  }, [draft.contactKind]);

  const onContactChange = (text: string) => {
    if (draft.contactKind === 'phone') {
      patch({ contactValue: formatPhoneDisplay(normalizePhone(text)) });
      return;
    }
    patch({ contactValue: text });
  };

  const setKind = (kind: ContactKind) => {
    patch({ contactKind: kind, contactValue: '' });
    setError(null);
  };

  return (
    <>
    <KeyboardAvoidingView
      style={s.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <AuthStepHeader onBack={goBack} progress={progress} />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[s.stepBody, { paddingBottom: 16 }]}
        keyboardShouldPersistTaps="handled"
      >
        {step === 'name' ? (
          <>
            <Text style={s.title}>What's your name?</Text>
            <Text style={s.subtitle}>
              This is how friends will see you on Abroadster.
            </Text>
            <Text style={s.label}>First name</Text>
            <TextInput
              style={s.input}
              value={draft.firstName}
              onChangeText={(t) => patch({ firstName: t })}
              autoCapitalize="words"
              placeholder="First name"
              placeholderTextColor={colors.textMuted}
            />
            <Text style={s.label}>Last name</Text>
            <TextInput
              style={s.input}
              value={draft.lastName}
              onChangeText={(t) => patch({ lastName: t })}
              autoCapitalize="words"
              placeholder="Last name"
              placeholderTextColor={colors.textMuted}
            />
          </>
        ) : null}

        {step === 'contact' ? (
          <>
            <Text style={s.title}>How will you log in?</Text>
            <Text style={s.subtitle}>
              Choose phone, email, or your school email for verified student
              status.
            </Text>
            <View style={styles.segment}>
              {(
                [
                  ['student', 'Student email'],
                  ['email', 'Email'],
                  ['phone', 'Phone'],
                ] as const
              ).map(([kind, label]) => {
                const active = draft.contactKind === kind;
                return (
                  <Pressable
                    key={kind}
                    onPress={() => setKind(kind)}
                    style={[styles.segBtn, active && styles.segBtnOn]}
                  >
                    <Text style={[styles.segText, active && styles.segTextOn]}>
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {draft.contactKind === 'student' ? (
              <View style={styles.verifyRow}>
                <Ionicons name="shield-checkmark" size={18} color={BRAND_TEAL} />
                <Text style={styles.verifyText}>
                  To get verified student status — must end in .edu
                </Text>
              </View>
            ) : null}

            <Text style={s.label}>
              {draft.contactKind === 'phone'
                ? 'Phone number'
                : draft.contactKind === 'student'
                  ? 'School email'
                  : 'Email'}
            </Text>
            <TextInput
              style={s.input}
              value={draft.contactValue}
              onChangeText={onContactChange}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType={
                draft.contactKind === 'phone' ? 'phone-pad' : 'email-address'
              }
              placeholder={contactPlaceholder}
              placeholderTextColor={colors.textMuted}
            />
          </>
        ) : null}

        {step === 'password' ? (
          <>
            <Text style={s.title}>Create a password</Text>
            <Text style={s.subtitle}>
              At least 6 letters or numbers. You'll use this to log in.
            </Text>
            <Text style={s.label}>Password</Text>
            <View style={{ position: 'relative' }}>
              <TextInput
                style={[s.input, { paddingRight: 48 }]}
                value={draft.password}
                onChangeText={(t) => patch({ password: t })}
                secureTextEntry={!showPw}
                placeholder="Password"
                placeholderTextColor={colors.textMuted}
              />
              <Pressable
                onPress={() => setShowPw((v) => !v)}
                style={{ position: 'absolute', right: 14, top: 14 }}
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
              value={confirmPw}
              onChangeText={setConfirmPw}
              secureTextEntry={!showPw}
              placeholder="Confirm password"
              placeholderTextColor={colors.textMuted}
            />
            <Pressable
              style={s.row}
              onPress={() => patch({ rememberLogin: !draft.rememberLogin })}
            >
              <Ionicons
                name={draft.rememberLogin ? 'checkbox' : 'square-outline'}
                size={22}
                color={draft.rememberLogin ? BRAND_TEAL : colors.textMuted}
              />
              <Text style={s.muted}>Remember login info</Text>
            </Pressable>
          </>
        ) : null}

        {step === 'birthday' ? (
          <>
            <Text style={s.title}>Verify your age</Text>
            <Text style={s.subtitle}>
              {Platform.OS === 'ios'
                ? 'Abroadster is for users 13 and older. We’ll ask Apple to confirm you’re 13+, then save your date of birth on your account. Users under 13 cannot create an account or access social features. Your birthday is not shown on your profile.'
                : 'Abroadster is for users 13 and older. Enter your date of birth. Users under 13 cannot create an account or access social features. Your birthday is not shown on your profile.'}
            </Text>
            <View style={styles.ageAssuranceCard}>
              <Text style={styles.ageAssuranceTitle}>Age assurance</Text>
              <Text style={styles.ageAssuranceBody}>
                {Platform.OS === 'ios'
                  ? 'Tap Next to open Apple’s Declared Age Range prompt. If you are under 13, account creation is blocked before you can post, message, or use the map.'
                  : 'We verify age at sign-up. If you are under 13, account creation is blocked before you can post, message, or use the map.'}
              </Text>
            </View>
            <BirthdayPicker
              value={draft.birthday}
              onChange={(birthday) => patch({ birthday })}
            />
          </>
        ) : null}

        {step === 'homeSchool' ? (
          <>
            <Text style={s.title}>What school do you go to?</Text>
            <Text style={s.subtitle}>
              Search your U.S. university. You'll see how many people from that
              school are already on Abroadster.
            </Text>
            {draft.homeUniversity ? (
              <View style={styles.selectedCard}>
                {resolveSchoolVisual({ name: draft.homeUniversity }).logoUrl ? (
                  <Image
                    source={toImageSource(
                      resolveSchoolVisual({ name: draft.homeUniversity }).logoUrl!,
                    )}
                    style={styles.selectedLogo}
                  />
                ) : (
                  <View
                    style={[
                      styles.selectedLogo,
                      {
                        backgroundColor: resolveSchoolVisual({
                          name: draft.homeUniversity,
                        }).accent,
                      },
                    ]}
                  />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.selectedName}>{draft.homeUniversity}</Text>
                  <Text style={styles.selectedSub}>Selected home school</Text>
                </View>
                <Pressable onPress={() => patch({ homeUniversity: '' })}>
                  <Text style={s.link}>Change</Text>
                </Pressable>
              </View>
            ) : (
              <SchoolPicker
                mode="institutions"
                usOnly
                showMemberCount
                homeUnisForCount={homeUnis}
                placeholder="Search UT Austin, NYU, UCLA…"
                onSelect={(r) => {
                  if (r.kind === 'institution') {
                    patch({ homeUniversity: r.item.name });
                    setError(null);
                  }
                }}
              />
            )}
          </>
        ) : null}

        {step === 'abroadProgram' ? (
          <>
            <Text style={s.title}>Where are you studying abroad?</Text>
            <Text style={s.subtitle}>
              Search your program. Your Explorer Score starts as the miles
              between your home school and this program.
            </Text>
            {draft.studyAbroadProgram ? (
              <View style={styles.selectedCard}>
                {resolveSchoolVisual({ name: draft.studyAbroadProgram })
                  .logoUrl ? (
                  <Image
                    source={toImageSource(
                      resolveSchoolVisual({
                        name: draft.studyAbroadProgram,
                      }).logoUrl!,
                    )}
                    style={styles.selectedLogo}
                  />
                ) : (
                  <View
                    style={[
                      styles.selectedLogo,
                      {
                        backgroundColor: resolveSchoolVisual({
                          name: draft.studyAbroadProgram,
                        }).accent,
                      },
                    ]}
                  />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.selectedName}>
                    {draft.studyAbroadProgram}
                  </Text>
                  <Text style={styles.selectedSub}>
                    Starting Explorer Score · {previewMiles.toLocaleString()} mi
                  </Text>
                </View>
                <Pressable
                  onPress={() =>
                    patch({
                      studyAbroadProgram: '',
                      hostCity: '',
                      hostCountry: '',
                    })
                  }
                >
                  <Text style={s.link}>Change</Text>
                </Pressable>
              </View>
            ) : (
              <SchoolPicker
                mode="programs"
                showMemberCount
                programsForCount={programsOnApp}
                placeholder="Search NYU London, CIEE Paris…"
                onSelect={(r) => {
                  if (r.kind === 'program') {
                    patch({
                      studyAbroadProgram: r.item.name,
                      hostCity: r.item.city || '',
                      hostCountry: r.item.country || '',
                    });
                    setError(null);
                  }
                }}
              />
            )}
          </>
        ) : null}

        {step === 'terms' ? (
          <>
            <Text style={s.title}>Agree to Abroadster's policies</Text>
            <Text style={s.subtitle}>
              By continuing, you agree to Abroadster's Terms of Use and Privacy
              Policy.
            </Text>
            <View style={styles.termsCard}>
              <Text style={styles.termsTitle}>Terms & Privacy</Text>
              <Text style={styles.termsBody}>
                Please read Abroadster's Terms of Use and Privacy Policy. You
                must agree before creating an account.
              </Text>
              <Pressable
                hitSlop={6}
                accessibilityRole="link"
                accessibilityLabel="Read Terms of Use"
                onPress={() => setLegalDoc('terms')}
              >
                <Text style={s.link}>Read Terms of Use</Text>
              </Pressable>
              <Pressable
                hitSlop={6}
                style={{ marginTop: 8 }}
                accessibilityRole="link"
                accessibilityLabel="Read Privacy Policy"
                onPress={() => setLegalDoc('privacy')}
              >
                <Text style={s.link}>Read Privacy Policy</Text>
              </Pressable>
            </View>
            <Pressable
              style={[s.row, { marginTop: 20 }]}
              onPress={() =>
                patch({ agreedToTerms: !draft.agreedToTerms })
              }
            >
              <Ionicons
                name={draft.agreedToTerms ? 'checkbox' : 'square-outline'}
                size={24}
                color={draft.agreedToTerms ? BRAND_TEAL : colors.textMuted}
              />
              <Text style={[s.muted, { flex: 1 }]}>
                I agree to the Terms of Use and Privacy Policy
              </Text>
            </Pressable>
          </>
        ) : null}

        {step === 'photo' ? (
          <>
            <Text style={s.title}>Add a profile picture</Text>
            <Text style={s.subtitle}>
              Help friends recognize you. You can change this anytime.
            </Text>
            <Pressable style={styles.avatarWrap} onPress={() => void pickAvatar()}>
              {draft.avatarUri ? (
                <Image source={{ uri: draft.avatarUri }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarEmpty}>
                  <Ionicons name="person" size={64} color="#B0B0B0" />
                </View>
              )}
              <View style={styles.cameraBadge}>
                <Ionicons name="camera" size={18} color={colors.white} />
              </View>
            </Pressable>
            <Pressable onPress={() => void pickAvatar()}>
              <Text style={[s.link, { textAlign: 'center', marginTop: 16 }]}>
                {draft.avatarUri ? 'Change photo' : 'Choose from camera roll'}
              </Text>
            </Pressable>
            {draft.avatarUri ? (
              <Pressable
                onPress={() => setCropUri(draft.avatarUri)}
                style={{ marginTop: 10, alignItems: 'center' }}
              >
                <Text style={[s.link, { color: colors.textMuted }]}>
                  Adjust crop
                </Text>
              </Pressable>
            ) : null}
          </>
        ) : null}

        {error ? <Text style={s.error}>{error}</Text> : null}
      </ScrollView>

      <View style={s.footer}>
        <Pressable
          style={[s.primaryBtn, busy && s.primaryBtnDisabled]}
          onPress={() => void goNext()}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={s.primaryBtnText}>
              {step === 'terms'
                ? 'Agree and continue'
                : step === 'photo'
                  ? 'Done'
                  : step === 'birthday' && Platform.OS === 'ios'
                    ? 'Verify with Apple'
                    : 'Next'}
            </Text>
          )}
        </Pressable>
        {step === 'photo' ? (
          <Pressable
            onPress={() => {
              void (async () => {
                setBusy(true);
                setError(null);
                try {
                  await signUp({ ...draft, avatarUri: null });
                } catch (e: any) {
                  setError(e?.message || 'Could not create account.');
                } finally {
                  setBusy(false);
                }
              })();
            }}
            disabled={busy}
            style={{ alignItems: 'center' }}
          >
            <Text style={s.muted}>Skip for now</Text>
          </Pressable>
        ) : null}
      </View>
    </KeyboardAvoidingView>
      <LegalDocumentModal
        visible={legalDoc != null}
        kind={legalDoc ?? 'terms'}
        onClose={() => setLegalDoc(null)}
      />
      <AvatarCropModal
        visible={Boolean(cropUri)}
        imageUri={cropUri}
        onCancel={() => setCropUri(null)}
        onDone={(uri) => {
          patch({ avatarUri: uri });
          setCropUri(null);
          setError(null);
        }}
      />
    </>
  );
}

const styles = {
  segment: {
    flexDirection: 'row' as const,
    backgroundColor: colors.white,
    borderRadius: 14,
    padding: 4,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.divider,
    gap: 4,
  },
  segBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 11,
    alignItems: 'center' as const,
  },
  segBtnOn: {
    backgroundColor: BRAND_TEAL,
  },
  segText: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center' as const,
  },
  segTextOn: {
    color: colors.white,
  },
  verifyRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    backgroundColor: colors.brandMint,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
  },
  verifyText: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 13,
    color: BRAND_TEAL,
    lineHeight: 18,
  },
  selectedCard: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    backgroundColor: colors.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.divider,
    padding: 14,
    marginBottom: 8,
  },
  selectedLogo: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#E8E8E8',
  },
  selectedName: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.black,
  },
  selectedSub: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  termsCard: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  ageAssuranceCard: {
    backgroundColor: colors.brandMint,
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(23,88,100,0.12)',
  },
  ageAssuranceTitle: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: BRAND_TEAL,
    marginBottom: 6,
  },
  ageAssuranceBody: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: BRAND_TEAL,
    lineHeight: 19,
  },
  termsTitle: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.black,
    marginBottom: 8,
  },
  termsBody: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 21,
    marginBottom: 14,
  },
  avatarWrap: {
    alignSelf: 'center' as const,
    width: 160,
    height: 160,
    marginTop: 12,
  },
  avatar: {
    width: 160,
    height: 160,
    borderRadius: 80,
  },
  avatarEmpty: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: '#E8E8E8',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  cameraBadge: {
    position: 'absolute' as const,
    right: 6,
    bottom: 6,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: BRAND_TEAL,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderWidth: 3,
    borderColor: colors.brandCream,
  },
};

import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { GestureDetector } from 'react-native-gesture-handler';
import { BRAND_TEAL, colors, fonts } from '../../constants/theme';
import type { ChatProfile } from '../../data/chatTypes';
import { chatRepo } from '../../lib/chat/repository';
import { changePassword } from '../../lib/auth/changePassword';
import { requestGalleryPermission } from '../../lib/feed/galleryAssets';
import { searchPlaces, type PlaceSuggestion } from '../../lib/geocode';
import { useEdgeSwipeBack } from '../../lib/gestures/useEdgeSwipeBack';
import { toImageSource } from '../../lib/images';
import { usePhoneTopPad } from '../../lib/layout/safeArea';
import { MAPBOX_TOKEN } from '../../lib/mapConfig';
import { SchoolPicker } from '../schools/SchoolPicker';
import { AbroadsterTopBar, ABROADSTER_HEADER_ICON } from '../common/AbroadsterTopBar';
import { AvatarCropModal } from '../common/AvatarCropModal';
import { SEMESTER_OPTIONS } from '../../constants/semesters';

interface EditProfileScreenProps {
  profile: ChatProfile;
  onClose: () => void;
  onSaved: (profile: ChatProfile) => void;
  /** Open directly on password change (from Account & password menu). */
  initialPanel?: 'profile' | 'password';
}

type Panel = 'profile' | 'password';

export function EditProfileScreen({
  profile,
  onClose,
  onSaved,
  initialPanel = 'profile',
}: EditProfileScreenProps) {
  const topPad = usePhoneTopPad(0);
  const edgeBack = useEdgeSwipeBack(onClose);
  const [panel, setPanel] = useState<Panel>(initialPanel);
  const [firstName, setFirstName] = useState(profile.firstName);
  const [lastName, setLastName] = useState(profile.lastName);
  const [bio, setBio] = useState(profile.bio || '');
  const [homeUniversity, setHomeUniversity] = useState(profile.homeUniversity);
  const [abroadProgram, setAbroadProgram] = useState(
    profile.studyAbroadProgram,
  );
  const [semester, setSemester] = useState(profile.semester || '');
  const [hostCity, setHostCity] = useState(profile.hostCity || '');
  const [hostCountry, setHostCountry] = useState(profile.hostCountry || '');
  const [cityHits, setCityHits] = useState<PlaceSuggestion[]>([]);
  const [citySearching, setCitySearching] = useState(false);
  const [showCityHits, setShowCityHits] = useState(false);
  const [avatarUri, setAvatarUri] = useState<string | null>(
    typeof profile.avatar === 'string' ? profile.avatar : null,
  );
  const [avatarPreview, setAvatarPreview] = useState<string | number>(
    profile.avatar,
  );
  const [cropUri, setCropUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const [currentPw, setCurrentPw] = useState('');
  const [nextPw, setNextPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');

  useEffect(() => {
    const q = hostCity.trim();
    if (!showCityHits || q.length < 2) {
      setCityHits([]);
      return;
    }
    let cancelled = false;
    setCitySearching(true);
    const t = setTimeout(() => {
      void (async () => {
        try {
          const hits = await searchPlaces(q, MAPBOX_TOKEN);
          if (!cancelled) setCityHits(hits.slice(0, 6));
        } finally {
          if (!cancelled) setCitySearching(false);
        }
      })();
    }, 240);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [hostCity, showCityHits]);

  const pickCity = (place: PlaceSuggestion) => {
    setHostCity(place.cityName);
    if (place.countryName) setHostCountry(place.countryName);
    setShowCityHits(false);
    setCityHits([]);
  };

  const pickPhoto = async () => {
    const ok = await requestGalleryPermission();
    if (!ok) {
      setError('Photo library permission is required.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 1,
    });
    if (!result.canceled && result.assets[0]?.uri) {
      setCropUri(result.assets[0].uri);
      setError(null);
    }
  };

  const saveProfile = async () => {
    setError(null);
    setOkMsg(null);
    if (!firstName.trim() || !lastName.trim()) {
      setError('First and last name are required.');
      return;
    }
    setBusy(true);
    try {
      if (avatarUri && avatarUri !== profile.avatar) {
        await chatRepo.updateMyAvatar(avatarUri);
      }
      const updated = await chatRepo.updateMyProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        bio: bio.trim() || null,
        homeUniversity: homeUniversity.trim() || profile.homeUniversity,
        studyAbroadProgram: abroadProgram.trim() || profile.studyAbroadProgram,
        semester: semester.trim() || null,
        hostCity: hostCity.trim() || null,
        hostCountry: hostCountry.trim() || null,
      });
      onSaved(updated);
      setOkMsg('Profile saved.');
      // Brief confirmation before closing so the toast is actually seen
      await new Promise((r) => setTimeout(r, 650));
      onClose();
    } catch (e: any) {
      setError(e?.message || 'Could not save profile.');
    } finally {
      setBusy(false);
    }
  };

  const savePassword = async () => {
    setError(null);
    setOkMsg(null);
    if (nextPw !== confirmPw) {
      setError('New passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await changePassword(currentPw, nextPw);
      setCurrentPw('');
      setNextPw('');
      setConfirmPw('');
      setOkMsg('Password updated.');
      setPanel('profile');
    } catch (e: any) {
      setError(e?.message || 'Could not change password.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <GestureDetector gesture={edgeBack}>
    <View style={[styles.root, { paddingTop: 0 }]}>
      <AbroadsterTopBar
        left={
          <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close">
            <Ionicons
              name="close"
              size={28}
              color={ABROADSTER_HEADER_ICON}
            />
          </Pressable>
        }
        right={
          panel === 'profile' ? (
            <Pressable
              onPress={() => void saveProfile()}
              disabled={busy}
              hitSlop={12}
              accessibilityLabel="Save"
            >
              {busy ? (
                <ActivityIndicator color={ABROADSTER_HEADER_ICON} />
              ) : (
                <Text style={styles.saveTop}>Save</Text>
              )}
            </Pressable>
          ) : (
            <View style={{ width: 40 }} />
          )
        }
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[styles.body, { paddingBottom: 40 + topPad }]}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.screenTitle}>
            {panel === 'profile' ? 'Edit profile' : 'Change password'}
          </Text>

          {panel === 'profile' ? (
            <>
              <Pressable style={styles.avatarWrap} onPress={() => void pickPhoto()}>
                <Image
                  source={toImageSource(avatarPreview)}
                  style={styles.avatar}
                />
                <View style={styles.cameraBadge}>
                  <Ionicons name="camera" size={16} color={colors.white} />
                </View>
              </Pressable>
              <Pressable onPress={() => void pickPhoto()}>
                <Text style={styles.linkCenter}>Change profile photo</Text>
              </Pressable>

              <Text style={styles.label}>First name</Text>
              <TextInput
                style={styles.input}
                value={firstName}
                onChangeText={setFirstName}
                autoCapitalize="words"
              />
              <Text style={styles.label}>Last name</Text>
              <TextInput
                style={styles.input}
                value={lastName}
                onChangeText={setLastName}
                autoCapitalize="words"
              />
              <Text style={styles.label}>Bio</Text>
              <TextInput
                style={[styles.input, styles.bioInput]}
                value={bio}
                onChangeText={setBio}
                multiline
                placeholder="Tell people what you're studying abroad for…"
                placeholderTextColor={colors.textMuted}
              />

              <Text style={styles.label}>Home university</Text>
              <SchoolPicker
                value={homeUniversity}
                mode="institutions"
                placeholder="Search home school…"
                onSelect={(r) => {
                  if (r.kind === 'institution') setHomeUniversity(r.item.name);
                }}
              />
              <TextInput
                style={[styles.input, { marginTop: 8 }]}
                value={homeUniversity}
                onChangeText={setHomeUniversity}
                placeholder="Or type school name"
                placeholderTextColor={colors.textMuted}
              />

              <Text style={styles.label}>Abroad school / program</Text>
              <SchoolPicker
                value={abroadProgram}
                mode="all"
                placeholder="Search program or local university…"
                onSelect={(r) => {
                  if (r.kind === 'program') {
                    setAbroadProgram(r.item.name);
                    if (r.item.city) setHostCity(r.item.city);
                    if (r.item.country) setHostCountry(r.item.country);
                  } else if (r.kind === 'institution') {
                    setAbroadProgram(r.item.name);
                    if (r.item.country) setHostCountry(r.item.country);
                  }
                }}
              />
              <TextInput
                style={[styles.input, { marginTop: 8 }]}
                value={abroadProgram}
                onChangeText={setAbroadProgram}
                placeholder="Or type program name"
                placeholderTextColor={colors.textMuted}
              />

              <Text style={styles.label}>Semester</Text>
              <View style={styles.semesterWrap}>
                {SEMESTER_OPTIONS.map((opt) => {
                  const on = semester === opt;
                  return (
                    <Pressable
                      key={opt}
                      style={[styles.semesterChip, on && styles.semesterChipOn]}
                      onPress={() => setSemester(opt)}
                    >
                      <Text
                        style={[
                          styles.semesterChipText,
                          on && styles.semesterChipTextOn,
                        ]}
                      >
                        {opt}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={styles.label}>Host city</Text>
              <TextInput
                style={styles.input}
                value={hostCity}
                onChangeText={(t) => {
                  setHostCity(t);
                  setShowCityHits(true);
                }}
                onFocus={() => setShowCityHits(true)}
                placeholder="Search city…"
                placeholderTextColor={colors.textMuted}
                autoCorrect={false}
              />
              {showCityHits && (cityHits.length > 0 || citySearching) ? (
                <View style={styles.suggestBox}>
                  {citySearching ? (
                    <ActivityIndicator color={BRAND_TEAL} style={{ margin: 10 }} />
                  ) : (
                    cityHits.map((p) => (
                      <Pressable
                        key={p.id}
                        style={styles.suggestRow}
                        onPress={() => pickCity(p)}
                      >
                        <Ionicons
                          name="location-sharp"
                          size={16}
                          color={BRAND_TEAL}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.suggestTitle}>{p.cityName}</Text>
                          <Text style={styles.suggestSub} numberOfLines={1}>
                            {p.placeName}
                          </Text>
                        </View>
                      </Pressable>
                    ))
                  )}
                </View>
              ) : null}
              <Text style={styles.label}>Host country</Text>
              <TextInput
                style={[styles.input, styles.inputReadonly]}
                value={hostCountry}
                onChangeText={setHostCountry}
                placeholder="Auto-filled from city"
                placeholderTextColor={colors.textMuted}
              />
              <Text style={styles.fieldHint}>
                Country fills from the city you pick — you can still edit it.
              </Text>

              <View style={styles.accountCard}>
                <Text style={styles.accountTitle}>Account</Text>
                {profile.studentEmail || profile.phoneNumber ? (
                  <Text style={styles.accountLine}>
                    Login:{' '}
                    {profile.studentEmail ||
                      profile.phoneNumber ||
                      'Saved on your account'}
                  </Text>
                ) : (
                  <Text style={styles.accountLine}>
                    Your login is the email or phone you used to sign up.
                  </Text>
                )}
                {profile.isVerifiedStudent ? (
                  <Text style={styles.verified}>Verified student (.edu)</Text>
                ) : null}
                <Pressable
                  style={styles.pwBtn}
                  onPress={() => {
                    setPanel('password');
                    setError(null);
                    setOkMsg(null);
                  }}
                >
                  <Ionicons name="key-outline" size={18} color={BRAND_TEAL} />
                  <Text style={styles.pwBtnText}>Change password</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <Text style={styles.hint}>
                For security, enter your current password before setting a new
                one.
              </Text>
              <Text style={styles.label}>Current password</Text>
              <TextInput
                style={styles.input}
                value={currentPw}
                onChangeText={setCurrentPw}
                secureTextEntry
                autoCapitalize="none"
              />
              <Text style={styles.label}>New password</Text>
              <TextInput
                style={styles.input}
                value={nextPw}
                onChangeText={setNextPw}
                secureTextEntry
                autoCapitalize="none"
                placeholder="At least 6 characters"
                placeholderTextColor={colors.textMuted}
              />
              <Text style={styles.label}>Confirm new password</Text>
              <TextInput
                style={styles.input}
                value={confirmPw}
                onChangeText={setConfirmPw}
                secureTextEntry
                autoCapitalize="none"
              />
              <Pressable
                style={[styles.primaryBtn, busy && { opacity: 0.5 }]}
                onPress={() => void savePassword()}
                disabled={busy}
              >
                {busy ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <Text style={styles.primaryBtnText}>Update password</Text>
                )}
              </Pressable>
              <Pressable
                onPress={() => {
                  setPanel('profile');
                  setError(null);
                }}
                style={{ marginTop: 14, alignItems: 'center' }}
              >
                <Text style={styles.linkCenter}>Back to edit profile</Text>
              </Pressable>
            </>
          )}

          {error ? <Text style={styles.error}>{error}</Text> : null}
          {okMsg ? <Text style={styles.ok}>{okMsg}</Text> : null}
        </ScrollView>
      </KeyboardAvoidingView>
      <AvatarCropModal
        visible={Boolean(cropUri)}
        imageUri={cropUri}
        onCancel={() => setCropUri(null)}
        onDone={(uri) => {
          setAvatarUri(uri);
          setAvatarPreview(uri);
          setCropUri(null);
          setError(null);
        }}
      />
    </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.brandCream,
    zIndex: 80,
  },
  body: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  screenTitle: {
    fontFamily: fonts.extraBold,
    fontSize: 24,
    color: colors.black,
    marginBottom: 16,
  },
  saveTop: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: ABROADSTER_HEADER_ICON,
  },
  avatarWrap: {
    alignSelf: 'center',
    width: 108,
    height: 108,
    marginBottom: 8,
  },
  avatar: {
    width: 108,
    height: 108,
    borderRadius: 54,
  },
  cameraBadge: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: BRAND_TEAL,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.brandCream,
  },
  linkCenter: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: BRAND_TEAL,
    textAlign: 'center',
    marginBottom: 20,
  },
  label: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 8,
    marginTop: 4,
  },
  input: {
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.black,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
  },
  inputReadonly: {
    backgroundColor: '#F7F7F8',
  },
  fieldHint: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: -6,
    marginBottom: 12,
  },
  suggestBox: {
    marginTop: -8,
    marginBottom: 12,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: 12,
    overflow: 'hidden',
  },
  suggestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  suggestTitle: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.black,
  },
  suggestSub: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textMuted,
  },
  semesterWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  semesterChip: {
    borderRadius: 100,
    borderWidth: 1,
    borderColor: colors.divider,
    backgroundColor: colors.white,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  semesterChipOn: {
    borderColor: BRAND_TEAL,
    backgroundColor: 'rgba(23,88,100,0.1)',
  },
  semesterChipText: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.textMuted,
  },
  semesterChipTextOn: {
    color: BRAND_TEAL,
  },
  bioInput: {
    minHeight: 88,
    textAlignVertical: 'top',
  },
  accountCard: {
    marginTop: 12,
    backgroundColor: colors.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.divider,
    padding: 16,
    gap: 8,
  },
  accountTitle: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.black,
  },
  accountLine: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 20,
  },
  verified: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: BRAND_TEAL,
  },
  pwBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    paddingVertical: 10,
  },
  pwBtnText: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: BRAND_TEAL,
  },
  hint: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 20,
    marginBottom: 16,
  },
  primaryBtn: {
    backgroundColor: BRAND_TEAL,
    borderRadius: 28,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryBtnText: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.white,
  },
  error: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.brandCoral,
    marginTop: 12,
  },
  ok: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: BRAND_TEAL,
    marginTop: 12,
  },
});

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GestureDetector } from 'react-native-gesture-handler';
import { colors, fonts } from '../../constants/theme';
import type { ChatProfile } from '../../data/chatTypes';
import { useAuth } from '../../lib/auth/AuthContext';
import { chatRepo } from '../../lib/chat/repository';
import { confirmChoice } from '../../lib/confirm';
import { LEGAL_URLS } from '../../lib/legal/urls';
import { useEdgeSwipeBack } from '../../lib/gestures/useEdgeSwipeBack';
import {
  NOTIF_PREF_LABELS,
  type NotifPrefKey,
  type UserSettings,
  emptyUserSettings,
} from '../../lib/social/userSettings';
import {
  ABROADSTER_HEADER_ICON,
  AbroadsterTopBar,
} from '../common/AbroadsterTopBar';
import { Avatar } from '../common/Avatar';

interface SettingsScreenProps {
  profile: ChatProfile;
  onClose: () => void;
  onEditProfile: () => void;
  onChangePassword: () => void;
  onOpenLegal: (kind: 'terms' | 'privacy') => void;
  onLoggedOut: () => void;
  onAccountDeleted: () => void;
  onProfileUpdated?: (profile: ChatProfile) => void;
}

export function SettingsScreen({
  profile,
  onClose,
  onEditProfile,
  onChangePassword,
  onOpenLegal,
  onLoggedOut,
  onAccountDeleted,
  onProfileUpdated,
}: SettingsScreenProps) {
  const { signOut, deleteAccount } = useAuth();
  const edgeBack = useEdgeSwipeBack(onClose);
  const [settings, setSettings] = useState<UserSettings>(emptyUserSettings());
  const [blocked, setBlocked] = useState<ChatProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [masterNotif, setMasterNotif] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, blockedList] = await Promise.all([
        chatRepo.getMySettings(),
        chatRepo.listBlockedUsers(),
      ]);
      setSettings(s);
      const anyOff = NOTIF_PREF_LABELS.some(
        (row) => s.notificationPrefs[row.key] === false,
      );
      setMasterNotif(!anyOff);
      setBlocked(blockedList);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const setPref = async (key: NotifPrefKey, value: boolean) => {
    setSettings((prev) => ({
      ...prev,
      notificationPrefs: { ...prev.notificationPrefs, [key]: value },
    }));
    try {
      const next = await chatRepo.updateMySettings({
        notificationPrefs: { [key]: value },
      });
      setSettings(next);
      const anyOff = NOTIF_PREF_LABELS.some(
        (row) => next.notificationPrefs[row.key] === false,
      );
      setMasterNotif(!anyOff);
    } catch (e: any) {
      Alert.alert('Couldn’t save', e?.message ?? 'Try again.');
      void load();
    }
  };

  const setAllPrefs = async (value: boolean) => {
    setMasterNotif(value);
    const patch = Object.fromEntries(
      NOTIF_PREF_LABELS.map((r) => [r.key, value]),
    ) as Record<NotifPrefKey, boolean>;
    setSettings((prev) => ({
      ...prev,
      notificationPrefs: { ...prev.notificationPrefs, ...patch },
    }));
    try {
      const next = await chatRepo.updateMySettings({
        notificationPrefs: patch,
      });
      setSettings(next);
    } catch (e: any) {
      Alert.alert('Couldn’t save', e?.message ?? 'Try again.');
      void load();
    }
  };

  const confirmLogout = () => {
    void (async () => {
      if (loggingOut) return;
      const ok = await confirmChoice(
        'Log out?',
        'You’ll need to sign in again to use Abroadster.',
        'Log out',
        true,
      );
      if (!ok) return;
      setLoggingOut(true);
      try {
        await signOut();
        onLoggedOut();
      } catch (e: any) {
        // Session is cleared in AuthContext finally — still leave Settings
        onLoggedOut();
        Alert.alert(
          'Signed out',
          e?.message
            ? `You were signed out locally. (${e.message})`
            : 'You were signed out.',
        );
      } finally {
        setLoggingOut(false);
      }
    })();
  };

  const confirmDelete = () => {
    void (async () => {
      const ok = await confirmChoice(
        'Delete account?',
        'This permanently deletes your Abroadster account and profile data. This cannot be undone.',
        'Delete',
        true,
      );
      if (!ok) return;
      try {
        await deleteAccount();
        onAccountDeleted();
      } catch (e: any) {
        Alert.alert(
          'Couldn’t delete account',
          e?.message ?? 'Check your connection and try again.',
        );
      }
    })();
  };

  return (
    <GestureDetector gesture={edgeBack}>
    <View style={styles.overlay}>
      <AbroadsterTopBar
        left={
          <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Back">
            <Ionicons
              name="chevron-back"
              size={28}
              color={ABROADSTER_HEADER_ICON}
            />
          </Pressable>
        }
        right={
          <Text style={styles.headerLabel} numberOfLines={1}>
            Settings
          </Text>
        }
      />

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.brandTeal} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          <Section title="Account">
            <Row
              label="Edit profile"
              icon="create-outline"
              onPress={onEditProfile}
            />
            <Row
              label="Change password"
              icon="key-outline"
              onPress={onChangePassword}
            />
          </Section>

          <Section title="Location privacy">
            <Text style={styles.empty}>
              Only mutual friends can see your map pin. Choose how precise it is when
              you share it.
            </Text>
            {(
              [
                {
                  key: 'exact' as const,
                  label: 'Precise location',
                  hint: 'Share your live pin on the map while Abroadster is open',
                },
                {
                  key: 'city' as const,
                  label: 'City area only',
                  hint: 'Show a general pin near your study-abroad city (not exact GPS)',
                },
                {
                  key: 'hidden' as const,
                  label: 'Location off',
                  hint: 'Hide your pin from the map entirely',
                },
              ] as const
            ).map((opt) => {
              const active =
                (profile.locationPrivacy ?? 'exact') === opt.key;
              return (
                <Pressable
                  key={opt.key}
                  style={styles.privacyRow}
                  onPress={() => {
                    void (async () => {
                      try {
                        const next = await chatRepo.setMyLocationPrivacy(opt.key);
                        onProfileUpdated?.({
                          ...profile,
                          locationPrivacy: next,
                          ...(next === 'exact'
                            ? {}
                            : {
                                liveLatitude: null,
                                liveLongitude: null,
                                liveLocationLabel: null,
                              }),
                        });
                      } catch (e: any) {
                        Alert.alert(
                          'Couldn’t save',
                          e?.message ?? 'Try again.',
                        );
                      }
                    })();
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.privacyLabel}>{opt.label}</Text>
                    <Text style={styles.privacyHint}>{opt.hint}</Text>
                  </View>
                  <Ionicons
                    name={active ? 'radio-button-on' : 'radio-button-off'}
                    size={22}
                    color={active ? colors.brandTeal ?? '#175864' : colors.textMuted}
                  />
                </Pressable>
              );
            })}
          </Section>

          <Section title="Notifications">
            <ToggleRow
              label="All notifications"
              value={masterNotif}
              onValueChange={(v) => void setAllPrefs(v)}
            />
            {NOTIF_PREF_LABELS.map((row) => (
              <ToggleRow
                key={row.key}
                label={row.label}
                value={settings.notificationPrefs[row.key] !== false}
                onValueChange={(v) => void setPref(row.key, v)}
              />
            ))}
          </Section>

          <Section title="Blocked accounts">
            {blocked.length === 0 ? (
              <Text style={styles.empty}>No blocked accounts</Text>
            ) : (
              blocked.map((p) => (
                <View key={p.id} style={styles.blockedRow}>
                  <Avatar source={p.avatar} name={p.fullName} size={36} />
                  <Text style={styles.blockedName} numberOfLines={1}>
                    {p.fullName}
                  </Text>
                  <Pressable
                    onPress={() => {
                      void (async () => {
                        await chatRepo.unblockUser(p.id);
                        setBlocked((prev) =>
                          prev.filter((x) => x.id !== p.id),
                        );
                      })();
                    }}
                    style={styles.unblockBtn}
                  >
                    <Text style={styles.unblockText}>Unblock</Text>
                  </Pressable>
                </View>
              ))
            )}
          </Section>

          <Section title="Support">
            <Row
              label="Contact support"
              icon="mail-outline"
              onPress={() => {
                void Linking.openURL(`mailto:${LEGAL_URLS.supportEmail}`);
              }}
            />
            <Row
              label="Terms of Use"
              icon="document-text-outline"
              onPress={() => onOpenLegal('terms')}
            />
            <Row
              label="Privacy Policy"
              icon="shield-checkmark-outline"
              onPress={() => onOpenLegal('privacy')}
            />
            <Row
              label="Age requirement (13+)"
              icon="person-outline"
              onPress={() => {
                Alert.alert(
                  'Age assurance',
                  'Abroadster is for users 13 and older. On iPhone we use Apple’s Declared Age Range prompt to confirm you are 13+ before map, feed, chat, or trips. Users under 13 cannot create an account or use social features.\n\nYou will also see this system prompt after Log in (including the demo account).',
                );
              }}
            />
          </Section>

          <Section title="Session">
            <Row
              label={loggingOut ? 'Logging out…' : 'Log out'}
              icon="log-out-outline"
              destructive
              onPress={loggingOut ? () => undefined : confirmLogout}
            />
            <Row
              label="Delete account"
              icon="trash-outline"
              destructive
              onPress={confirmDelete}
            />
          </Section>

          <Text style={styles.hint}>Signed in as {profile.fullName}</Text>
        </ScrollView>
      )}
    </View>
    </GestureDetector>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function Row({
  label,
  icon,
  onPress,
  destructive,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  destructive?: boolean;
}) {
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <Ionicons
        name={icon}
        size={20}
        color={destructive ? '#C0392B' : colors.black}
      />
      <Text
        style={[styles.rowLabel, destructive && styles.rowLabelDestructive]}
      >
        {label}
      </Text>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

function ToggleRow({
  label,
  value,
  onValueChange,
}: {
  label: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: '#D0D0D0', true: colors.brandMint }}
        thumbColor={value ? colors.brandTeal : '#f4f4f4'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 80,
    backgroundColor: colors.white,
  },
  headerLabel: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: ABROADSTER_HEADER_ICON,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    paddingBottom: 40,
    paddingHorizontal: 16,
  },
  section: {
    marginTop: 22,
  },
  sectionTitle: {
    fontFamily: fonts.extraBold,
    fontSize: 13,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  sectionBody: {
    borderRadius: 14,
    backgroundColor: '#F7F8F8',
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E4E6E6',
  },
  rowLabel: {
    flex: 1,
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.black,
  },
  rowLabelDestructive: {
    color: '#C0392B',
  },
  empty: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.textMuted,
    padding: 14,
  },
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E4E6E6',
  },
  privacyLabel: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.black,
  },
  privacyHint: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
    lineHeight: 16,
  },
  blockedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E4E6E6',
  },
  blockedName: {
    flex: 1,
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.black,
  },
  unblockBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  unblockText: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.black,
  },
  hint: {
    marginTop: 24,
    textAlign: 'center',
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textMuted,
  },
});

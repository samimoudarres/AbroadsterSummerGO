import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts } from '../../constants/theme';
import type { ChatProfile } from '../../data/chatTypes';
import { chatRepo, initChat, subscribeChat } from '../../lib/chat/repository';
import type { SuggestedAccount } from '../../lib/social/suggestAccounts';
import { useBottomNavClearance } from '../../lib/layout/safeArea';
import { Avatar } from '../common/Avatar';

interface SuggestedAccountsOverlayProps {
  visible: boolean;
  onDismissed: () => void;
  onOpenProfile?: (user: ChatProfile) => void;
}

/**
 * Post-signup suggested-accounts sheet over the map.
 * Double-X close: first tap shows tip, second dismisses and persists done.
 */
export function SuggestedAccountsOverlay({
  visible,
  onDismissed,
  onOpenProfile,
}: SuggestedAccountsOverlayProps) {
  const { height: windowH } = useWindowDimensions();
  const navClearance = useBottomNavClearance();
  const sheetMaxH = Math.min(windowH * 0.72, 560);
  const [items, setItems] = useState<SuggestedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTip, setShowTip] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [added, setAdded] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      await initChat();
      const list = await chatRepo.suggestAccounts(60);
      setItems(list);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    setShowTip(false);
    setAdded({});
    void load();
    return subscribeChat(() => {
      void load();
    });
  }, [visible, load]);

  const onClosePress = () => {
    if (!showTip) {
      setShowTip(true);
      return;
    }
    void (async () => {
      try {
        await chatRepo.updateMySettings({
          onboarding: { suggested_overlay_done: true },
        });
      } catch {
        // still dismiss locally
      }
      onDismissed();
    })();
  };

  const onAdd = async (userId: string) => {
    if (busyId) return;
    setBusyId(userId);
    setAdded((prev) => ({ ...prev, [userId]: true }));
    try {
      await chatRepo.addFriend(userId);
    } catch {
      setAdded((prev) => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClosePress}
      statusBarTranslucent
    >
      <View style={styles.root} pointerEvents="box-none">
        <Pressable
          style={styles.backdrop}
          onPress={onClosePress}
          accessibilityLabel="Dismiss suggestions"
        />
        <View
          style={[
            styles.sheet,
            {
              maxHeight: sheetMaxH,
              marginBottom: Math.max(10, navClearance - 8),
            },
          ]}
        >
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.title}>Suggested for you</Text>
              <Text style={styles.sub}>
                People from your schools and shared friends
              </Text>
            </View>
            <View style={styles.closeWrap}>
              {showTip ? (
                <View style={styles.tipBubble}>
                  <Text style={styles.tipText}>Find more in Notifications</Text>
                </View>
              ) : null}
              <Pressable
                onPress={onClosePress}
                hitSlop={12}
                style={styles.closeBtn}
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={24} color={colors.black} />
              </Pressable>
            </View>
          </View>

          {loading ? (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.brandTeal} />
            </View>
          ) : (
            <FlatList
              data={items}
              keyExtractor={(item) => item.profile.id}
              style={styles.list}
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => {
                const p = item.profile;
                const isAdded = Boolean(added[p.id]);
                return (
                  <Pressable
                    style={styles.row}
                    onPress={() => onOpenProfile?.(p)}
                  >
                    <Avatar source={p.avatar} name={p.fullName} size={48} />
                    <View style={styles.meta}>
                      <Text style={styles.name} numberOfLines={1}>
                        {p.fullName}
                      </Text>
                      <Text style={styles.schools} numberOfLines={1}>
                        {item.reason ||
                          [item.homeUniversity, item.studyAbroadProgram]
                            .filter(Boolean)
                            .join(' → ')}
                      </Text>
                    </View>
                    <Pressable
                      style={[styles.addBtn, isAdded && styles.addBtnOn]}
                      onPress={() => void onAdd(p.id)}
                      disabled={isAdded || busyId === p.id}
                    >
                      <Text
                        style={[styles.addText, isAdded && styles.addTextOn]}
                      >
                        {isAdded ? 'Added' : 'Add friend'}
                      </Text>
                    </Pressable>
                  </Pressable>
                );
              }}
              ListEmptyComponent={
                <Text style={styles.empty}>
                  Looking for more Abroadsters nearby — check back soon.
                </Text>
              }
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.38)',
  },
  sheet: {
    marginHorizontal: 12,
    backgroundColor: colors.white,
    borderRadius: 22,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D5D5D5',
    marginTop: 10,
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 6,
    gap: 8,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
    paddingRight: 4,
  },
  title: {
    fontFamily: fonts.extraBold,
    fontSize: 20,
    color: colors.black,
  },
  closeWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 2,
  },
  tipBubble: {
    maxWidth: 140,
    backgroundColor: colors.brandMint,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  tipText: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: colors.brandTeal,
  },
  closeBtn: {
    padding: 4,
  },
  sub: {
    marginTop: 4,
    marginBottom: 8,
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textMuted,
  },
  loading: {
    minHeight: 180,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 24,
  },
  list: {
    flexGrow: 0,
  },
  listContent: {
    paddingHorizontal: 14,
    paddingBottom: 18,
    paddingTop: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  meta: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.black,
  },
  schools: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  addBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: colors.brandTeal,
  },
  addBtnOn: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  addText: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.white,
  },
  addTextOn: {
    color: colors.black,
  },
  empty: {
    marginTop: 28,
    marginBottom: 36,
    textAlign: 'center',
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.textMuted,
    paddingHorizontal: 20,
  },
});

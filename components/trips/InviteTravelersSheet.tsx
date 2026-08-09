import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts } from '../../constants/theme';
import type { ChatProfile } from '../../data/chatTypes';
import { chatRepo } from '../../lib/chat/repository';
import { usePhoneTopPad } from '../../lib/layout/safeArea';
import { Avatar } from '../common/Avatar';

interface InviteTravelersSheetProps {
  visible: boolean;
  /** Already on the trip — cannot invite again */
  excludeIds: string[];
  onClose: () => void;
  onConfirm: (userIds: string[]) => Promise<void>;
}

/**
 * Pull-out invite picker (Create Trip style): friends ranked first + search anyone.
 * Multi-select then Confirm sends invites.
 */
export function InviteTravelersSheet({
  visible,
  excludeIds,
  onClose,
  onConfirm,
}: InviteTravelersSheetProps) {
  const topPad = usePhoneTopPad(0);
  const [query, setQuery] = useState('');
  const [people, setPeople] = useState<ChatProfile[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const excluded = useMemo(() => new Set(excludeIds), [excludeIds]);

  useEffect(() => {
    if (!visible) {
      setQuery('');
      setSelected(new Set());
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const q = query.trim();
        const raw = q
          ? await chatRepo.searchUsers(q)
          : await chatRepo.suggestTripInvitees();
        const filtered = raw.filter((u) => !excluded.has(u.id));
        if (!cancelled) setPeople(filtered);
      } catch {
        if (!cancelled) setPeople([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, query, excluded]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const confirm = async () => {
    const ids = [...selected];
    if (!ids.length || sending) return;
    setSending(true);
    try {
      await onConfirm(ids);
      onClose();
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.root, { paddingTop: topPad }]}>
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={12} style={styles.side}>
            <Ionicons name="close" size={26} color={colors.black} />
          </Pressable>
          <Text style={styles.title}>Invite travelers</Text>
          <View style={styles.side} />
        </View>

        <View style={styles.searchRow}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search people…"
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
            autoCapitalize="none"
          />
        </View>
        <Text style={styles.hint}>
          Friends show first. Search anyone on Abroadster — invites send when
          you confirm.
        </Text>

        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.brandTeal} />
          </View>
        ) : (
          <FlatList
            data={people}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              <Text style={styles.empty}>
                {query.trim() ? 'No people found' : 'No suggestions yet'}
              </Text>
            }
            renderItem={({ item }) => {
              const on = selected.has(item.id);
              return (
                <Pressable style={styles.row} onPress={() => toggle(item.id)}>
                  <Avatar source={item.avatar} name={item.fullName} size={44} />
                  <View style={styles.meta}>
                    <Text style={styles.name} numberOfLines={1}>
                      {item.fullName}
                    </Text>
                    <Text style={styles.sub} numberOfLines={1}>
                      {item.studyAbroadProgram || item.homeUniversity || ''}
                    </Text>
                  </View>
                  <View style={[styles.selectBtn, on && styles.selectBtnOn]}>
                    <Text
                      style={[styles.selectText, on && styles.selectTextOn]}
                    >
                      {on ? 'Selected' : 'Select'}
                    </Text>
                  </View>
                </Pressable>
              );
            }}
          />
        )}

        <View style={styles.footer}>
          <Pressable
            style={[
              styles.confirmBtn,
              (selected.size === 0 || sending) && styles.confirmBtnOff,
            ]}
            disabled={selected.size === 0 || sending}
            onPress={() => void confirm()}
          >
            {sending ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.confirmText}>
                Send invite{selected.size === 1 ? '' : 's'}
                {selected.size > 0 ? ` (${selected.size})` : ''}
              </Text>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  header: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  side: { width: 40, alignItems: 'center' },
  title: {
    fontFamily: fonts.extraBold,
    fontSize: 17,
    color: colors.black,
  },
  searchRow: {
    marginHorizontal: 16,
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#F3F4F4',
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.black,
    padding: 0,
  },
  hint: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textMuted,
  },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingBottom: 100 },
  empty: {
    textAlign: 'center',
    marginTop: 40,
    fontFamily: fonts.regular,
    color: colors.textMuted,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  meta: { flex: 1, minWidth: 0 },
  name: { fontFamily: fonts.bold, fontSize: 15, color: colors.black },
  sub: {
    marginTop: 2,
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textMuted,
  },
  selectBtn: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: colors.brandTeal,
  },
  selectBtnOn: {
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.divider,
  },
  selectText: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.white,
  },
  selectTextOn: { color: colors.black },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 16,
    paddingBottom: 28,
    backgroundColor: colors.white,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
  },
  confirmBtn: {
    backgroundColor: colors.brandTeal,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  confirmBtnOff: { opacity: 0.45 },
  confirmText: {
    fontFamily: fonts.extraBold,
    fontSize: 16,
    color: colors.white,
  },
});

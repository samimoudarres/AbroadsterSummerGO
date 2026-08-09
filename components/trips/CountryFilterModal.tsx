import React, { useMemo, useState } from 'react';
import {
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
import { WORLD_COUNTRIES } from '../../data/countries';

interface CountryFilterModalProps {
  visible: boolean;
  selected: string[];
  onClose: () => void;
  onChange: (countries: string[]) => void;
}

export function CountryFilterModal({
  visible,
  selected,
  onClose,
  onChange,
}: CountryFilterModalProps) {
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<string[]>(selected);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return WORLD_COUNTRIES;
    return WORLD_COUNTRIES.filter((c) => c.toLowerCase().includes(q));
  }, [query]);

  return (
    <Modal visible={visible} animationType="slide" transparent onShow={() => setDraft(selected)}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.head}>
            <Text style={styles.title}>Countries</Text>
            <Pressable
              onPress={() => {
                onChange(draft);
                onClose();
              }}
            >
              <Text style={styles.done}>Done</Text>
            </Pressable>
          </View>
          <View style={styles.search}>
            <Ionicons name="search" size={16} color={colors.textMuted} />
            <TextInput
              style={styles.input}
              placeholder="Search countries"
              placeholderTextColor={colors.textMuted}
              value={query}
              onChangeText={setQuery}
              autoCorrect={false}
            />
          </View>
          <Pressable
            style={styles.row}
            onPress={() => setDraft([])}
          >
            <Text style={styles.rowText}>Any country</Text>
            {draft.length === 0 ? (
              <Ionicons name="checkmark" size={20} color={colors.openJoin} />
            ) : null}
          </Pressable>
          <FlatList
            data={list}
            keyExtractor={(c) => c}
            style={{ maxHeight: 420 }}
            renderItem={({ item }) => {
              const on = draft.includes(item);
              return (
                <Pressable
                  style={styles.row}
                  onPress={() =>
                    setDraft((d) =>
                      on ? d.filter((x) => x !== item) : [...d, item],
                    )
                  }
                >
                  <Text style={styles.rowText}>{item}</Text>
                  {on ? (
                    <Ionicons name="checkmark" size={20} color={colors.openJoin} />
                  ) : null}
                </Pressable>
              );
            }}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 28,
    maxHeight: '80%',
  },
  head: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  title: { fontFamily: fonts.extraBold, fontSize: 18 },
  done: { fontFamily: fonts.bold, fontSize: 16, color: colors.openJoin },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: '#F2F2F2',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 40,
  },
  input: { flex: 1, fontSize: 15, color: colors.black },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E8E8E8',
  },
  rowText: { fontFamily: fonts.regular, fontSize: 16 },
});

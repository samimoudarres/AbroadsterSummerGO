import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { colors, fonts } from '../../constants/theme';
import { chatRepo } from '../../lib/chat/repository';
import type { CatalogInstitution } from '../../lib/schools/catalog';
import {
  countMembersForHomeSchool,
  countMembersForProgram,
  getLocalStudyPrograms,
  isUsInstitution,
  searchInstitutionsLocal,
  type CatalogProgram,
} from '../../lib/schools/catalog';
import { toImageSource } from '../../lib/images';

export type SchoolPickerResult =
  | { kind: 'institution'; item: CatalogInstitution }
  | { kind: 'program'; item: CatalogProgram };

type Props = {
  value?: string;
  placeholder?: string;
  /** Prefer universities, programs, or both */
  mode?: 'institutions' | 'programs' | 'all';
  /** Limit home-school search to US institutions */
  usOnly?: boolean;
  /** Show “N on Abroadster” under each row */
  showMemberCount?: boolean;
  homeUnisForCount?: string[];
  programsForCount?: string[];
  onSelect: (result: SchoolPickerResult) => void;
};

/**
 * Autocomplete school / program picker for onboarding & profile edit.
 * Uses live `search_institutions` when signed in; otherwise local catalog.
 */
export function SchoolPicker({
  value = '',
  placeholder = 'Search schools…',
  mode = 'all',
  usOnly = false,
  showMemberCount = false,
  homeUnisForCount = [],
  programsForCount = [],
  onSelect,
}: Props) {
  const [query, setQuery] = useState(value);
  const [loading, setLoading] = useState(false);
  const [institutions, setInstitutions] = useState<CatalogInstitution[]>([]);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    let cancelled = false;
    const q = query.trim();
    if (q.length < 2 || mode === 'programs') {
      setInstitutions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      let rows = await chatRepo.searchInstitutions(q, 16);
      if (!rows.length) rows = searchInstitutionsLocal(q, 16);
      if (usOnly) rows = rows.filter(isUsInstitution);
      if (!cancelled) {
        setInstitutions(rows);
        setLoading(false);
      }
    }, 160);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [mode, query, usOnly]);

  const programs = useMemo(() => {
    if (mode === 'institutions') return [] as CatalogProgram[];
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return getLocalStudyPrograms()
      .filter((p) => {
        const hay = `${p.name} ${p.short_name} ${p.city} ${p.provider}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 10);
  }, [mode, query]);

  const rows: SchoolPickerResult[] = useMemo(() => {
    const out: SchoolPickerResult[] = [];
    if (mode !== 'institutions') {
      for (const item of programs) out.push({ kind: 'program', item });
    }
    if (mode !== 'programs') {
      for (const item of institutions) out.push({ kind: 'institution', item });
    }
    return out;
  }, [institutions, mode, programs]);

  return (
    <View style={styles.wrap}>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        style={styles.input}
        autoCorrect={false}
        autoCapitalize="none"
      />
      {loading ? (
        <ActivityIndicator style={{ marginTop: 12 }} color={colors.programBlue} />
      ) : null}
      <FlatList
        data={rows}
        keyExtractor={(item) =>
          item.kind === 'program' ? `p-${item.item.slug}` : `i-${item.item.slug}`
        }
        keyboardShouldPersistTaps="handled"
        style={styles.list}
        nestedScrollEnabled
        renderItem={({ item }) => {
          const name = item.item.name;
          const logo = item.item.logo_url;
          const accent = item.item.accent_hex;
          const sub =
            item.kind === 'program'
              ? `${item.item.city}, ${item.item.country}`
              : [item.item.state, item.item.country].filter(Boolean).join(', ');
          const count =
            item.kind === 'program'
              ? countMembersForProgram(name, programsForCount)
              : countMembersForHomeSchool(name, homeUnisForCount);
          return (
            <Pressable
              style={[styles.row, { borderLeftColor: accent }]}
              onPress={() => {
                setQuery(name);
                onSelect(item);
              }}
            >
              {logo ? (
                <Image source={toImageSource(logo)} style={styles.logo} />
              ) : (
                <View style={[styles.logoFallback, { backgroundColor: accent }]} />
              )}
              <View style={styles.meta}>
                <Text style={styles.name} numberOfLines={1}>
                  {name}
                </Text>
                <Text style={styles.sub} numberOfLines={1}>
                  {showMemberCount
                    ? `${sub ? `${sub} · ` : ''}${count} on Abroadster`
                    : sub}
                </Text>
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          query.trim().length >= 2 && !loading ? (
            <Text style={styles.empty}>No matches for “{query.trim()}”</Text>
          ) : query.trim().length < 2 ? (
            <Text style={styles.empty}>Type at least 2 letters to search</Text>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%' },
  input: {
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.black,
    backgroundColor: colors.white,
  },
  list: { maxHeight: 280, marginTop: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EEE',
    borderLeftWidth: 3,
    backgroundColor: colors.white,
  },
  logo: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F2F2F2',
  },
  logoFallback: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  meta: { flex: 1 },
  name: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.black,
  },
  sub: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  empty: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textMuted,
    padding: 12,
  },
});

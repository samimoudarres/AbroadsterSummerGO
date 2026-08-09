import React, { useEffect, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { colors, fonts } from '../../constants/theme';
import type { ChatTrip } from '../../data/chatTypes';
import { chatRepo } from '../../lib/chat/repository';

type AttachMode = 'main' | 'trips' | 'poll';

interface AttachSheetProps {
  visible: boolean;
  onClose: () => void;
  onSendImage: (uri: string) => void;
  onSendTrip: (tripId: string) => void;
  onSendPoll: (question: string, options: string[]) => void;
}

export function AttachSheet({
  visible,
  onClose,
  onSendImage,
  onSendTrip,
  onSendPoll,
}: AttachSheetProps) {
  const [mode, setMode] = useState<AttachMode>('main');
  const [trips, setTrips] = useState<ChatTrip[]>([]);
  const [pollQ, setPollQ] = useState('Where should we go?');
  const [optA, setOptA] = useState('Option A');
  const [optB, setOptB] = useState('Option B');
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    if (!visible) {
      setMode('main');
      return;
    }
    chatRepo.getTripsForMe().then(setTrips);
  }, [visible]);

  if (!visible) return null;

  async function pickFromLibrary() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      allowsMultipleSelection: false,
    });
    if (!result.canceled && result.assets[0]?.uri) {
      setRecent((r) => [result.assets[0].uri, ...r].slice(0, 9));
      onSendImage(result.assets[0].uri);
      onClose();
    }
  }

  async function takePhoto() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchCameraAsync({ quality: 0.85 });
    if (!result.canceled && result.assets[0]?.uri) {
      onSendImage(result.assets[0].uri);
      onClose();
    }
  }

  return (
    <View style={styles.overlay}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.titleRow}>
          <Text style={styles.title}>
            {mode === 'trips'
              ? 'Your Trips'
              : mode === 'poll'
                ? 'Create Poll'
                : 'Photo Library'}
          </Text>
          <Pressable onPress={onClose}>
            <Ionicons name="close" size={22} color={colors.black} />
          </Pressable>
        </View>

        {mode === 'main' ? (
          <>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.featureRow}
            >
              {[
                { id: 'photo', label: 'Photo', color: '#2F80ED', icon: 'image' as const },
                { id: 'gif', label: 'GIF', color: '#F2C94C', icon: 'happy' as const },
                { id: 'trip', label: 'Trip', color: '#9B51E0', icon: 'airplane' as const },
                { id: 'poll', label: 'Poll', color: '#F2994A', icon: 'bar-chart' as const },
                { id: 'loc', label: 'Location', color: '#EB5757', icon: 'location' as const },
              ].map((f) => (
                <Pressable
                  key={f.id}
                  style={styles.featureItem}
                  onPress={() => {
                    if (f.id === 'trip') setMode('trips');
                    else if (f.id === 'poll') setMode('poll');
                    else if (f.id === 'photo') pickFromLibrary();
                  }}
                >
                  <View style={[styles.featureIcon, { backgroundColor: f.color }]}>
                    <Ionicons name={f.icon} size={22} color={colors.white} />
                  </View>
                  <Text style={styles.featureLabel}>{f.label}</Text>
                </Pressable>
              ))}
            </ScrollView>

            <View style={styles.permRow}>
              <Text style={styles.permText}>
                Abroadster needs photo access to attach images.
              </Text>
              <Pressable onPress={pickFromLibrary}>
                <Text style={styles.manage}>Manage</Text>
              </Pressable>
            </View>

            <View style={styles.sourceRow}>
              {[
                { label: 'Camera', icon: 'camera' as const, onPress: takePhoto },
                { label: 'Photos', icon: 'images' as const, onPress: pickFromLibrary },
                { label: 'Files', icon: 'folder' as const, onPress: pickFromLibrary },
              ].map((s) => (
                <Pressable key={s.label} style={styles.sourceCard} onPress={s.onPress}>
                  <Ionicons name={s.icon} size={28} color={colors.textMuted} />
                  <Text style={styles.sourceLabel}>{s.label}</Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.grid}>
              {recent.length === 0 ? (
                <Pressable style={styles.gridEmpty} onPress={pickFromLibrary}>
                  <Text style={styles.gridEmptyText}>Tap to choose from camera roll</Text>
                </Pressable>
              ) : (
                recent.map((uri) => (
                  <Pressable key={uri} onPress={() => { onSendImage(uri); onClose(); }}>
                    <Image source={{ uri }} style={styles.thumb} />
                  </Pressable>
                ))
              )}
            </View>
          </>
        ) : null}

        {mode === 'trips' ? (
          <ScrollView style={{ maxHeight: 360 }}>
            {trips.length === 0 ? (
              <Text style={styles.empty}>No trips yet. Create one from the Trips tab.</Text>
            ) : (
              trips.map((t) => (
                <Pressable
                  key={t.id}
                  style={styles.tripRow}
                  onPress={() => {
                    onSendTrip(t.id);
                    onClose();
                  }}
                >
                  <Ionicons name="airplane" size={20} color={colors.filterPurple} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.tripTitle}>
                      {t.destinationCity}, {t.destinationCountry}
                    </Text>
                    <Text style={styles.tripMeta}>
                      {t.status} · {t.dateLabel}
                    </Text>
                  </View>
                  <Ionicons name="send" size={18} color={colors.openJoin} />
                </Pressable>
              ))
            )}
          </ScrollView>
        ) : null}

        {mode === 'poll' ? (
          <View style={{ gap: 10 }}>
            <Text style={styles.pollHint}>Question</Text>
            <TextInput
              style={styles.pollField}
              value={pollQ}
              onChangeText={setPollQ}
              placeholder="Ask a question"
            />
            <Text style={styles.pollHint}>Options</Text>
            <TextInput
              style={styles.pollField}
              value={optA}
              onChangeText={setOptA}
              placeholder="Option A"
            />
            <TextInput
              style={styles.pollField}
              value={optB}
              onChangeText={setOptB}
              placeholder="Option B"
            />
            <Pressable
              style={styles.sendPoll}
              onPress={() => {
                onSendPoll(pollQ, [optA, optB]);
                onClose();
              }}
            >
              <Text style={styles.sendPollText}>Send Poll</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 95,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 16,
    paddingBottom: 28,
    maxHeight: '82%',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D0D0D0',
    marginTop: 8,
    marginBottom: 10,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  title: { fontFamily: fonts.extraBold, fontSize: 18 },
  featureRow: { gap: 16, paddingBottom: 12 },
  featureItem: { alignItems: 'center', width: 64 },
  featureIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  featureLabel: { fontSize: 12, color: colors.black },
  permRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  permText: { flex: 1, fontSize: 12, color: colors.textMuted, marginRight: 8 },
  manage: { color: colors.programBlue, fontFamily: fonts.bold, fontSize: 14 },
  sourceRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  sourceCard: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.divider,
    alignItems: 'center',
    paddingVertical: 16,
    gap: 6,
  },
  sourceLabel: { fontSize: 13, color: colors.textMuted },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  gridEmpty: {
    width: '100%',
    height: 120,
    borderRadius: 10,
    backgroundColor: '#F2F2F2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridEmptyText: { color: colors.textMuted },
  thumb: { width: 110, height: 110, borderRadius: 4 },
  empty: { color: colors.textMuted, padding: 20, textAlign: 'center' },
  tripRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  tripTitle: { fontFamily: fonts.bold, fontSize: 16 },
  tripMeta: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  pollHint: { fontFamily: fonts.bold, fontSize: 13, color: colors.textMuted },
  pollField: {
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: 12,
    padding: 12,
    fontSize: 15,
    color: colors.black,
  },
  sendPoll: {
    backgroundColor: colors.programBlue,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  sendPollText: { color: colors.white, fontFamily: fonts.bold, fontSize: 16 },
});

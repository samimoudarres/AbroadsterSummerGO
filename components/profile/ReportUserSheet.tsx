import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts } from '../../constants/theme';
import { chatRepo } from '../../lib/chat/repository';

const REASONS = [
  'Harassment or bullying',
  'Hate speech or discrimination',
  'Sexual or inappropriate content',
  'Spam or scams',
  'Impersonation or fake account',
  'Other',
] as const;

type Props = {
  visible: boolean;
  userId: string;
  userName: string;
  onClose: () => void;
};

export function ReportUserSheet({
  visible,
  userId,
  userName,
  onClose,
}: Props) {
  const [reason, setReason] = useState<string | null>(null);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!reason || busy) return;
    setBusy(true);
    try {
      await chatRepo.reportContent({
        targetType: 'user',
        targetId: userId,
        reportedUserId: userId,
        reason,
        details: details.trim() || undefined,
      });
      Alert.alert(
        'Report submitted',
        'Thanks. Our team will review this report. If someone is in immediate danger, contact local emergency services.',
      );
      setReason(null);
      setDetails('');
      onClose();
    } catch (e: any) {
      Alert.alert('Couldn’t submit report', e?.message ?? 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <Text style={styles.title}>Report {userName}</Text>
        <Text style={styles.sub}>
          Reports are confidential. Choose a reason so we can review this account.
        </Text>
        {REASONS.map((r) => {
          const on = reason === r;
          return (
            <Pressable
              key={r}
              style={[styles.reason, on && styles.reasonOn]}
              onPress={() => setReason(r)}
            >
              <Ionicons
                name={on ? 'radio-button-on' : 'radio-button-off'}
                size={18}
                color={on ? colors.openJoin : colors.textMuted}
              />
              <Text style={styles.reasonText}>{r}</Text>
            </Pressable>
          );
        })}
        <TextInput
          style={styles.input}
          placeholder="Optional details"
          placeholderTextColor={colors.textMuted}
          value={details}
          onChangeText={setDetails}
          multiline
          maxLength={500}
        />
        <Pressable
          style={[styles.submit, (!reason || busy) && styles.submitOff]}
          onPress={() => void submit()}
          disabled={!reason || busy}
        >
          {busy ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.submitText}>Submit report</Text>
          )}
        </Pressable>
        <Pressable onPress={onClose} style={styles.cancel}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 24,
    backgroundColor: colors.white,
    borderRadius: 18,
    padding: 16,
    maxHeight: '85%',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#DDD',
    marginBottom: 12,
  },
  title: {
    fontFamily: fonts.extraBold,
    fontSize: 18,
    color: colors.black,
  },
  sub: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 6,
    marginBottom: 12,
    lineHeight: 18,
  },
  reason: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E8E8E8',
  },
  reasonOn: { backgroundColor: '#F3FAFC' },
  reasonText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.black,
    flex: 1,
  },
  input: {
    marginTop: 12,
    minHeight: 72,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    padding: 10,
    fontFamily: fonts.regular,
    fontSize: 14,
    textAlignVertical: 'top',
  },
  submit: {
    marginTop: 14,
    backgroundColor: colors.brandTeal,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  submitOff: { opacity: 0.5 },
  submitText: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.white,
  },
  cancel: { alignItems: 'center', paddingVertical: 12 },
  cancelText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.textMuted,
  },
});

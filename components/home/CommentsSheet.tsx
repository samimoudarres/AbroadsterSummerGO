import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { colors, fonts } from '../../constants/theme';
import type { ChatProfile, PostComment } from '../../data/chatTypes';
import { chatRepo, isOwnSender } from '../../lib/chat/repository';
import { timeAgo } from '../../lib/feed/timeAgo';
import { Avatar } from '../common/Avatar';

interface CommentsSheetProps {
  visible: boolean;
  postId: string | null;
  commentsDisabled?: boolean;
  isOwnPost?: boolean;
  onClose: () => void;
  onOpenProfile: (user: ChatProfile) => void;
  onCommentsChanged?: (postId: string, count: number, preview?: PostComment | null) => void;
}

/** Instagram-style comments bottom sheet. */
export function CommentsSheet({
  visible,
  postId,
  commentsDisabled = false,
  isOwnPost = false,
  onClose,
  onOpenProfile,
  onCommentsChanged,
}: CommentsSheetProps) {
  const [loading, setLoading] = useState(false);
  const [comments, setComments] = useState<PostComment[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!visible || !postId) {
      setComments([]);
      setDraft('');
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const rows = await chatRepo.listPostComments(postId);
        if (!cancelled) setComments(rows);
      } catch {
        if (!cancelled) setComments([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, postId]);

  const send = async () => {
    if (!postId || !draft.trim() || sending || commentsDisabled) return;
    const body = draft.trim();
    setDraft('');
    setSending(true);
    try {
      const created = await chatRepo.addPostComment(postId, body);
      const next = [...comments, created];
      setComments(next);
      onCommentsChanged?.(postId, next.length, created);
    } catch (e: any) {
      setDraft(body);
      Alert.alert('Couldn’t comment', e?.message ?? 'Try again.');
    } finally {
      setSending(false);
    }
  };

  const remove = (comment: PostComment) => {
    Alert.alert('Delete comment?', 'This can’t be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await chatRepo.deletePostComment(comment.id);
              const next = comments.filter((c) => c.id !== comment.id);
              setComments(next);
              onCommentsChanged?.(
                postId!,
                next.length,
                next[next.length - 1] ?? null,
              );
            } catch (e: any) {
              Alert.alert('Couldn’t delete', e?.message ?? 'Try again.');
            }
          })();
        },
      },
    ]);
  };

  if (!visible || !postId) return null;

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <Pressable style={styles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.sheetWrap}
      >
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.titleRow}>
            <Text style={styles.title}>Comments</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </Pressable>
          </View>

          {loading ? (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.programBlue} />
            </View>
          ) : comments.length === 0 ? (
            <Text style={styles.empty}>
              {commentsDisabled
                ? 'Comments are turned off for this post.'
                : 'No comments yet. Be the first.'}
            </Text>
          ) : (
            <ScrollView
              style={{ maxHeight: 380 }}
              keyboardShouldPersistTaps="handled"
            >
              {comments.map((c) => {
                const canDelete =
                  isOwnSender(c.authorId, undefined) || isOwnPost;
                return (
                  <View key={c.id} style={styles.row}>
                    <Pressable
                      onPress={() => {
                        if (c.author) {
                          onClose();
                          onOpenProfile(c.author);
                        }
                      }}
                    >
                      <Avatar
                        source={c.author?.avatar}
                        name={c.author?.fullName}
                        size={32}
                      />
                    </Pressable>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.commentBody}>
                        <Text style={styles.commentName}>
                          {c.author?.fullName?.split(' ')[0] ?? 'Traveler'}{' '}
                        </Text>
                        {c.body}
                      </Text>
                      <Text style={styles.time}>{timeAgo(c.createdAt)}</Text>
                    </View>
                    {canDelete ? (
                      <Pressable onPress={() => remove(c)} hitSlop={8}>
                        <Ionicons
                          name="trash-outline"
                          size={16}
                          color={colors.textMuted}
                        />
                      </Pressable>
                    ) : null}
                  </View>
                );
              })}
            </ScrollView>
          )}

          {commentsDisabled ? null : (
            <View style={styles.composer}>
              <TextInput
                ref={inputRef}
                style={styles.input}
                placeholder="Add a comment…"
                placeholderTextColor={colors.textMuted}
                value={draft}
                onChangeText={setDraft}
                onSubmitEditing={() => void send()}
                returnKeyType="send"
                blurOnSubmit
                maxLength={2000}
              />
              <Pressable
                onPress={() => void send()}
                disabled={!draft.trim() || sending}
                hitSlop={8}
                style={{ opacity: draft.trim() && !sending ? 1 : 0.4 }}
              >
                <Text style={styles.postBtn}>Post</Text>
              </Pressable>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 80,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheetWrap: { width: '100%' },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === 'ios' ? 28 : 16,
    maxHeight: '78%',
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#DDD',
    marginTop: 10,
    marginBottom: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  title: {
    fontFamily: fonts.extraBold,
    fontSize: 17,
    color: colors.black,
  },
  loading: { paddingVertical: 40, alignItems: 'center' },
  empty: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    paddingVertical: 36,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 10,
    alignItems: 'flex-start',
  },
  commentBody: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.black,
    lineHeight: 19,
  },
  commentName: { fontFamily: fonts.extraBold },
  time: {
    marginTop: 3,
    fontSize: 11,
    color: colors.textMuted,
    fontFamily: fonts.regular,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
    paddingTop: 10,
    marginTop: 6,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: colors.black,
    fontFamily: fonts.regular,
    paddingVertical: 8,
    maxHeight: 90,
  },
  postBtn: {
    fontFamily: fonts.extraBold,
    fontSize: 15,
    color: colors.programBlue,
  },
});

import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { colors, fonts } from '../../constants/theme';
import type { ChatMessage, ChatProfile, ChatTrip, FeedPost, PollData } from '../../data/chatTypes';
import { chatRepo, isOwnSender, isTripParticipant } from '../../lib/chat/repository';
import { Avatar } from '../common/Avatar';
import { PostMessageCard } from './PostMessageCard';
import { TripMessageCard } from './TripMessageCard';
import { LinkPreviewCard } from './LinkPreviewCard';

const REACTIONS = ['❤️', '😂', '😮', '😢', '😠', '👍'];

function resolveTripId(message: ChatMessage): string | null {
  if (message.tripId) return message.tripId;
  const meta = message.metadata?.tripId;
  return typeof meta === 'string' && meta ? meta : null;
}

interface MessageBubbleProps {
  message: ChatMessage;
  sender: ChatProfile | null;
  meId: string;
  showAvatar: boolean;
  showName: boolean;
  trip?: ChatTrip | null;
  poll?: PollData | null;
  post?: FeedPost | null;
  postAuthor?: ChatProfile | null;
  replyPreview?: string | null;
  onLongPress: (message: ChatMessage, anchor: { x: number; y: number }) => void;
  onReplySwipe: (message: ChatMessage) => void;
  onTripPeople: (trip: ChatTrip) => void;
  onTripRequest: (trip: ChatTrip) => void;
  onTripCancelRequest?: (trip: ChatTrip) => void;
  onOpenTrip?: (trip: ChatTrip) => void;
  onVotePoll?: (pollId: string, optionId: string) => void;
  onViewPost?: (postId: string) => void;
  onOpenTaggedTrip?: (tripId: string) => void;
  onAvatarPress?: (userId: string) => void;
}

export function MessageBubble({
  message,
  sender,
  meId,
  showAvatar,
  showName,
  trip,
  poll,
  post,
  postAuthor,
  replyPreview,
  onLongPress,
  onReplySwipe,
  onTripPeople,
  onTripRequest,
  onTripCancelRequest,
  onOpenTrip,
  onVotePoll,
  onViewPost,
  onOpenTaggedTrip,
  onAvatarPress,
}: MessageBubbleProps) {
  const isMine = isOwnSender(message.senderId, meId);
  const isSystem = message.kind === 'system';
  const translateX = useSharedValue(0);
  const tripId = resolveTripId(message);
  const [loadedTrip, setLoadedTrip] = useState<ChatTrip | null>(null);
  const [tripLoading, setTripLoading] = useState(false);

  useEffect(() => {
    if (message.kind !== 'trip' || trip || !tripId) {
      setLoadedTrip(null);
      return;
    }
    let cancelled = false;
    setTripLoading(true);
    void (async () => {
      try {
        const t = await chatRepo.getTrip(tripId);
        if (!cancelled) setLoadedTrip(t);
      } finally {
        if (!cancelled) setTripLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [message.kind, trip, tripId]);

  const resolvedTrip = trip ?? loadedTrip;

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX(18)
        .failOffsetY([-12, 12])
        .onUpdate((e) => {
          if (e.translationX > 0) translateX.value = Math.min(e.translationX, 72);
        })
        .onEnd((e) => {
          if (e.translationX > 48) runOnJS(onReplySwipe)(message);
          translateX.value = withSpring(0);
        }),
    [message, onReplySwipe, translateX],
  );

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  if (isSystem) {
    return (
      <Text style={styles.system}>{message.body}</Text>
    );
  }

  const bubble = (
    <Pressable
      onLongPress={(e) =>
        onLongPress(message, {
          x: e.nativeEvent.pageX,
          y: e.nativeEvent.pageY,
        })
      }
      delayLongPress={350}
    >
      {replyPreview ? (
        <View style={[styles.replyQuote, isMine && styles.replyQuoteMine]}>
          <Text style={styles.replyQuoteText} numberOfLines={2}>
            {replyPreview}
          </Text>
        </View>
      ) : null}

      {message.kind === 'trip' && resolvedTrip ? (
        <TripMessageCard
          trip={resolvedTrip}
          plannerName={sender?.firstName ?? 'Someone'}
          isMember={isTripParticipant(resolvedTrip, meId)}
          isInvited={Boolean(
            resolvedTrip.myPendingInviteId ||
              (resolvedTrip.pendingInviteeIds ?? []).some((id) =>
                isOwnSender(id, meId),
              ),
          )}
          onPeoplePress={() => onTripPeople(resolvedTrip)}
          onRequestJoin={() => onTripRequest(resolvedTrip)}
          onCancelRequest={() => onTripCancelRequest?.(resolvedTrip)}
          onOpenTrip={() => onOpenTrip?.(resolvedTrip)}
          onAcceptInvite={() => {
            if (resolvedTrip.myPendingInviteId) {
              void chatRepo.respondTripInvite(
                resolvedTrip.myPendingInviteId,
                true,
              );
            }
          }}
        />
      ) : message.kind === 'trip' ? (
        <View
          style={[
            styles.bubble,
            isMine ? styles.mine : styles.theirs,
            styles.tripLoading,
          ]}
        >
          {tripLoading ? (
            <ActivityIndicator color={colors.brandTeal} />
          ) : (
            <Text style={styles.body}>
              {message.body || 'Trip attachment'}
            </Text>
          )}
        </View>
      ) : message.kind === 'post' ? (
        <PostMessageCard
          post={post ?? null}
          postId={message.postId ?? post?.id ?? null}
          author={postAuthor ?? null}
          fallbackImage={message.imageUrl}
          photoAsset={
            typeof message.metadata?.photoAsset === 'number'
              ? message.metadata.photoAsset
              : null
          }
          locationLabel={
            typeof message.metadata?.locationLabel === 'string'
              ? message.metadata.locationLabel
              : undefined
          }
          onViewPost={() => {
            const id = message.postId ?? post?.id;
            if (id) onViewPost?.(id);
          }}
          onOpenTaggedTrip={
            post?.taggedTripId
              ? () => onOpenTaggedTrip?.(post.taggedTripId!)
              : undefined
          }
        />
      ) : message.kind === 'poll' && poll ? (
        <View style={[styles.bubble, isMine ? styles.mine : styles.theirs, styles.pollBox]}>
          <Text style={styles.pollQ}>{poll.question}</Text>
          {poll.options.map((o) => (
            <Pressable
              key={o.id}
              style={[
                styles.pollOpt,
                poll.myVoteOptionId === o.id && styles.pollOptMine,
              ]}
              onPress={() => onVotePoll?.(poll.id, o.id)}
            >
              <Text style={styles.pollOptText}>{o.label}</Text>
              <Text style={styles.pollVotes}>{o.votes}</Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <View style={[styles.bubble, isMine ? styles.mine : styles.theirs]}>
          {message.imageUrl ? (
            <Image
              source={{ uri: message.imageUrl }}
              style={styles.image}
              resizeMode="cover"
            />
          ) : null}
          {message.metadata?.hasFoodImage && !message.imageUrl ? (
            <View style={styles.foodPlaceholder}>
              <Text style={styles.foodPlaceholderText}>📷 Photo</Text>
            </View>
          ) : null}
          {message.body ? (
            <Text style={styles.body}>{message.body}</Text>
          ) : null}
          {message.body && (!message.kind || message.kind === 'text') ? (
            <LinkPreviewCard text={message.body} isMine={isMine} />
          ) : null}
          <View style={[styles.tail, isMine ? styles.tailMine : styles.tailTheirs]} />
        </View>
      )}

      {message.reactions.length > 0 ? (
        <View style={[styles.reactionRow, isMine && { alignSelf: 'flex-end' }]}>
          {message.reactions.map((r) => (
            <View key={r.emoji} style={styles.reactionChip}>
              <Text style={styles.reactionEmoji}>{r.emoji}</Text>
              {r.userIds.length > 1 ? (
                <Text style={styles.reactionCount}>{r.userIds.length}</Text>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
    </Pressable>
  );

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        style={[
          styles.row,
          isMine ? styles.rowMine : styles.rowTheirs,
          animStyle,
        ]}
      >
        {!isMine ? (
          <View style={styles.avatarSlot}>
            {showAvatar && sender ? (
              <Pressable
                onPress={() => onAvatarPress?.(sender.id)}
                hitSlop={8}
                disabled={!onAvatarPress}
              >
                <Avatar
                  source={sender.avatar}
                  name={sender.fullName}
                  size={33}
                />
              </Pressable>
            ) : null}
          </View>
        ) : null}
        <View style={[styles.col, isMine && styles.colMine]}>
          {!isMine && showName && sender ? (
            <Text style={styles.name}>{sender.fullName}</Text>
          ) : null}
          {bubble}
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

export { REACTIONS };

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    marginBottom: 10,
    paddingHorizontal: 12,
    alignItems: 'flex-end',
  },
  rowMine: { justifyContent: 'flex-end' },
  rowTheirs: { justifyContent: 'flex-start' },
  avatarSlot: { width: 40, marginRight: 4 },
  col: { maxWidth: '78%' },
  colMine: { alignItems: 'flex-end' },
  name: {
    fontSize: 10,
    color: colors.textMuted,
    marginBottom: 2,
    marginLeft: 8,
  },
  bubble: {
    backgroundColor: '#ECECEC',
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 10,
    position: 'relative',
  },
  theirs: { backgroundColor: '#ECECEC', alignSelf: 'flex-start' },
  mine: { backgroundColor: colors.brandMint, alignSelf: 'flex-end' },
  body: {
    fontSize: 18,
    lineHeight: 20,
    color: '#040000',
  },
  tail: {
    position: 'absolute',
    bottom: 4,
    width: 14,
    height: 14,
    backgroundColor: '#ECECEC',
    transform: [{ rotate: '45deg' }],
  },
  tailTheirs: { left: -4, backgroundColor: '#ECECEC' },
  tailMine: { right: -4, backgroundColor: colors.brandMint },
  system: {
    alignSelf: 'center',
    fontSize: 12,
    color: colors.textMuted,
    marginVertical: 8,
  },
  image: {
    width: 220,
    maxWidth: '100%',
    aspectRatio: 1,
    borderRadius: 14,
    marginBottom: 6,
    backgroundColor: '#ddd',
  },
  foodPlaceholder: {
    width: 220,
    aspectRatio: 1,
    borderRadius: 14,
    backgroundColor: '#ddd',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  foodPlaceholderText: { color: colors.textMuted },
  reactionRow: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 4,
  },
  reactionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.divider,
  },
  reactionEmoji: { fontSize: 14 },
  reactionCount: { fontSize: 11, marginLeft: 2, color: colors.textMuted },
  replyQuote: {
    borderLeftWidth: 3,
    borderLeftColor: colors.filterPurple,
    paddingLeft: 8,
    marginBottom: 4,
    opacity: 0.8,
  },
  replyQuoteMine: { borderLeftColor: colors.openJoin },
  replyQuoteText: { fontSize: 13, color: colors.textMuted },
  tripLoading: {
    minWidth: 180,
    minHeight: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pollBox: { minWidth: 200 },
  pollQ: { fontFamily: fonts.bold, fontSize: 16, marginBottom: 8 },
  pollOpt: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.white,
    borderRadius: 10,
    padding: 8,
    marginBottom: 6,
  },
  pollOptMine: { borderWidth: 1, borderColor: colors.programBlue },
  pollOptText: { fontSize: 14 },
  pollVotes: { fontSize: 13, color: colors.textMuted },
});

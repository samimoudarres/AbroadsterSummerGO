import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors, fonts } from '../../constants/theme';
import {
  extractFirstUrl,
  fetchLinkPreview,
  type LinkPreviewData,
} from '../../lib/chat/linkPreview';

interface LinkPreviewCardProps {
  text: string;
  isMine?: boolean;
}

export function LinkPreviewCard({ text, isMine }: LinkPreviewCardProps) {
  const url = extractFirstUrl(text);
  const [preview, setPreview] = useState<LinkPreviewData | null>(null);
  const [loading, setLoading] = useState(Boolean(url));

  useEffect(() => {
    if (!url) {
      setPreview(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const data = await fetchLinkPreview(url);
      if (!cancelled) {
        setPreview(data);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (!url) return null;

  const open = () => {
    void Linking.openURL(url);
  };

  return (
    <Pressable
      onPress={open}
      style={[styles.card, isMine ? styles.cardMine : styles.cardTheirs]}
    >
      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={colors.brandTeal} />
          <Text style={styles.loadingText}>Loading preview…</Text>
        </View>
      ) : preview?.imageUrl ? (
        <Image source={{ uri: preview.imageUrl }} style={styles.image} />
      ) : null}
      <View style={styles.meta}>
        {preview?.siteName ? (
          <Text style={styles.site} numberOfLines={1}>
            {preview.siteName.toUpperCase()}
          </Text>
        ) : null}
        {preview?.title ? (
          <Text style={styles.title} numberOfLines={2}>
            {preview.title}
          </Text>
        ) : null}
        {preview?.description ? (
          <Text style={styles.desc} numberOfLines={2}>
            {preview.description}
          </Text>
        ) : null}
        <Text style={styles.url} numberOfLines={1}>
          {url.replace(/^https?:\/\//, '')}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 8,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.08)',
    backgroundColor: colors.white,
    maxWidth: 280,
  },
  cardMine: {
    alignSelf: 'flex-end',
  },
  cardTheirs: {
    alignSelf: 'flex-start',
  },
  image: {
    width: '100%',
    height: 140,
    backgroundColor: '#eee',
  },
  meta: {
    padding: 10,
    gap: 2,
  },
  site: {
    fontFamily: fonts.bold,
    fontSize: 10,
    color: colors.textMuted,
    letterSpacing: 0.4,
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.black,
  },
  desc: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 16,
  },
  url: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.brandTeal,
    marginTop: 2,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
  },
  loadingText: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textMuted,
  },
});

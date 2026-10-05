import React, { useMemo } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts } from '../../constants/theme';
import { useBottomNavClearance, usePhoneTopPad } from '../../lib/layout/safeArea';

export type OnboardingTourStepId =
  | 'welcome'
  | 'home'
  | 'chat'
  | 'trips'
  | 'map'
  | 'profile';

export type OnboardingTourStep = {
  id: OnboardingTourStepId;
  title: string;
  body: string;
  hint?: string;
  /** Approximate coach-mark position in screen % */
  spotlight?: {
    topPct: number;
    leftPct: number;
    widthPct: number;
    heightPct: number;
    label: string;
  };
  primaryLabel: string;
};

/** Bottom-nav tab index (0–4) highlighted under the tour card. */
const NAV_TAB_INDEX: Record<OnboardingTourStepId, number | null> = {
  welcome: null,
  home: 0,
  chat: 1,
  trips: 2,
  map: 3,
  profile: 4,
};

export const ONBOARDING_TOUR_STEPS: OnboardingTourStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to Abroadster',
    body: 'The scrapbook of your best semester yet. Friends, trips, and memories in one place.',
    primaryLabel: 'Get started',
  },
  {
    id: 'home',
    title: 'This is your feed',
    body: 'See posts from friends and public travelers. Stamp what you love and leave a comment.',
    spotlight: {
      topPct: 6,
      leftPct: 78,
      widthPct: 14,
      heightPct: 7,
      label: 'Tap here to make a post',
    },
    primaryLabel: 'Next',
  },
  {
    id: 'chat',
    title: 'Your channels',
    body: 'School chat is everyone from your home university. Abroad chat is your program abroad. AirMail is private messaging with friends.',
    spotlight: {
      topPct: 18,
      leftPct: 6,
      widthPct: 42,
      heightPct: 12,
      label: 'Channels and AirMail live here',
    },
    primaryLabel: 'Next',
  },
  {
    id: 'trips',
    title: 'Trips',
    body: 'See what friends are planning. Add friends to unlock more trip boards.',
    spotlight: {
      topPct: 6,
      leftPct: 62,
      widthPct: 32,
      heightPct: 7,
      label: 'Create your first trip here',
    },
    primaryLabel: 'Next',
  },
  {
    id: 'map',
    title: 'The map',
    body: 'See friends across Europe, who is traveling where, and what trips are coming up.',
    primaryLabel: 'Next',
  },
  {
    id: 'profile',
    title: 'Your profile',
    body: 'Posts you share show up here. Open the globe to rank cities you have visited and unlock stamps.',
    spotlight: {
      topPct: 42,
      leftPct: 52,
      widthPct: 20,
      heightPct: 6,
      label: 'Globe opens your stamps',
    },
    primaryLabel: 'Finish',
  },
];

type Props = {
  visible: boolean;
  stepIndex: number;
  onSkip: () => void;
  onPrimary: () => void;
};

export function OnboardingTourOverlay({
  visible,
  stepIndex,
  onSkip,
  onPrimary,
}: Props) {
  const { width, height } = useWindowDimensions();
  const topPad = usePhoneTopPad(8);
  const navClearance = useBottomNavClearance();
  const step = ONBOARDING_TOUR_STEPS[stepIndex] ?? ONBOARDING_TOUR_STEPS[0];
  const progress = `${stepIndex + 1}/${ONBOARDING_TOUR_STEPS.length}`;

  const spot = useMemo(() => {
    if (!step.spotlight) return null;
    const s = step.spotlight;
    return {
      top: (height * s.topPct) / 100 + topPad * 0.15,
      left: (width * s.leftPct) / 100,
      width: (width * s.widthPct) / 100,
      height: (height * s.heightPct) / 100,
      label: s.label,
    };
  }, [step, height, width, topPad]);

  const navHighlight = useMemo(() => {
    const tab = NAV_TAB_INDEX[step.id];
    if (tab == null) return null;
    const tabCount = 5;
    const sidePad = 8;
    const usable = width - sidePad * 2;
    const tabW = usable / tabCount;
    const boxW = Math.min(56, tabW - 4);
    return {
      left: sidePad + tab * tabW + (tabW - boxW) / 2,
      width: boxW,
      height: 44,
      bottom: Math.max(10, navClearance - 52),
    };
  }, [step.id, width, navClearance]);

  if (!visible) return null;

  // Keep label readable: never clip to the narrow spotlight width
  const labelMaxWidth = Math.min(280, width - 32);
  const labelLeft = spot
    ? Math.min(
        Math.max(16, spot.left + spot.width / 2 - labelMaxWidth / 2),
        width - labelMaxWidth - 16,
      )
    : 16;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onSkip}
    >
      <View style={styles.root} pointerEvents="box-none">
        <View style={styles.dim} />

        {spot ? (
          <>
            <View
              style={[
                styles.spotlight,
                {
                  top: spot.top,
                  left: spot.left,
                  width: spot.width,
                  height: spot.height,
                },
              ]}
              pointerEvents="none"
            >
              <View style={styles.spotlightRing} />
            </View>
            <View
              style={[
                styles.spotlightLabelWrap,
                {
                  top: spot.top + spot.height + 8,
                  left: labelLeft,
                  maxWidth: labelMaxWidth,
                },
              ]}
              pointerEvents="none"
            >
              <Text style={styles.spotlightLabel}>{spot.label}</Text>
            </View>
          </>
        ) : null}

        {navHighlight ? (
          <View
            style={[
              styles.navHighlight,
              {
                left: navHighlight.left,
                bottom: navHighlight.bottom,
                width: navHighlight.width,
                height: navHighlight.height,
              },
            ]}
            pointerEvents="none"
          />
        ) : null}

        <View
          style={[
            styles.card,
            {
              marginTop: topPad + 24,
              marginBottom: Math.max(16, navClearance + 8),
            },
          ]}
        >
          <View style={styles.cardTop}>
            <Text style={styles.progress}>{progress}</Text>
            <Pressable
              onPress={onSkip}
              hitSlop={12}
              accessibilityLabel="Skip onboarding"
              style={styles.skipBtn}
            >
              <Text style={styles.skipText}>Skip</Text>
              <Ionicons name="close" size={18} color={colors.textMuted} />
            </Pressable>
          </View>

          <Text style={styles.title}>{step.title}</Text>
          <Text style={styles.body}>{step.body}</Text>
          {step.hint ? <Text style={styles.hint}>{step.hint}</Text> : null}

          <Pressable
            style={styles.primary}
            onPress={onPrimary}
            accessibilityRole="button"
          >
            <Text style={styles.primaryText}>{step.primaryLabel}</Text>
          </Pressable>
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
  dim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(20, 24, 28, 0.45)',
  },
  spotlight: {
    position: 'absolute',
    alignItems: 'center',
    zIndex: 2,
  },
  spotlightRing: {
    borderWidth: 2,
    borderColor: colors.brandTeal,
    borderRadius: 14,
    backgroundColor: 'rgba(23, 88, 100, 0.12)',
    width: '100%',
    height: '100%',
  },
  spotlightLabelWrap: {
    position: 'absolute',
    zIndex: 3,
    alignItems: 'center',
  },
  spotlightLabel: {
    textAlign: 'center',
    fontFamily: fonts.bold,
    fontSize: 13,
    lineHeight: 18,
    color: colors.white,
    backgroundColor: colors.brandTeal,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    flexShrink: 1,
  },
  navHighlight: {
    position: 'absolute',
    zIndex: 2,
    borderWidth: 2,
    borderColor: colors.brandTeal,
    borderRadius: 14,
    backgroundColor: 'rgba(23, 88, 100, 0.18)',
  },
  card: {
    marginHorizontal: 16,
    backgroundColor: colors.white,
    borderRadius: 18,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 18,
    zIndex: 4,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  progress: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.textMuted,
  },
  skipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  skipText: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.textMuted,
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: 22,
    color: colors.black,
    marginBottom: 8,
  },
  body: {
    fontFamily: fonts.regular,
    fontSize: 15,
    lineHeight: 22,
    color: colors.textMuted,
    marginBottom: 12,
  },
  hint: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.brandTeal,
    marginBottom: 12,
  },
  primary: {
    backgroundColor: colors.brandTeal,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  primaryText: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.white,
  },
});

import React, { useState } from 'react';
import {
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { BRAND_TEAL, colors, fonts } from '../../constants/theme';
import { usePhoneTopPad } from '../../lib/layout/safeArea';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Figma 160:350 */
const LOGO = require('../../assets/auth/welcome-logo.png');
/** Figma 160:351 — 3× export so liquid-glass pin glows stay sharp */
const MAP_SHOT = require('../../assets/auth/welcome-map-figma.png');

/** Figma frame 160:344 artboard */
const FIGMA_W = 375;
const FIGMA_H = 888;

/** Extra map scale so edge pin glows aren't hard-clipped at the phone rim */
const MAP_OVERSCALE = 1.14;

interface WelcomeScreenProps {
  onCreateAccount: () => void;
  onLogin: () => void;
}

/**
 * Welcome matched to Figma 160:344 with a lowered CTA band (more map)
 * and a liquid-glass Log in pill. Soft teal blur-shadow kept at the seam.
 */
export function WelcomeScreen({ onCreateAccount, onLogin }: WelcomeScreenProps) {
  const topPad = usePhoneTopPad(0);
  const insets = useSafeAreaInsets();
  const [size, setSize] = useState({ w: FIGMA_W, h: FIGMA_H });

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) {
      setSize({ w: width, h: height });
    }
  };

  const sx = size.w / FIGMA_W;
  const sy = size.h / FIGMA_H;
  const st = Math.min(sx, sy);

  const topBarH = Math.max(84 * sy, topPad + 51 * sy + 2);

  // Lift CTAs off the home-indicator / screen edge
  const footerPadBottom = Math.max(insets.bottom, 8) + 44 * sy;
  const footerContentH = 248 * sy + footerPadBottom;
  const footerTop = Math.max(topBarH + 200 * sy, size.h - footerContentH);
  const footerH = size.h - footerTop;

  const mapTop = topBarH - 10 * sy;
  const mapH = Math.max(0, footerTop + 44 * sy - mapTop);
  const mapW = size.w * MAP_OVERSCALE;
  const mapLeft = (size.w - mapW) / 2;
  const mapDrawH = mapH * MAP_OVERSCALE;
  const mapDrawTop = mapTop - (mapDrawH - mapH) / 2;

  const btnW = 295 * sx;
  const btnH = 44 * sy;
  const sideInset = 40 * sx;
  const fadeH = 84 * sy;

  return (
    <View style={styles.root} onLayout={onLayout}>
      <StatusBar style="light" />

      <Image
        source={MAP_SHOT}
        style={[
          styles.map,
          {
            top: mapDrawTop,
            left: mapLeft,
            width: mapW,
            height: mapDrawH,
          },
        ]}
        resizeMode="cover"
      />

      {/* Soft teal blur-shadow under header */}
      <LinearGradient
        pointerEvents="none"
        colors={[
          BRAND_TEAL,
          'rgba(23,88,100,0.78)',
          'rgba(23,88,100,0.32)',
          'rgba(23,88,100,0)',
        ]}
        locations={[0, 0.28, 0.62, 1]}
        style={[styles.fade, { top: topBarH - 2, height: fadeH, zIndex: 2 }]}
      />

      {/* Soft teal blur-shadow above lowered footer */}
      <LinearGradient
        pointerEvents="none"
        colors={[
          'rgba(23,88,100,0)',
          'rgba(23,88,100,0.3)',
          'rgba(23,88,100,0.78)',
          BRAND_TEAL,
        ]}
        locations={[0, 0.38, 0.72, 1]}
        style={[
          styles.fade,
          {
            top: footerTop - fadeH + 2,
            height: fadeH,
            zIndex: 2,
          },
        ]}
      />

      <View
        style={[
          styles.topBar,
          { height: topBarH, paddingTop: topPad },
          Platform.OS === 'web'
            ? styles.topBarShadowWeb
            : styles.topBarShadowNative,
        ]}
      >
        <View style={styles.logoSlot}>
          <Image
            source={LOGO}
            style={{
              width: 182 * sx,
              height: 46 * sy,
              backgroundColor: 'transparent',
            }}
            resizeMode="contain"
          />
        </View>
      </View>

      <View
        style={[
          styles.footer,
          {
            top: footerTop,
            height: footerH,
            paddingHorizontal: sideInset,
            paddingBottom: footerPadBottom,
          },
          Platform.OS === 'web'
            ? styles.footerShadowWeb
            : styles.footerShadowNative,
        ]}
      >
        <Text
          style={[
            styles.tagline,
            {
              marginTop: 8 * sy,
              width: 307 * sx,
              fontSize: 13 * st,
              lineHeight: 18 * st,
            },
          ]}
        >
          Find your people abroad.{'\n'}
          Plan trips.{'\n'}
          Share the moments.
        </Text>

        <Text
          style={[
            styles.ageNote,
            {
              marginTop: 10 * sy,
              width: 307 * sx,
              fontSize: 11 * st,
              lineHeight: 15 * st,
            },
          ]}
        >
          Abroadster is for ages 13+. Age is verified during sign-up.
        </Text>

        <Pressable
          onPress={onCreateAccount}
          accessibilityRole="button"
          accessibilityLabel="Create account"
          style={({ pressed }) => [
            styles.btnCreate,
            {
              width: btnW,
              height: btnH,
              marginTop: 20 * sy,
              borderRadius: 100,
            },
            pressed && styles.btnPressed,
          ]}
        >
          <Text
            style={[
              styles.btnCreateText,
              { fontSize: 13 * st, lineHeight: 18 * st },
            ]}
          >
            Create account
          </Text>
        </Pressable>

        {/* Liquid glass Log in — Figma 160:355 */}
        <Pressable
          onPress={onLogin}
          accessibilityRole="button"
          accessibilityLabel="Log in"
          style={({ pressed }) => [
            styles.btnLoginOuter,
            {
              width: btnW,
              height: btnH,
              marginTop: 14 * sy,
              borderRadius: 100,
            },
            pressed && styles.btnPressed,
          ]}
        >
          {Platform.OS === 'web' ? (
            <View style={[styles.btnLoginGlass, styles.btnLoginGlassWeb]}>
              <Text
                style={[
                  styles.btnLoginText,
                  { fontSize: 13 * st, lineHeight: 18 * st },
                ]}
              >
                Log in
              </Text>
            </View>
          ) : (
            <BlurView intensity={48} tint="light" style={styles.btnLoginGlass}>
              <View style={styles.btnLoginTint}>
                <Text
                  style={[
                    styles.btnLoginText,
                    { fontSize: 13 * st, lineHeight: 18 * st },
                  ]}
                >
                  Log in
                </Text>
              </View>
            </BlurView>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BRAND_TEAL,
    overflow: 'hidden',
  },
  map: {
    position: 'absolute',
    zIndex: 0,
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: BRAND_TEAL,
    zIndex: 4,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  topBarShadowWeb: {
    boxShadow: '0px 36px 48px 18px #175864',
  } as object,
  topBarShadowNative: {
    shadowColor: BRAND_TEAL,
    shadowOffset: { width: 0, height: 28 },
    shadowOpacity: 1,
    shadowRadius: 36,
    elevation: 24,
  },
  logoSlot: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  fade: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: BRAND_TEAL,
    zIndex: 4,
    alignItems: 'center',
  },
  footerShadowWeb: {
    boxShadow: '0px -36px 48px 18px #175864',
  } as object,
  footerShadowNative: {
    shadowColor: BRAND_TEAL,
    shadowOffset: { width: 0, height: -28 },
    shadowOpacity: 1,
    shadowRadius: 36,
    elevation: 24,
  },
  tagline: {
    fontFamily: fonts.regular,
    color: colors.white,
    textAlign: 'center',
  },
  ageNote: {
    fontFamily: fonts.regular,
    color: 'rgba(255,255,255,0.88)',
    textAlign: 'center',
  },
  btnCreate: {
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0px 4px 14px rgba(0,0,0,0.16)' } as object)
      : null),
  },
  btnCreateText: {
    fontFamily: fonts.bold,
    color: BRAND_TEAL,
    textAlign: 'center',
  },
  btnLoginOuter: {
    overflow: 'hidden',
  },
  btnLoginGlass: {
    flex: 1,
    borderRadius: 100,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: 'rgba(217,217,217,0.14)',
    borderWidth: 1.25,
    borderColor: 'rgba(255,255,255,0.75)',
  },
  btnLoginGlassWeb: {
    backdropFilter: 'blur(24px) saturate(180%)',
    WebkitBackdropFilter: 'blur(24px) saturate(180%)',
    backgroundColor: 'rgba(217,217,217,0.18)',
    boxShadow:
      'inset 0 1px 0 rgba(255,255,255,0.55), inset 0 -1px 0 rgba(255,255,255,0.1), 0 2px 12px rgba(0,0,0,0.12)',
  } as object,
  btnLoginTint: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(217,217,217,0.12)',
    borderRadius: 100,
  },
  btnLoginText: {
    fontFamily: fonts.bold,
    color: colors.white,
    textAlign: 'center',
  },
  btnPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.985 }],
  },
});

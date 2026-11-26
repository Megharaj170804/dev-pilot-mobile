import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Image, StyleSheet, Text, View } from 'react-native';
import { RADII, SPACING } from '../constants/theme';
import { useApp } from '../context/AppContext';

const SPLASH_LOGO = require('../../assets/icon.png');

export function AppSplashScreen() {
  const { palette } = useApp();
  const scaleAnim = useRef(new Animated.Value(0.88)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 6,
        tension: 60,
        useNativeDriver: true,
      }),
    ]).start();

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.85, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.35, duration: 900, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [fadeAnim, scaleAnim, pulseAnim]);

  return (
    <View style={[styles.root, { backgroundColor: palette.bg }]}>
      <Animated.View
        style={[
          styles.glowRing,
          {
            borderColor: palette.primary,
            backgroundColor: palette.primaryMuted,
            opacity: pulseAnim,
            transform: [{ scale: scaleAnim }],
          },
        ]}
      />

      <Animated.View
        style={[
          styles.centerCard,
          { opacity: fadeAnim, transform: [{ scale: scaleAnim }] },
        ]}
      >
        <View style={[styles.logoTile, { borderColor: palette.borderStrong }]}>
          <Image source={SPLASH_LOGO} style={styles.logoImage} resizeMode="cover" />
        </View>

        <Text style={[styles.brand, { color: palette.text }]}>DevPilot</Text>
        <Text style={[styles.tagline, { color: palette.textMuted }]}>
          Offline-First Developer Workflow Platform
        </Text>

        <View style={styles.pillRow}>
          {['SQLite Offline Vault', 'Redmine Sync', 'PR & EOD Tools'].map(label => (
            <View
              key={label}
              style={[
                styles.chip,
                { backgroundColor: palette.surface, borderColor: palette.border },
              ]}
            >
              <Text style={{ color: palette.text2, fontSize: 11, fontWeight: '600' }}>{label}</Text>
            </View>
          ))}
        </View>

        <View style={[styles.statusBar, { backgroundColor: palette.surface, borderColor: palette.borderSubtle }]}>
          <Animated.View style={[styles.statusDot, { backgroundColor: palette.success, opacity: pulseAnim }]} />
          <Text style={{ color: palette.textMuted, fontSize: 12, fontWeight: '500' }}>
            Opening local SQLite workspace…
          </Text>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xl,
  },
  glowRing: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 120,
    borderWidth: 1,
  },
  centerCard: {
    alignItems: 'center',
    gap: SPACING.md,
    maxWidth: 340,
  },
  logoTile: {
    width: 88,
    height: 88,
    borderRadius: RADII.xl,
    borderWidth: 1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  logoImage: {
    width: 88,
    height: 88,
  },
  brand: {
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: 13.5,
    textAlign: 'center',
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginTop: 6,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RADII.pill,
    borderWidth: 1,
  },
  statusBar: {
    marginTop: SPACING.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: RADII.pill,
    borderWidth: 1,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});

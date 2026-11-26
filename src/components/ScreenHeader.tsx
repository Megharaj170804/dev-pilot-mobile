import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RADII, SPACING } from '../constants/theme';
import { useApp } from '../context/AppContext';
import { AppIcon } from './AppIcon';

export function ScreenHeader({
  title,
  subtitle,
  showBack = false,
}: {
  title: string;
  subtitle?: string;
  showBack?: boolean;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { palette, isOnline, isSyncing, pendingQueueCount, setCommandPaletteOpen, syncNow } = useApp();

  return (
    <View
      style={[
        styles.wrap,
        {
          paddingTop: Math.max(insets.top, 12),
          backgroundColor: palette.bgElevated,
          borderBottomColor: palette.borderSubtle,
        },
      ]}
    >
      <View style={styles.left}>
        {showBack ? (
          <Pressable onPress={() => router.back()} style={styles.iconBtn}>
            <AppIcon name="arrow-back" size={20} color={palette.text} />
          </Pressable>
        ) : (
          <View style={[styles.logoBox, { backgroundColor: palette.primary }]}>
            <AppIcon name="flash" size={14} color="#FFFFFF" />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: palette.text }]} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={[styles.sub, { color: palette.textMuted }]} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.actions}>
        <Pressable
          onPress={() => syncNow()}
          style={[
            styles.statusPill,
            {
              backgroundColor: isOnline ? palette.successSurface : palette.warningSurface,
            },
          ]}
        >
          <View
            style={[
              styles.dot,
              { backgroundColor: isOnline ? palette.success : palette.warning },
            ]}
          />
          <Text
            style={{
              fontSize: 11,
              fontWeight: '600',
              color: isOnline ? palette.success : palette.warning,
            }}
          >
            {isSyncing ? 'Sync…' : isOnline ? 'Online' : 'Offline'}
            {pendingQueueCount ? ` (${pendingQueueCount})` : ''}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setCommandPaletteOpen(true)}
          style={[styles.iconBtn, { backgroundColor: palette.surface2, borderColor: palette.border, borderWidth: 1 }]}
        >
          <AppIcon name="search" size={16} color={palette.text} />
        </Pressable>

        <Pressable
          onPress={() => router.push('/settings')}
          style={[styles.iconBtn, { backgroundColor: palette.surface2, borderColor: palette.border, borderWidth: 1 }]}
        >
          <AppIcon name="settings-outline" size={16} color={palette.text} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    gap: 10,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  logoBox: {
    width: 28,
    height: 28,
    borderRadius: RADII.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
  },
  sub: {
    fontSize: 11.5,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: RADII.pill,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 99,
  },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: RADII.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

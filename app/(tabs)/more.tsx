import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { Badge, Card, OfflineBanner, ScreenScroll } from '../../src/components/ui';
import { RADII, SPACING } from '../../src/constants/theme';
import { useApp } from '../../src/context/AppContext';

interface ToolLink {
  route: '/pr-comments' | '/kpi-comments' | '/eod-updates' | '/settings' | '/about';
  title: string;
  desc: string;
  icon: keyof typeof Ionicons.glyphMap;
  badge?: string;
}

export default function ToolsHubScreen() {
  const router = useRouter();
  const { palette, themeMode, toggleTheme, pendingQueueCount, lastSyncedAt } = useApp();

  const tools: ToolLink[] = [
    {
      route: '/pr-comments',
      title: 'PR Comments',
      desc: 'Collect PR review comments & build Claude / Antigravity fix prompts (cached offline)',
      icon: 'chatbubbles-outline',
    },
    {
      route: '/kpi-comments',
      title: 'KPI Comments',
      desc: 'Monthly (21st -> 20th) Redmine KPI generator & DIR calculator',
      icon: 'ribbon-outline',
    },
    {
      route: '/eod-updates',
      title: 'EOD Updates Sheet',
      desc: 'Offline-capable Google Sheet viewer, editor, TSV copy & Redmine import',
      icon: 'grid-outline',
    },
    {
      route: '/settings',
      title: 'Settings & Sync Outbox',
      desc: 'Redmine / GitHub / AI keys, Server Proxy mode & pending offline queue',
      icon: 'settings-outline',
      badge: pendingQueueCount > 0 ? `${pendingQueueCount} queued` : undefined,
    },
    {
      route: '/about',
      title: 'About DevPilot',
      desc: 'Full walkthrough of all 7 workflows, offline SQLite vault & sync architecture',
      icon: 'information-circle-outline',
    },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <ScreenHeader title="Tools & Offline Sync" subtitle={lastSyncedAt ? `Last synced ${lastSyncedAt.slice(0, 16).replace('T', ' ')}` : 'SQLite local store'} />

      <ScreenScroll>
        <OfflineBanner onPressQueue={() => router.push('/settings')} />

        {tools.map(t => (
          <Pressable key={t.route} onPress={() => router.push(t.route)}>
            <Card>
              <View style={styles.row}>
                <View style={[styles.iconBox, { backgroundColor: palette.primaryMuted }]}>
                  <Ionicons name={t.icon} size={22} color={palette.primaryInk} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ color: palette.text, fontWeight: '700', fontSize: 15 }}>{t.title}</Text>
                    {t.badge ? <Badge label={t.badge} tone="warning" /> : null}
                  </View>
                  <Text style={{ color: palette.textMuted, fontSize: 12.5 }}>{t.desc}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={palette.textSubtle} />
              </View>
            </Card>
          </Pressable>
        ))}

        <Pressable onPress={toggleTheme}>
          <Card>
            <View style={styles.row}>
              <View style={[styles.iconBox, { backgroundColor: palette.surface2 }]}>
                <Ionicons name={themeMode === 'dark' ? 'sunny-outline' : 'moon-outline'} size={22} color={palette.text} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: palette.text, fontWeight: '700', fontSize: 15 }}>
                  Appearance: {themeMode === 'dark' ? 'Apple Pro Dark' : 'Studio Light'}
                </Text>
                <Text style={{ color: palette.textMuted, fontSize: 12.5 }}>Tap to toggle theme</Text>
              </View>
            </View>
          </Card>
        </Pressable>
      </ScreenScroll>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: SPACING.lg,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: RADII.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

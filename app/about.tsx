import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { Badge, Button, Card, CardHeader, ScreenScroll } from '../src/components/ui';
import { RADII, SPACING } from '../src/constants/theme';
import { useApp } from '../src/context/AppContext';

const APP_VERSION = '1.0.0';
const REPO_URL = 'https://github.com/Megharaj170804/dev-pilot-mobile';

interface FeatureGuide {
  title: string;
  route: '/(tabs)' | '/(tabs)/sync-pr' | '/(tabs)/quick-task' | '/(tabs)/hierarchy' | '/pr-comments' | '/kpi-comments' | '/eod-updates';
  icon: keyof typeof Ionicons.glyphMap;
  summary: string;
  offlineNote: string;
}

const FEATURES: FeatureGuide[] = [
  {
    title: 'Daily Workspace',
    route: '/(tabs)',
    icon: 'today-outline',
    summary: 'In-progress & pinned Redmine task queue, inline status updates, Today time breakdown, 30-day 8h weekday audit with 1-tap catch-up, Today meetings, and Standup / EOD composer.',
    offlineNote: 'Reads cached tasks & 30-day entries from SQLite; queues status and time logs offline.',
  },
  {
    title: 'PR -> Redmine Sync',
    route: '/(tabs)/sync-pr',
    icon: 'git-pull-request-outline',
    summary: '3-step wizard that turns any GitHub Pull Request into a structured Redmine task with AI/template Subject, Description, Acceptance Criteria, and Implementation Steps (Redmine Textile preview).',
    offlineNote: 'Cached PRs open offline; new task creation queues into sync_queue until reconnected.',
  },
  {
    title: 'Quick Task',
    route: '/(tabs)/quick-task',
    icon: 'add-circle-outline',
    summary: 'Log meetings, reviews, and ad-hoc engineering work from quick presets or Google Calendar events — creates a Resolved Redmine task and logs hours in one step.',
    offlineNote: 'Local template drafts work offline; submission replays automatically on reconnect.',
  },
  {
    title: 'Work Hierarchy',
    route: '/(tabs)/hierarchy',
    icon: 'layers-outline',
    summary: 'Explore your Epic -> Feature -> Task/Bug hierarchy across Outline, Kanban Board, and Live Activity views, with 6 KPI tiles and a My Time Today progress ring.',
    offlineNote: 'Full project tree and issue drawer render from SQLite in Airplane Mode.',
  },
  {
    title: 'PR Comments',
    route: '/pr-comments',
    icon: 'chatbubbles-outline',
    summary: 'Collect GitHub PR conversation, inline code review, and review summary comments, filter by author or latest round, and generate Claude Code / Antigravity fix prompts.',
    offlineNote: 'Previously fetched PR discussions remain available offline for prompt generation.',
  },
  {
    title: 'KPI Comments',
    route: '/kpi-comments',
    icon: 'ribbon-outline',
    summary: 'Monthly (21st -> 20th) Redmine KPI builder with automated metrics (1.3, 2.1, 2.2, 3.1 DIR), filtered tracker links, and 1-line context AI / local note drafting.',
    offlineNote: 'Computes KPIs from cached SQLite issues & time logs and saves drafts locally.',
  },
  {
    title: 'EOD Updates Sheet',
    route: '/eod-updates',
    icon: 'grid-outline',
    summary: 'Multi-tab Google Sheet viewer and editor with month filter, search, Pull Today from Redmine, inline row editing, duplication, deletion, and TSV table export.',
    offlineNote: 'Cached sheet rows are editable offline; cell edits, appends, and deletes queue in SQLite.',
  },
];

export default function AboutScreen() {
  const router = useRouter();
  const { palette } = useApp();

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <ScreenHeader title="About DevPilot" subtitle={`Mobile & Offline Edition · v${APP_VERSION}`} showBack />

      <ScreenScroll>
        <Card>
          <View style={styles.hero}>
            <View style={[styles.logoBox, { backgroundColor: palette.primary }]}>
              <Ionicons name="flash" size={28} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ color: palette.text, fontSize: 18, fontWeight: '800' }}>DevPilot Mobile</Text>
                <Badge label={`v${APP_VERSION}`} tone="primary" />
              </View>
              <Text style={{ color: palette.textMuted, fontSize: 13, lineHeight: 19 }}>
                Offline-first React Native Expo companion to the DevPilot developer workflow platform, engineered for ONDC A&amp;I.
              </Text>
            </View>
          </View>
        </Card>

        <Card>
          <CardHeader title="How Offline & Live Sync Work" subtitle="SQLite + Outbox Queue + Server/Direct Modes" />
          <View style={styles.body}>
            {[
              {
                icon: 'server-outline' as const,
                title: 'SQLite Local Vault (WAL Mode)',
                desc: 'Every Redmine issue, 30-day time entry, PR cache, Google Calendar event, EOD sheet tab, and KPI draft is persisted locally in SQLite so screens open instantly even without internet.',
              },
              {
                icon: 'cloud-upload-outline' as const,
                title: 'Durable Sync Outbox (sync_queue)',
                desc: 'Status updates, time logs, PR tasks, Quick Tasks, and EOD sheet edits made offline apply optimistically and replay sequentially as soon as connectivity returns.',
              },
              {
                icon: 'swap-horizontal-outline' as const,
                title: 'DevPilot Server Proxy vs Direct REST',
                desc: 'Use DevPilot Server Proxy to share identical Redmine, Sync History, Google Calendar, and Google Sheets data with the Web app — or Direct REST mode to talk straight to Redmine & GitHub.',
              },
            ].map(item => (
              <View
                key={item.title}
                style={[styles.archRow, { backgroundColor: palette.surface2, borderColor: palette.borderSubtle }]}
              >
                <Ionicons name={item.icon} size={20} color={palette.primaryInk} style={{ marginTop: 2 }} />
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={{ color: palette.text, fontWeight: '700', fontSize: 13.5 }}>{item.title}</Text>
                  <Text style={{ color: palette.textMuted, fontSize: 12.5, lineHeight: 18 }}>{item.desc}</Text>
                </View>
              </View>
            ))}
          </View>
        </Card>

        <Card>
          <CardHeader title="All 7 Modules Included" subtitle="Tap any module to open it" />
          <View style={styles.body}>
            {FEATURES.map(f => (
              <Pressable
                key={f.title}
                onPress={() => router.push(f.route)}
                style={[styles.featureCard, { backgroundColor: palette.surface2, borderColor: palette.borderSubtle }]}
              >
                <View style={styles.featureHead}>
                  <Ionicons name={f.icon} size={18} color={palette.primaryInk} />
                  <Text style={{ color: palette.text, fontWeight: '700', fontSize: 14, flex: 1 }}>{f.title}</Text>
                  <Ionicons name="chevron-forward" size={16} color={palette.textSubtle} />
                </View>
                <Text style={{ color: palette.text2, fontSize: 12.5, lineHeight: 18 }}>{f.summary}</Text>
                <Text style={{ color: palette.success, fontSize: 11.5, fontWeight: '600' }}>
                  Offline: {f.offlineNote}
                </Text>
              </Pressable>
            ))}
          </View>
        </Card>

        <Card>
          <CardHeader title="Project & Repository" />
          <View style={styles.body}>
            <Text style={{ color: palette.textMuted, fontSize: 12.5 }}>
              Built with React Native, Expo Router, TypeScript, and expo-sqlite.
            </Text>
            <Button
              label="Open GitHub Repository"
              variant="ghost"
              icon="logo-github"
              onPress={() => Linking.openURL(REPO_URL)}
            />
            <Button
              label="Configure Settings & Sync"
              onPress={() => router.push('/settings')}
              icon="settings-outline"
            />
          </View>
        </Card>
      </ScreenScroll>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    padding: SPACING.lg,
  },
  logoBox: {
    width: 56,
    height: 56,
    borderRadius: RADII.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  archRow: {
    flexDirection: 'row',
    gap: 12,
    padding: SPACING.md,
    borderRadius: RADII.sm,
    borderWidth: 1,
  },
  featureCard: {
    padding: SPACING.md,
    borderRadius: RADII.sm,
    borderWidth: 1,
    gap: 6,
  },
  featureHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});

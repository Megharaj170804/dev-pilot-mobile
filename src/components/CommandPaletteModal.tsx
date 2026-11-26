import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { GITHUB_PR_URL_REGEX } from '../constants/config';
import { RADII, SPACING } from '../constants/theme';
import { useApp } from '../context/AppContext';
import { AppIcon, type AppIconName } from './AppIcon';

interface CommandAction {
  id: string;
  label: string;
  sub: string;
  icon: AppIconName;
  run: () => void;
}

export function CommandPaletteModal() {
  const router = useRouter();
  const {
    commandPaletteOpen,
    setCommandPaletteOpen,
    palette,
    themeMode,
    toggleTheme,
    syncNow,
  } = useApp();
  const [query, setQuery] = useState('');

  const close = () => {
    setCommandPaletteOpen(false);
    setQuery('');
  };

  const actions = useMemo<CommandAction[]>(() => {
    const q = query.trim();
    const list: CommandAction[] = [];

    if (GITHUB_PR_URL_REGEX.test(q)) {
      list.push({
        id: 'sync-pr-url',
        label: 'Sync this PR to Redmine',
        sub: 'Open PR -> Redmine wizard with URL',
        icon: 'git-pull-request-outline',
        run: () => {
          close();
          router.push({ pathname: '/(tabs)/sync-pr', params: { url: q } });
        },
      });
      list.push({
        id: 'pr-comments-url',
        label: 'Collect review comments for this PR',
        sub: 'Open PR Comments prompt builder',
        icon: 'chatbubbles-outline',
        run: () => {
          close();
          router.push({ pathname: '/pr-comments', params: { url: q } });
        },
      });
    }

    const navItems: CommandAction[] = [
      { id: 'daily', label: 'Daily Workspace', sub: "Today's queue, audit & standup", icon: 'today-outline', run: () => { close(); router.push('/(tabs)'); } },
      { id: 'sync-pr', label: 'New Sync (PR -> Redmine)', sub: 'Turn a GitHub PR into a task', icon: 'link-outline', run: () => { close(); router.push('/(tabs)/sync-pr'); } },
      { id: 'quick-task', label: 'Quick Task', sub: 'Meetings & ad-hoc time log', icon: 'add-circle-outline', run: () => { close(); router.push('/(tabs)/quick-task'); } },
      { id: 'hierarchy', label: 'Work Hierarchy', sub: 'Epic / Feature / Task / Board', icon: 'layers-outline', run: () => { close(); router.push('/(tabs)/hierarchy'); } },
      { id: 'eod-updates', label: 'EOD Updates Sheet', sub: 'Offline-cached Google Sheet table', icon: 'grid-outline', run: () => { close(); router.push('/eod-updates'); } },
      { id: 'pr-comments', label: 'PR Comments', sub: 'Build Claude / Antigravity fix prompts', icon: 'chatbubbles-outline', run: () => { close(); router.push('/pr-comments'); } },
      { id: 'kpi-comments', label: 'KPI Comments', sub: 'Monthly Redmine KPI generator', icon: 'ribbon-outline', run: () => { close(); router.push('/kpi-comments'); } },
      { id: 'settings', label: 'Settings & Sync Queue', sub: 'API keys, server mode & outbox', icon: 'settings-outline', run: () => { close(); router.push('/settings'); } },
      { id: 'about', label: 'About DevPilot', sub: 'Features guide & offline architecture', icon: 'information-circle-outline', run: () => { close(); router.push('/about'); } },
      {
        id: 'sync-now',
        label: 'Sync All with Redmine Now',
        sub: 'Flush offline outbox and pull deltas',
        icon: 'refresh-outline',
        run: () => {
          close();
          syncNow();
        },
      },
      {
        id: 'theme',
        label: themeMode === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme',
        sub: 'Appearance',
        icon: themeMode === 'dark' ? 'sunny-outline' : 'moon-outline',
        run: () => {
          close();
          toggleTheme();
        },
      },
    ];

    list.push(...navItems);
    if (!q || GITHUB_PR_URL_REGEX.test(q)) return list;
    const lower = q.toLowerCase();
    return list.filter(a => a.label.toLowerCase().includes(lower) || a.sub.toLowerCase().includes(lower));
  }, [query, router, syncNow, themeMode, toggleTheme]);

  if (!commandPaletteOpen) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close}>
        <Pressable style={[styles.dialog, { backgroundColor: palette.panel, borderColor: palette.borderStrong }]}>
          <View style={[styles.searchRow, { borderBottomColor: palette.borderSubtle }]}>
            <AppIcon name="search" size={18} color={palette.textMuted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Jump to screen, toggle theme, or paste PR URL…"
              placeholderTextColor={palette.textSubtle}
              autoFocus
              style={[styles.searchInput, { color: palette.text }]}
            />
            <Pressable onPress={close}>
              <AppIcon name="close" size={20} color={palette.textMuted} />
            </Pressable>
          </View>
          <FlatList
            data={actions}
            keyExtractor={item => item.id}
            style={{ maxHeight: 380 }}
            renderItem={({ item }) => (
              <Pressable
                onPress={item.run}
                style={({ pressed }) => [
                  styles.itemRow,
                  { borderBottomColor: palette.borderSubtle },
                  pressed && { backgroundColor: palette.surface2 },
                ]}
              >
                <AppIcon name={item.icon} size={18} color={palette.primaryInk} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: palette.text, fontWeight: '600', fontSize: 14 }}>{item.label}</Text>
                  <Text style={{ color: palette.textMuted, fontSize: 12 }}>{item.sub}</Text>
                </View>
                <AppIcon name="chevron-forward" size={16} color={palette.textSubtle} />
              </Pressable>
            )}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.68)',
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  dialog: {
    borderRadius: RADII.xl,
    borderWidth: 1,
    overflow: 'hidden',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
});

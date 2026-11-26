import * as Clipboard from 'expo-clipboard';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { ScreenHeader } from '../src/components/ScreenHeader';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  FieldInput,
  OfflineBanner,
  ScreenScroll,
} from '../src/components/ui';
import { DEFAULT_REDMINE_URL } from '../src/constants/config';
import { RADII, SPACING } from '../src/constants/theme';
import { useApp } from '../src/context/AppContext';
import {
  HistoryRepo,
  IssuesRepo,
  KpiDraftsRepo,
  ReferenceRepo,
  TimeEntriesRepo,
} from '../src/db/repositories';
import {
  KPIS,
  KPI_CONTEXT_HINTS,
  KpiStats,
  KpiSubDefinition,
  buildTrackerKpiEntry,
  defaultKpiPeriod,
  entryLinks,
  factsForKpi,
  formatCompleteKpiText,
  kpiNeedsContext,
  linksText,
} from '../src/domain/kpiData';
import { AiClient } from '../src/services/aiClient';
import { RedmineClient } from '../src/services/redmineClient';

export default function KpiCommentsScreen() {
  const { palette, config, isOnline, showToast } = useApp();
  const initialPeriod = useMemo(() => defaultKpiPeriod(), []);

  const [start, setStart] = useState(initialPeriod.start);
  const [end, setEnd] = useState(initialPeriod.end);
  const [projectFilter, setProjectFilter] = useState('');
  const [stats, setStats] = useState<KpiStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);

  const [expandedId, setExpandedId] = useState<string | null>('1.3');
  const [drafts, setDrafts] = useState<Record<string, { contextLine: string; generatedText: string }>>({});
  const [generatingId, setGeneratingId] = useState<string | null>(null);

  const periodKey = `${start}_${end}_${projectFilter.trim()}`;

  const computeStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const [me, allIssues, hist, savedDrafts] = await Promise.all([
        ReferenceRepo.getMe(),
        IssuesRepo.getAll(),
        HistoryRepo.list(200),
        KpiDraftsRepo.getAllForPeriod(periodKey),
      ]);
      setDrafts(savedDrafts);

      let entries = await TimeEntriesRepo.getRange(start, end);
      if (isOnline && config && (config.redmineApiKey || config.mode === 'server')) {
        entries = await RedmineClient.fetchTimeEntriesRange(config, start, end).catch(() => entries);
      }

      const periodIssues = allIssues.filter(
        i => i.is_mine && (!i.start_date || (i.start_date >= start && i.start_date <= end))
      );
      const tasks = periodIssues.filter(i => i.tracker === 'Task');
      const bugs = periodIssues.filter(i => i.tracker === 'Bug');
      const closed = periodIssues.filter(i => i.is_closed);

      const activitiesMap: Record<string, number> = {};
      for (const e of entries) {
        const name = e.activity || 'Other';
        activitiesMap[name] = Math.round(((activitiesMap[name] || 0) + e.hours) * 100) / 100;
      }

      const computed: KpiStats = {
        userId: me?.id || 0,
        userName: me?.name || 'Developer',
        issues: periodIssues.length,
        tasks: tasks.length,
        closed: closed.length,
        closedOnTime: closed.filter(i => i.due_date && (i.updated_on || '').slice(0, 10) <= i.due_date).length,
        closedWithDueDate: closed.filter(i => Boolean(i.due_date)).length,
        tasksWithDescription: tasks.filter(i => i.description?.trim()).length,
        withTargetVersion: periodIssues.length,
        bugs: bugs.length,
        hours: Math.round(entries.reduce((s, t) => s + t.hours, 0) * 100) / 100,
        projects: [],
        activities: activitiesMap,
        subjects: tasks.map(t => t.subject).slice(0, 10),
        prs: hist
          .filter(h => h.pr_url && h.created_at && h.created_at.slice(0, 10) >= start && h.created_at.slice(0, 10) <= end)
          .map(h => ({ url: h.pr_url!, subject: h.subject })),
      };
      setStats(computed);
    } finally {
      setLoadingStats(false);
    }
  }, [start, end, periodKey, isOnline, config]);

  useEffect(() => {
    computeStats();
  }, [computeStats]);

  const ctx = useMemo(
    () => ({ start, end, project: projectFilter.trim(), userId: stats?.userId ? String(stats.userId) : 'me' }),
    [start, end, projectFilter, stats]
  );

  const redmineBase = config?.redmineUrl || DEFAULT_REDMINE_URL;

  const entryTextForSub = useCallback(
    (sub: KpiSubDefinition): string => {
      const saved = drafts[sub.id]?.generatedText;
      if (saved) return saved;
      const auto = buildTrackerKpiEntry(sub, ctx, stats, redmineBase);
      if (auto) return formatCompleteKpiText(sub, auto);
      return '';
    },
    [drafts, ctx, stats, redmineBase]
  );

  const handleGenerateNote = async (sub: KpiSubDefinition) => {
    const contextLine = drafts[sub.id]?.contextLine?.trim() || '';
    if (!contextLine) {
      showToast('Enter one line of context first');
      return;
    }
    if (!config) return;
    setGeneratingId(sub.id);
    try {
      const comment = await AiClient.generateKpiNote(
        config,
        {
          kpi: `${sub.id} ${sub.name}`,
          guideline: sub.guideline,
          example: sub.example,
          context: contextLine,
          facts: factsForKpi(stats),
        },
        isOnline
      );
      const formatted = formatCompleteKpiText(sub, {
        comment,
        linksText: linksText(entryLinks(sub, ctx, stats, redmineBase)),
        notes: '',
        rating: '',
      });
      setDrafts(prev => ({ ...prev, [sub.id]: { contextLine, generatedText: formatted } }));
      await KpiDraftsRepo.save(periodKey, sub.id, contextLine, formatted);
    } finally {
      setGeneratingId(null);
    }
  };

  const handleCopyAll = async () => {
    const all = KPIS.flatMap(g => g.subs)
      .map(entryTextForSub)
      .filter(Boolean)
      .join('\n\n----------\n\n');
    if (!all) return;
    await Clipboard.setStringAsync(all);
    showToast('Copied all KPI entries');
  };

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <ScreenHeader title="KPI Comments" subtitle="Monthly Redmine KPI generator (21st -> 20th)" showBack />

      <ScreenScroll>
        <OfflineBanner />

        <Card>
          <CardHeader title="Reporting Period" subtitle={stats ? `${stats.userName} · ${stats.hours}h · ${stats.tasks} tasks` : 'Loading…'} />
          <View style={styles.body}>
            <View style={styles.row2}>
              <View style={{ flex: 1 }}>
                <FieldInput label="Start" value={start} onChangeText={setStart} />
              </View>
              <View style={{ flex: 1 }}>
                <FieldInput label="End" value={end} onChangeText={setEnd} />
              </View>
            </View>
            <FieldInput label="Project slug (optional)" value={projectFilter} onChangeText={setProjectFilter} placeholder="ondc-a-i" />
            <View style={styles.row2}>
              <Button label={loadingStats ? 'Computing…' : 'Refresh Stats'} loading={loadingStats} onPress={computeStats} style={{ flex: 1 }} />
              <Button label="Copy All" variant="ghost" onPress={handleCopyAll} style={{ flex: 1 }} />
            </View>
          </View>
        </Card>

        {KPIS.map(group => (
          <Card key={group.id}>
            <CardHeader title={`${group.id}. ${group.name}`} subtitle={`${group.subs.length} KPI(s)`} />
            <View style={styles.body}>
              {group.subs.map(sub => {
                const open = expandedId === sub.id;
                const text = entryTextForSub(sub);
                const needs = kpiNeedsContext(sub.id);
                const links = entryLinks(sub, ctx, stats, redmineBase);
                return (
                  <View key={sub.id} style={[styles.kpiItem, { borderColor: palette.borderSubtle, backgroundColor: palette.surface2 }]}>
                    <Pressable onPress={() => setExpandedId(open ? null : sub.id)} style={styles.kpiRow}>
                      <Text style={{ color: palette.primaryInk, fontWeight: '700', fontSize: 12.5 }}>{sub.id}</Text>
                      <Text style={{ color: palette.text, fontWeight: '600', fontSize: 13, flex: 1 }}>{sub.name}</Text>
                      <Badge label={text ? 'Ready' : needs ? 'Needs note' : 'Pending'} tone={text ? 'success' : 'warning'} />
                    </Pressable>

                    {open && (
                      <View style={styles.kpiPanel}>
                        <Text style={{ color: palette.textMuted, fontSize: 12 }}>{sub.rating}</Text>
                        {needs && (
                          <View style={{ gap: 8 }}>
                            <FieldInput
                              label="One-line context"
                              value={drafts[sub.id]?.contextLine || ''}
                              onChangeText={val =>
                                setDrafts(prev => ({
                                  ...prev,
                                  [sub.id]: { contextLine: val, generatedText: prev[sub.id]?.generatedText || '' },
                                }))
                              }
                              placeholder={KPI_CONTEXT_HINTS[sub.id]}
                            />
                            <Button
                              label={generatingId === sub.id ? 'Writing…' : 'Generate Note'}
                              size="sm"
                              loading={generatingId === sub.id}
                              onPress={() => handleGenerateNote(sub)}
                              icon="sparkles"
                            />
                          </View>
                        )}

                        {links.length > 0 && (
                          <View style={{ gap: 4 }}>
                            {links.map((l, idx) => (
                              <Pressable key={idx} onPress={() => Linking.openURL(l.url)}>
                                <Text style={{ color: palette.primaryInk, fontSize: 12 }}>↗ {l.label}</Text>
                              </Pressable>
                            ))}
                          </View>
                        )}

                        <FieldInput
                          value={text}
                          onChangeText={val => {
                            const contextLine = drafts[sub.id]?.contextLine || '';
                            setDrafts(prev => ({ ...prev, [sub.id]: { contextLine, generatedText: val } }));
                            KpiDraftsRepo.save(periodKey, sub.id, contextLine, val);
                          }}
                          multiline
                          style={{ minHeight: 120 }}
                        />
                        <Button
                          label="Copy Entry"
                          size="sm"
                          variant="ghost"
                          onPress={async () => {
                            if (!text) return;
                            await Clipboard.setStringAsync(text);
                            showToast(`Copied KPI ${sub.id}`);
                          }}
                        />
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          </Card>
        ))}
      </ScreenScroll>
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  row2: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  kpiItem: {
    borderRadius: RADII.sm,
    borderWidth: 1,
    overflow: 'hidden',
  },
  kpiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: SPACING.md,
  },
  kpiPanel: {
    padding: SPACING.md,
    paddingTop: 0,
    gap: SPACING.md,
  },
});

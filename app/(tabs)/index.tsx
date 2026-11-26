import { useIsFocused } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Linking, Platform } from 'react-native';
import { AppIcon } from '../../src/components/AppIcon';
import { LogTimeModal } from '../../src/components/LogTimeModal';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  FieldInput,
  OfflineBanner,
  ScreenScroll,
  SegmentedControl,
  SelectField,
} from '../../src/components/ui';
import { AUDIT_LOOKBACK_DAYS, DAILY_BRIEF_LOOKBACK_DAYS, DAILY_TARGET_HOURS, INITIAL_DISPLAY_LIMIT } from '../../src/constants/config';
import { RADII, SPACING } from '../../src/constants/theme';
import { useApp } from '../../src/context/AppContext';
import {
  CalendarRepo,
  HistoryRepo,
  IssuesRepo,
  ReferenceRepo,
  TimeEntriesRepo,
} from '../../src/db/repositories';
import { toDateString } from '../../src/domain/redmineUtils';
import { compute30DayAudit, formatPlainStandup } from '../../src/domain/standupFormatter';
import { AiClient } from '../../src/services/aiClient';
import { RedmineClient } from '../../src/services/redmineClient';
import { SyncEngine } from '../../src/services/syncEngine';
import type {
  CalendarEvent,
  IssueStatus,
  SyncHistoryItem,
  TimeActivity,
  TimeEntryRecord,
  TrackerNode,
} from '../../src/types';

type TaskFilter = 'progress' | 'pinned' | 'all';
type AuditFilter = 'missing' | 'all';
type ComposeMode = 'eod' | 'standup';

const isInProgressStatus = (st: string | null) => /in\s*pro(gress|cess)/i.test(st || '');
const isFeedbackStatus = (st: string | null) => /feedback/i.test(st || '');

export default function DailyWorkspaceScreen() {
  const router = useRouter();
  const isFocused = useIsFocused();
  const { palette, config, isOnline, syncVersion, syncNow, showToast } = useApp();
  const lastSyncVersionRef = useRef(-1);

  const [tasks, setTasks] = useState<TrackerNode[]>([]);
  const [statuses, setStatuses] = useState<IssueStatus[]>([]);
  const [activities, setActivities] = useState<TimeActivity[]>([]);
  const [entries30, setEntries30] = useState<TimeEntryRecord[]>([]);
  const [meetings, setMeetings] = useState<CalendarEvent[]>([]);
  const [todayHistory, setTodayHistory] = useState<SyncHistoryItem[]>([]);

  const [taskFilter, setTaskFilter] = useState<TaskFilter>('progress');
  const [auditFilter, setAuditFilter] = useState<AuditFilter>('missing');
  const [showAllTasks, setShowAllTasks] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [composeMode, setComposeMode] = useState<ComposeMode>('eod');
  const [composedText, setComposedText] = useState('');
  const [draftingStandup, setDraftingStandup] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [logModalOpen, setLogModalOpen] = useState(false);
  const [logModalTask, setLogModalTask] = useState<TrackerNode | null>(null);
  const [logModalDate, setLogModalDate] = useState<string | undefined>(undefined);
  const [logModalHours, setLogModalHours] = useState<string | undefined>(undefined);

  const todayStr = toDateString(new Date());
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - DAILY_BRIEF_LOOKBACK_DAYS);
  const yesterdayStr = toDateString(yesterdayDate);

  const loadFromSqlite = useCallback(async () => {
    const start30 = new Date();
    start30.setDate(start30.getDate() - (AUDIT_LOOKBACK_DAYS - 1));
    const [allIssues, allStatuses, allActivities, rangeEntries, calEvents, hist] = await Promise.all([
      IssuesRepo.getAll(),
      ReferenceRepo.getStatuses(),
      ReferenceRepo.getActivities(),
      TimeEntriesRepo.getRange(toDateString(start30), todayStr),
      CalendarRepo.getByDate(todayStr),
      HistoryRepo.list(50),
    ]);

    const openMine = allIssues.filter(
      n => n.is_mine && !n.is_closed && (n.tracker === 'Task' || n.tracker === 'Bug')
    );
    setTasks(openMine);
    setStatuses(allStatuses);
    setActivities(allActivities);
    setEntries30(rangeEntries);
    setMeetings(calEvents);
    setTodayHistory(hist.filter(h => (h.created_at || '').slice(0, 10) === todayStr));
  }, [todayStr]);

  useEffect(() => {
    if (!isFocused) return;
    if (lastSyncVersionRef.current === syncVersion) return;
    lastSyncVersionRef.current = syncVersion;
    loadFromSqlite();
  }, [isFocused, loadFromSqlite, syncVersion]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await syncNow();
    await loadFromSqlite();
    setRefreshing(false);
  };

  const filteredTasks = useMemo(() => {
    const byMode = tasks.filter(t => {
      if (taskFilter === 'progress') return isInProgressStatus(t.status) && !isFeedbackStatus(t.status);
      if (taskFilter === 'pinned') return Boolean(t.is_pinned);
      return true;
    });
    const sorted = [...byMode].sort(
      (a, b) => Number(Boolean(b.is_pinned)) - Number(Boolean(a.is_pinned)) || b.id - a.id
    );
    const q = searchQuery.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter(t => `#${t.id} ${t.subject} ${t.status || ''}`.toLowerCase().includes(q));
  }, [tasks, taskFilter, searchQuery]);

  const statusOptions = useMemo(
    () => statuses.map(s => ({ value: s.id, label: s.name })),
    [statuses]
  );

  const visibleTasks = useMemo(
    () => (showAllTasks ? filteredTasks : filteredTasks.slice(0, INITIAL_DISPLAY_LIMIT)),
    [filteredTasks, showAllTasks]
  );

  const todayEntries = useMemo(
    () => entries30.filter(e => e.spent_on === todayStr),
    [entries30, todayStr]
  );

  const yesterdayEntries = useMemo(
    () => entries30.filter(e => e.spent_on === yesterdayStr),
    [entries30, yesterdayStr]
  );

  const todayHoursTotal = useMemo(
    () => Math.round(todayEntries.reduce((s, e) => s + (Number(e.hours) || 0), 0) * 100) / 100,
    [todayEntries]
  );

  const auditDays = useMemo(() => compute30DayAudit(entries30), [entries30]);
  const pastAuditDays = useMemo(() => auditDays.filter(d => !d.is_today), [auditDays]);
  const missingDaysCount = useMemo(() => pastAuditDays.filter(d => d.status === 'missing').length, [pastAuditDays]);
  const partialDaysCount = useMemo(() => pastAuditDays.filter(d => d.status === 'partial').length, [pastAuditDays]);
  const completeDaysCount = useMemo(() => pastAuditDays.filter(d => d.status === 'complete').length, [pastAuditDays]);
  const shownAuditDays = useMemo(
    () => (auditFilter === 'missing' ? auditDays.filter(d => d.missing_hours > 0) : auditDays),
    [auditDays, auditFilter]
  );

  const handleTogglePin = async (issueId: number) => {
    await IssuesRepo.togglePin(issueId);
    await loadFromSqlite();
  };

  const handleStatusChange = async (issueId: number, statusId: number) => {
    const target = statuses.find(s => s.id === statusId);
    if (!target) return;
    try {
      const res = await SyncEngine.updateIssueStatus(issueId, target, isOnline);
      showToast(res.queued ? `#${issueId} queued offline -> ${target.name}` : `Updated #${issueId} -> ${target.name}`);
      await loadFromSqlite();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Status update failed');
      await loadFromSqlite();
    }
  };

  const openLogModal = (opts: { task?: TrackerNode | null; date?: string; hours?: string } = {}) => {
    setLogModalTask(opts.task ?? null);
    setLogModalDate(opts.date);
    setLogModalHours(opts.hours);
    setLogModalOpen(true);
  };

  const handleDraftStandup = async () => {
    if (!config) return;
    setDraftingStandup(true);
    try {
      const completedTasks = [
        ...yesterdayEntries.map(e => `#${e.issue_id || ''} ${e.issue_subject} (${e.hours}h)`),
        ...todayHistory.map(h => h.subject),
      ];
      const todayTasks = tasks
        .filter(t => isInProgressStatus(t.status) || t.is_pinned)
        .map(t => `#${t.id} ${t.subject}`);
      const meetingList = meetings.map(m => `${m.title}${m.hours ? ` (${m.hours}h)` : ''}`);
      const payload = {
        mode: composeMode,
        todayTasks,
        completedTasks,
        timeEntries: todayEntries,
        meetings: meetingList,
      };
      const text = await AiClient.generateStandup(config, payload, isOnline);
      setComposedText(text || formatPlainStandup(payload));
    } finally {
      setDraftingStandup(false);
    }
  };

  const handleCopyComposed = async () => {
    if (!composedText.trim()) return;
    await Clipboard.setStringAsync(composedText.trim());
    showToast('Copied message to clipboard');
  };

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <ScreenHeader
        title="Daily Workspace"
        subtitle={`${todayStr} · ${todayHoursTotal}h / ${DAILY_TARGET_HOURS}h logged`}
      />

      <ScreenScroll
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={palette.primary} />}
      >
        <OfflineBanner onPressQueue={() => router.push('/settings')} />

        <View style={styles.quickActions}>
          <Button label="+ Log Time" size="sm" onPress={() => openLogModal()} style={{ flex: 1 }} />
          <Button
            label="+ Quick Task"
            size="sm"
            variant="ghost"
            onPress={() => router.push('/(tabs)/quick-task')}
            style={{ flex: 1 }}
          />
          <Button
            label="Sync PR"
            size="sm"
            variant="ghost"
            onPress={() => router.push('/(tabs)/sync-pr')}
            style={{ flex: 1 }}
          />
        </View>

        {/* Active Task Queue */}
        <Card>
          <CardHeader
            title="Today's Work Queue"
            subtitle="Tap star to pin, change status, or log time"
          />
          <View style={styles.cardBody}>
            <SegmentedControl
              value={taskFilter}
              onChange={setTaskFilter}
              options={[
                { value: 'progress', label: 'In Progress' },
                { value: 'pinned', label: 'Pinned' },
                { value: 'all', label: 'All Open' },
              ]}
            />
            <FieldInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search #id or title…"
            />

            {!filteredTasks.length ? (
              <EmptyState
                title="No matching tasks"
                message={
                  tasks.length === 0
                    ? 'Configure your Redmine API key in Settings and sync to load your tasks offline.'
                    : 'Switch filter to "All Open" or adjust your search.'
                }
                actionLabel={tasks.length === 0 ? 'Open Settings' : undefined}
                onAction={tasks.length === 0 ? () => router.push('/settings') : undefined}
              />
            ) : (
              <View style={styles.listGap}>
                {visibleTasks.map(t => (
                  <View
                    key={t.id}
                    style={[
                      styles.taskCard,
                      {
                        backgroundColor: t.is_pinned ? palette.primaryMuted : palette.surface2,
                        borderColor: t.is_pinned ? palette.primary : palette.borderSubtle,
                      },
                    ]}
                  >
                    <View style={styles.taskTop}>
                      <Pressable onPress={() => handleTogglePin(t.id)} style={styles.pinBtn}>
                        <AppIcon
                          name={t.is_pinned ? 'star' : 'star-outline'}
                          size={16}
                          color={t.is_pinned ? palette.primaryInk : palette.textMuted}
                        />
                      </Pressable>
                      <Badge label={t.tracker} tone={/bug/i.test(t.tracker) ? 'danger' : 'success'} />
                      <Text style={{ color: palette.textSubtle, fontSize: 12 }}>#{t.id}</Text>
                      {(t.spent_hours || t.estimated_hours) ? (
                        <Text style={{ color: palette.textMuted, fontSize: 12, marginLeft: 'auto' }}>
                          {t.spent_hours || 0}h / {t.estimated_hours || 0}h
                        </Text>
                      ) : null}
                    </View>

                    <Text style={[styles.taskTitle, { color: palette.text }]}>{t.subject}</Text>

                    <View style={styles.taskActions}>
                      <View style={{ flex: 1 }}>
                        <SelectField
                          label=""
                          value={t.status_id}
                          options={statusOptions}
                          placeholder={t.status || 'Status'}
                          onChange={val => handleStatusChange(t.id, val)}
                        />
                      </View>
                      <Button
                        label="Log"
                        size="sm"
                        variant="ghost"
                        onPress={() => openLogModal({ task: t })}
                        style={{ marginTop: 6 }}
                      />
                      <Button
                        label="EOD"
                        size="sm"
                        variant="ghost"
                        onPress={() =>
                          router.push({
                            pathname: '/eod-updates',
                            params: {
                              task: `#${t.id} ${t.subject}`,
                              status: t.status || 'In Progress',
                              hours: String(t.spent_hours || t.estimated_hours || ''),
                            },
                          })
                        }
                        style={{ marginTop: 6 }}
                      />
                    </View>
                  </View>
                ))}
                {!showAllTasks && filteredTasks.length > INITIAL_DISPLAY_LIMIT ? (
                  <Button
                    label={`Show all ${filteredTasks.length} tasks`}
                    size="sm"
                    variant="ghost"
                    onPress={() => setShowAllTasks(true)}
                  />
                ) : null}
              </View>
            )}
          </View>
        </Card>

        {/* Today's Time Breakdown */}
        <Card>
          <CardHeader
            title="Today's Time Logged"
            subtitle={
              todayHoursTotal >= DAILY_TARGET_HOURS
                ? `Daily ${DAILY_TARGET_HOURS}h target met`
                : `${Math.round((DAILY_TARGET_HOURS - todayHoursTotal) * 100) / 100}h remaining`
            }
            right={<Badge label={`${todayHoursTotal}h / ${DAILY_TARGET_HOURS}h`} tone="primary" />}
          />
          <View style={styles.cardBody}>
            {!todayEntries.length ? (
              <Text style={{ color: palette.textMuted, fontSize: 13 }}>
                No time logged yet today. Tap "+ Log Time" above.
              </Text>
            ) : (
              todayEntries.map(e => (
                <View
                  key={e.id}
                  style={[styles.miniRow, { backgroundColor: palette.surface2, borderColor: palette.borderSubtle }]}
                >
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ color: palette.text, fontWeight: '600', fontSize: 13 }}>
                      {e.issue_id ? `#${e.issue_id} · ${e.issue_subject}` : e.issue_subject}
                    </Text>
                    <Text style={{ color: palette.textMuted, fontSize: 12 }}>
                      {e.activity || 'Work'}
                      {e.comments ? ` — ${e.comments}` : ''}
                      {e.pending_sync ? ' · Queued offline' : ''}
                    </Text>
                  </View>
                  <Badge label={`${e.hours}h`} tone={e.pending_sync ? 'warning' : 'primary'} />
                </View>
              ))
            )}
          </View>
        </Card>

        {/* 30-Day 8h Audit */}
        <Card>
          <CardHeader
            title="30-Day 8h Audit"
            subtitle="Weekdays missing your 8h daily target"
          />
          <View style={styles.cardBody}>
            <SegmentedControl
              value={auditFilter}
              onChange={setAuditFilter}
              options={[
                { value: 'missing', label: 'Missing / Partial' },
                { value: 'all', label: 'All Weekdays' },
              ]}
            />
            <View style={styles.auditStats}>
              <View style={[styles.statTile, { backgroundColor: palette.surface2 }]}>
                <Text style={[styles.statNum, { color: palette.danger }]}>{missingDaysCount}</Text>
                <Text style={[styles.statLbl, { color: palette.textMuted }]}>0h days</Text>
              </View>
              <View style={[styles.statTile, { backgroundColor: palette.surface2 }]}>
                <Text style={[styles.statNum, { color: palette.warning }]}>{partialDaysCount}</Text>
                <Text style={[styles.statLbl, { color: palette.textMuted }]}>Partial (&lt;8h)</Text>
              </View>
              <View style={[styles.statTile, { backgroundColor: palette.surface2 }]}>
                <Text style={[styles.statNum, { color: palette.success }]}>{completeDaysCount}</Text>
                <Text style={[styles.statLbl, { color: palette.textMuted }]}>≥ 8h days</Text>
              </View>
            </View>

            {shownAuditDays.slice(0, 12).map(d => (
              <View
                key={d.date}
                style={[styles.auditRow, { backgroundColor: palette.surface2, borderColor: palette.borderSubtle }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ color: palette.text, fontSize: 13, fontWeight: '600' }}>
                    {d.date} {d.is_today ? '(Today)' : ''}
                  </Text>
                  <Text style={{ color: palette.textMuted, fontSize: 12 }}>
                    {d.logged_hours}h / {d.target_hours}h
                  </Text>
                </View>
                <Badge
                  label={d.status === 'complete' ? 'Complete' : `Missing ${d.missing_hours}h`}
                  tone={d.status === 'complete' ? 'success' : d.status === 'partial' ? 'warning' : 'danger'}
                />
                {d.missing_hours > 0 ? (
                  <Button
                    label={`Log ${d.missing_hours}h`}
                    size="sm"
                    variant="ghost"
                    onPress={() => openLogModal({ date: d.date, hours: String(d.missing_hours) })}
                  />
                ) : null}
              </View>
            ))}
          </View>
        </Card>

        {/* Today's Meetings */}
        <Card>
          <CardHeader
            title="Today's Meetings"
            subtitle="Cached from Google Calendar"
            right={
              config?.serverUrl ? (
                <Button
                  label="Connect Calendar"
                  size="sm"
                  variant="ghost"
                  onPress={() =>
                    Linking.openURL(
                      RedmineClient.getCalendarConnectUrl(
                        config,
                        Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.href : undefined
                      )
                    )
                  }
                />
              ) : undefined
            }
          />
          <View style={styles.cardBody}>
            {!meetings.length ? (
              <Text style={{ color: palette.textMuted, fontSize: 13 }}>
                No meetings loaded for today. Connect Google Calendar above or check Settings.
              </Text>
            ) : (
              meetings.map(m => (
                <View
                  key={m.id}
                  style={[styles.miniRow, { backgroundColor: palette.surface2, borderColor: palette.borderSubtle }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: palette.text, fontWeight: '600', fontSize: 13 }}>{m.title}</Text>
                    <Text style={{ color: palette.textMuted, fontSize: 12 }}>
                      {m.all_day ? 'All day' : m.start.slice(11, 16)}
                      {m.hours ? ` · ${m.hours}h` : ''}
                    </Text>
                  </View>
                  <Button
                    label="Log Task"
                    size="sm"
                    variant="ghost"
                    onPress={() =>
                      router.push({
                        pathname: '/(tabs)/quick-task',
                        params: {
                          context: `${m.title} meeting${m.description ? ` — ${m.description}` : ''}`,
                          hours: m.hours ? String(m.hours) : '',
                        },
                      })
                    }
                  />
                </View>
              ))
            )}
          </View>
        </Card>

        {/* Standup & EOD Composer */}
        <Card>
          <CardHeader title="Standup & EOD Composer" subtitle="Works offline from your cached logs" />
          <View style={styles.cardBody}>
            <SegmentedControl
              value={composeMode}
              onChange={setComposeMode}
              options={[
                { value: 'eod', label: 'EOD Update' },
                { value: 'standup', label: 'Morning Standup' },
              ]}
            />
            <Button
              label={draftingStandup ? 'Drafting…' : "Draft from Today's Work"}
              icon="sparkles"
              loading={draftingStandup}
              onPress={handleDraftStandup}
            />
            <FieldInput
              value={composedText}
              onChangeText={setComposedText}
              multiline
              placeholder="Tap Draft from Today's Work to build your Standup or EOD summary…"
              style={{ minHeight: 140 }}
            />
            <View style={styles.rowGap}>
              <Button
                label="Open EOD Sheet"
                variant="ghost"
                onPress={() => router.push('/eod-updates')}
                style={{ flex: 1 }}
              />
              <Button
                label="Copy Message"
                onPress={handleCopyComposed}
                disabled={!composedText.trim()}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </Card>
      </ScreenScroll>

      <LogTimeModal
        visible={logModalOpen}
        tasks={tasks}
        activities={activities}
        initialTask={logModalTask}
        initialDate={logModalDate}
        initialHours={logModalHours}
        todayHours={todayHoursTotal}
        onClose={() => setLogModalOpen(false)}
        onSuccess={loadFromSqlite}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  quickActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  cardBody: {
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  listGap: {
    gap: SPACING.sm,
  },
  taskCard: {
    padding: SPACING.md,
    borderRadius: RADII.sm,
    borderWidth: 1,
    gap: 8,
  },
  taskTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pinBtn: {
    padding: 4,
  },
  taskTitle: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 19,
  },
  taskActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  miniRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: SPACING.md,
    borderRadius: RADII.sm,
    borderWidth: 1,
  },
  auditStats: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  statTile: {
    flex: 1,
    padding: SPACING.md,
    borderRadius: RADII.sm,
    alignItems: 'center',
  },
  statNum: {
    fontSize: 18,
    fontWeight: '700',
  },
  statLbl: {
    fontSize: 11,
  },
  auditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: SPACING.md,
    borderRadius: RADII.sm,
    borderWidth: 1,
  },
  rowGap: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
});

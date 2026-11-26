import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
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
import { BOARD_CORE_STATUSES, DAILY_TARGET_HOURS, DEFAULT_REDMINE_URL } from '../../src/constants/config';
import { RADII, SPACING } from '../../src/constants/theme';
import { useApp } from '../../src/context/AppContext';
import {
  ActivityFeedRepo,
  IssuesRepo,
  MetaRepo,
  ReferenceRepo,
  TimeEntriesRepo,
} from '../../src/db/repositories';
import { toDateString } from '../../src/domain/redmineUtils';
import { computeWeeklyTimeSummary, weekStartOf } from '../../src/domain/standupFormatter';
import { SyncEngine } from '../../src/services/syncEngine';
import type {
  ActivityFeedItem,
  IssueStatus,
  ProjectRecord,
  TimeActivity,
  TimeEntryRecord,
  TrackerNode,
} from '../../src/types';

type ViewMode = 'outline' | 'board' | 'feed';
type StatusFilter = 'all' | 'open' | 'done';

const RING_RADIUS = 33;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export default function WorkHierarchyScreen() {
  const { palette, config, isOnline, syncVersion, syncNow, showToast } = useApp();

  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<number | null>(null);
  const [nodes, setNodes] = useState<TrackerNode[]>([]);
  const [statuses, setStatuses] = useState<IssueStatus[]>([]);
  const [activities, setActivities] = useState<TimeActivity[]>([]);
  const [weekEntries, setWeekEntries] = useState<TimeEntryRecord[]>([]);
  const [feed, setFeed] = useState<ActivityFeedItem[]>([]);

  const [viewMode, setViewMode] = useState<ViewMode>('outline');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [query, setQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [expandedEpics, setExpandedEpics] = useState<Set<number>>(new Set());

  const [drawerIssue, setDrawerIssue] = useState<TrackerNode | null>(null);
  const [logModalOpen, setLogModalOpen] = useState(false);
  const [logTarget, setLogTarget] = useState<TrackerNode | null>(null);

  const loadFromSqlite = useCallback(async () => {
    const today = new Date();
    const monday = weekStartOf(today);
    const [cachedMe, cachedProjects, savedPid, cachedStatuses, cachedActs, entries, feedItems] = await Promise.all([
      ReferenceRepo.getMe(),
      ReferenceRepo.getProjects(),
      MetaRepo.get('active_project_id'),
      ReferenceRepo.getStatuses(),
      ReferenceRepo.getActivities(),
      TimeEntriesRepo.getRange(toDateString(monday), toDateString(today)),
      ActivityFeedRepo.list(40),
    ]);

    setProjects(cachedProjects);
    setStatuses(cachedStatuses);
    setActivities(cachedActs);
    setWeekEntries(entries);
    setFeed(feedItems);

    const pid =
      activeProjectId ||
      (savedPid ? Number(savedPid) : 0) ||
      cachedMe?.default_project_id ||
      cachedProjects[0]?.id ||
      null;

    if (pid) {
      if (!activeProjectId) setActiveProjectId(pid);
      const projectNodes = await IssuesRepo.getAll(pid);
      setNodes(projectNodes);
    }
  }, [activeProjectId]);

  useEffect(() => {
    loadFromSqlite();
  }, [loadFromSqlite, syncVersion]);

  const handleProjectChange = async (pid: number) => {
    setActiveProjectId(pid);
    await MetaRepo.set('active_project_id', String(pid));
    const local = await IssuesRepo.getAll(pid);
    setNodes(local);
    if (isOnline) syncNow(pid);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await syncNow(activeProjectId ?? undefined);
    await loadFromSqlite();
    setRefreshing(false);
  };

  const byId = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes]);
  const kidsMap = useMemo(() => {
    const m = new Map<number, TrackerNode[]>();
    nodes.forEach(n => {
      if (n.parent_id && byId.has(n.parent_id)) {
        const list = m.get(n.parent_id) || [];
        list.push(n);
        m.set(n.parent_id, list);
      }
    });
    return m;
  }, [nodes, byId]);

  const matches = useCallback(
    (n: TrackerNode) => {
      if (statusFilter === 'open' && n.is_closed) return false;
      if (statusFilter === 'done' && !n.is_closed) return false;
      const q = query.trim().toLowerCase();
      if (q) {
        const hay = `${n.id} #${n.id} ${n.subject} ${n.status || ''} ${n.assigned_to || ''} ${n.tracker}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    },
    [statusFilter, query]
  );

  const branchMatches = useCallback(
    (n: TrackerNode): boolean => matches(n) || (kidsMap.get(n.id) || []).some(branchMatches),
    [matches, kidsMap]
  );

  const stats = useMemo(() => {
    const count = (t: string) => nodes.filter(n => n.tracker === t).length;
    const mine = nodes.filter(n => n.is_mine);
    return {
      epics: count('Epic'),
      features: count('Feature'),
      tasks: count('Task'),
      bugs: count('Bug'),
      mine: mine.length,
      openMine: mine.filter(n => !n.is_closed).length,
      spent: Math.round(nodes.reduce((s, n) => s + (Number(n.spent_hours) || 0), 0)),
      est: Math.round(nodes.reduce((s, n) => s + (Number(n.estimated_hours) || 0), 0)),
    };
  }, [nodes]);

  const timeSummary = useMemo(() => computeWeeklyTimeSummary(weekEntries), [weekEntries]);
  const ringPct = Math.min(1, timeSummary.today_hours / DAILY_TARGET_HOURS);
  const ringOffset = RING_CIRCUMFERENCE * (1 - ringPct);

  const weekDays = useMemo(() => {
    const monday = weekStartOf(new Date());
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const key = toDateString(d);
      return {
        key,
        label: 'MTWTFSS'[i],
        hours: timeSummary.by_day[key] || 0,
      };
    });
  }, [timeSummary]);

  const handleStatusChange = async (issueId: number, statusId: number) => {
    const target = statuses.find(s => s.id === statusId);
    if (!target) return;
    try {
      const res = await SyncEngine.updateIssueStatus(issueId, target, isOnline);
      showToast(res.queued ? `Queued #${issueId} -> ${target.name}` : `Moved #${issueId} -> ${target.name}`);
      await loadFromSqlite();
      if (drawerIssue?.id === issueId) {
        const updated = await IssuesRepo.getById(issueId);
        if (updated) setDrawerIssue(updated);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Status update failed');
      await loadFromSqlite();
    }
  };

  const renderIssueCard = (n: TrackerNode) => {
    const isBug = n.tracker === 'Bug';
    const tone = n.is_closed ? 'neutral' : /progress/i.test(n.status || '') ? 'warning' : 'primary';
    return (
      <Pressable
        key={n.id}
        onPress={() => setDrawerIssue(n)}
        style={[styles.nodeCard, { backgroundColor: palette.surface2, borderColor: palette.borderSubtle }]}
      >
        <View style={styles.nodeTop}>
          <Badge label={n.tracker} tone={isBug ? 'danger' : n.tracker === 'Epic' ? 'epic' : n.tracker === 'Feature' ? 'primary' : 'success'} />
          <Text style={{ color: palette.textSubtle, fontSize: 12 }}>#{n.id}</Text>
          <Badge label={n.status || 'Open'} tone={tone} />
        </View>
        <Text style={{ color: palette.text, fontWeight: '600', fontSize: 13.5 }} numberOfLines={2}>
          {n.subject}
        </Text>
        <View style={styles.nodeMeta}>
          <Text style={{ color: palette.textMuted, fontSize: 12 }}>
            {n.assigned_to || 'Unassigned'} · {n.spent_hours || 0}h / {n.estimated_hours || 0}h
          </Text>
          <Button
            label="Log"
            size="sm"
            variant="ghost"
            onPress={() => {
              setLogTarget(n);
              setLogModalOpen(true);
            }}
          />
        </View>
      </Pressable>
    );
  };

  const boardLanes = useMemo(() => {
    const mineItems = nodes.filter(n => n.is_mine && (n.tracker === 'Task' || n.tracker === 'Bug') && matches(n));
    const present = new Set(mineItems.map(n => n.status).filter((s): s is string => Boolean(s)));
    const names = statuses.length ? statuses.map(s => s.name) : [...BOARD_CORE_STATUSES];
    const lanes = names.filter(name => present.has(name) || BOARD_CORE_STATUSES.includes(name as typeof BOARD_CORE_STATUSES[number]));
    present.forEach(p => {
      if (!lanes.includes(p)) lanes.push(p);
    });
    return lanes.map(name => ({ name, items: mineItems.filter(n => n.status === name) }));
  }, [nodes, statuses, matches]);

  const roots = useMemo(
    () => nodes.filter(n => !n.parent_id || !byId.has(n.parent_id)).sort((a, b) => b.id - a.id),
    [nodes, byId]
  );

  const epics = useMemo(() => roots.filter(n => n.tracker === 'Epic' && branchMatches(n)), [roots, branchMatches]);
  const standaloneFeatures = useMemo(() => roots.filter(n => n.tracker === 'Feature' && branchMatches(n)), [roots, branchMatches]);
  const looseTasks = useMemo(
    () => roots.filter(n => (n.tracker === 'Task' || n.tracker === 'Bug') && matches(n)),
    [roots, matches]
  );

  const drawerChain = useMemo(() => {
    if (!drawerIssue) return [];
    const chain: TrackerNode[] = [];
    let cur: TrackerNode | undefined = drawerIssue;
    while (cur?.parent_id && byId.has(cur.parent_id)) {
      const parent: TrackerNode = byId.get(cur.parent_id)!;
      chain.unshift(parent);
      cur = parent;
    }
    return chain;
  }, [drawerIssue, byId]);

  const redmineBase = config?.redmineUrl || DEFAULT_REDMINE_URL;

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <ScreenHeader title="Work Hierarchy" subtitle={`${stats.mine} assigned · ${nodes.length} cached nodes`} />

      <ScreenScroll
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={palette.primary} />}
      >
        <OfflineBanner />

        {/* Project & Filters */}
        <Card>
          <View style={styles.cardBody}>
            {projects.length > 0 && (
              <SelectField
                label="Project"
                value={activeProjectId}
                options={projects.map(p => ({ value: p.id, label: p.name }))}
                onChange={handleProjectChange}
              />
            )}
            <FieldInput value={query} onChangeText={setQuery} placeholder="Search #id, title, status, assignee…" />
            <SegmentedControl
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: 'all', label: 'All' },
                { value: 'open', label: 'Open' },
                { value: 'done', label: 'Done' },
              ]}
            />
            <SegmentedControl
              value={viewMode}
              onChange={setViewMode}
              options={[
                { value: 'outline', label: 'Outline' },
                { value: 'board', label: 'Board' },
                { value: 'feed', label: 'Activity' },
              ]}
            />
          </View>
        </Card>

        {/* KPI Strip */}
        <View style={styles.kpiGrid}>
          {[
            { label: 'Epics', val: String(stats.epics), color: palette.epic },
            { label: 'Features', val: String(stats.features), color: palette.feature },
            { label: 'Tasks', val: String(stats.tasks), color: palette.task },
            { label: 'Bugs', val: String(stats.bugs), color: palette.bug },
            { label: 'Open / Me', val: `${stats.openMine}/${stats.mine}`, color: palette.warning },
            { label: 'Hours', val: `${stats.spent}/${stats.est}h`, color: palette.primaryInk },
          ].map(tile => (
            <View
              key={tile.label}
              style={[styles.kpiTile, { backgroundColor: palette.surface, borderColor: palette.border }]}
            >
              <Text style={{ color: tile.color, fontSize: 17, fontWeight: '700' }}>{tile.val}</Text>
              <Text style={{ color: palette.textMuted, fontSize: 11 }}>{tile.label}</Text>
            </View>
          ))}
        </View>

        {/* My Time Today Ring + 7-Day Chart */}
        <Card>
          <CardHeader title="My Time Today" subtitle={`${timeSummary.week_hours}h this week · 8h daily target`} />
          <View style={styles.timeRow}>
            <View style={styles.ringWrap}>
              <Svg width={80} height={80}>
                <Circle
                  cx={40}
                  cy={40}
                  r={RING_RADIUS}
                  stroke={palette.surface3}
                  strokeWidth={7}
                  fill="none"
                />
                <Circle
                  cx={40}
                  cy={40}
                  r={RING_RADIUS}
                  stroke={ringPct >= 1 ? palette.success : palette.primary}
                  strokeWidth={7}
                  strokeDasharray={`${RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`}
                  strokeDashoffset={ringOffset}
                  strokeLinecap="round"
                  rotation="-90"
                  origin="40, 40"
                  fill="none"
                />
              </Svg>
              <View style={styles.ringCenter}>
                <Text style={{ color: palette.text, fontWeight: '700', fontSize: 14 }}>{timeSummary.today_hours}h</Text>
              </View>
            </View>

            <View style={styles.weekChart}>
              {weekDays.map(d => {
                const barH = Math.max(4, Math.min(48, (d.hours / Math.max(DAILY_TARGET_HOURS, d.hours)) * 48));
                return (
                  <View key={d.key} style={styles.weekCol}>
                    <View
                      style={[
                        styles.weekBar,
                        {
                          height: barH,
                          backgroundColor:
                            d.hours >= DAILY_TARGET_HOURS
                              ? palette.success
                              : d.hours > 0
                                ? palette.primary
                                : palette.surface3,
                        },
                      ]}
                    />
                    <Text style={{ color: palette.textMuted, fontSize: 10 }}>{d.label}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        </Card>

        {/* Active View */}
        {viewMode === 'outline' && (
          <View style={{ gap: SPACING.md }}>
            {!epics.length && !standaloneFeatures.length && !looseTasks.length ? (
              <Card>
                <EmptyState
                  title="No items"
                  message="Sync with Redmine / DevPilot Server or clear your search filter."
                  actionLabel="Sync Now"
                  onAction={handleRefresh}
                />
              </Card>
            ) : (
              <>
                {epics.map((epic, idx) => {
                  const isSearching = Boolean(query.trim());
                  const isOpen = isSearching || expandedEpics.has(epic.id) || (expandedEpics.size === 0 && idx === 0);
                  const epicKids = (kidsMap.get(epic.id) || []).filter(branchMatches);
                  return (
                    <Card key={epic.id}>
                      <Pressable
                        onPress={() =>
                          setExpandedEpics(prev => {
                            const next = new Set(prev.size ? prev : epics[0] ? [epics[0].id] : []);
                            if (next.has(epic.id)) next.delete(epic.id);
                            else next.add(epic.id);
                            return next;
                          })
                        }
                      >
                        <CardHeader
                          title={`Epic #${epic.id} · ${epic.subject}`}
                          subtitle={`${epicKids.length} child item(s) · tap to ${isOpen ? 'collapse' : 'expand'}`}
                          right={<Badge label={epic.status || 'Open'} tone="epic" />}
                        />
                      </Pressable>
                      {isOpen ? (
                        <View style={styles.cardBody}>
                          {epicKids.map(feat => (
                            <View key={feat.id} style={{ gap: 8 }}>
                              {renderIssueCard(feat)}
                              {(kidsMap.get(feat.id) || []).filter(matches).map(renderIssueCard)}
                            </View>
                          ))}
                        </View>
                      ) : null}
                    </Card>
                  );
                })}
                {standaloneFeatures.map(feat => (
                  <Card key={feat.id}>
                    <CardHeader title={`Feature #${feat.id} · ${feat.subject}`} right={<Badge label="Feature" tone="primary" />} />
                    <View style={styles.cardBody}>
                      {(kidsMap.get(feat.id) || []).filter(matches).map(renderIssueCard)}
                    </View>
                  </Card>
                ))}
                {looseTasks.length > 0 && (
                  <Card>
                    <CardHeader title="Standalone Tasks & Bugs" />
                    <View style={styles.cardBody}>{looseTasks.map(renderIssueCard)}</View>
                  </Card>
                )}
              </>
            )}
          </View>
        )}

        {viewMode === 'board' && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.boardScroll}>
            {boardLanes.map(lane => (
              <View
                key={lane.name}
                style={[styles.lane, { backgroundColor: palette.surface, borderColor: palette.border }]}
              >
                <View style={[styles.laneHead, { borderBottomColor: palette.borderSubtle }]}>
                  <Text style={{ color: palette.text, fontWeight: '700', fontSize: 13 }}>{lane.name}</Text>
                  <Badge label={String(lane.items.length)} />
                </View>
                <View style={styles.laneBody}>
                  {lane.items.length ? (
                    lane.items.map(renderIssueCard)
                  ) : (
                    <Text style={{ color: palette.textSubtle, fontSize: 12, textAlign: 'center', padding: 12 }}>
                      No issues
                    </Text>
                  )}
                </View>
              </View>
            ))}
          </ScrollView>
        )}

        {viewMode === 'feed' && (
          <Card>
            <CardHeader title="Live Activity Feed" subtitle="Field-level changes detected across syncs" />
            <View style={styles.cardBody}>
              {!feed.length ? (
                <EmptyState title="No recent changes" message="Changes detected between Redmine syncs will appear here." />
              ) : (
                feed.map(item => (
                  <Pressable
                    key={item.id}
                    onPress={() => {
                      const found = byId.get(item.issue_id);
                      if (found) setDrawerIssue(found);
                    }}
                    style={[styles.feedRow, { backgroundColor: palette.surface2, borderColor: palette.borderSubtle }]}
                  >
                    <Text style={{ color: palette.text, fontWeight: '600', fontSize: 13 }}>
                      #{item.issue_id} · {item.subject}
                    </Text>
                    <Text style={{ color: palette.textMuted, fontSize: 12 }}>
                      {item.change_type === 'added'
                        ? 'Assigned to you'
                        : item.change_type === 'removed'
                          ? 'Removed from your queue'
                          : `${item.field}: ${item.from_val || '—'} -> ${item.to_val || '—'}`}
                    </Text>
                    <Text style={{ color: palette.textSubtle, fontSize: 11 }}>{item.occurred_at.slice(0, 16).replace('T', ' ')}</Text>
                  </Pressable>
                ))
              )}
            </View>
          </Card>
        )}
      </ScreenScroll>

      {/* Issue Detail Modal / Drawer */}
      <Modal visible={Boolean(drawerIssue)} transparent animationType="slide" onRequestClose={() => setDrawerIssue(null)}>
        <Pressable style={styles.backdrop} onPress={() => setDrawerIssue(null)}>
          {drawerIssue && (
            <Pressable style={[styles.sheet, { backgroundColor: palette.panel, borderColor: palette.borderStrong }]}>
              <View style={[styles.sheetHead, { borderBottomColor: palette.borderSubtle }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: palette.primaryInk, fontSize: 12, fontWeight: '600' }}>
                    {drawerIssue.tracker} #{drawerIssue.id}
                  </Text>
                  <Text style={{ color: palette.text, fontSize: 15, fontWeight: '700' }}>{drawerIssue.subject}</Text>
                </View>
                <Button label="Close" size="sm" variant="ghost" onPress={() => setDrawerIssue(null)} />
              </View>

              <ScrollView contentContainerStyle={styles.cardBody}>
                {drawerChain.length > 0 && (
                  <View style={styles.crumbs}>
                    {drawerChain.map(p => (
                      <Pressable key={p.id} onPress={() => setDrawerIssue(p)}>
                        <Badge label={`${p.tracker} #${p.id}`} tone="primary" />
                      </Pressable>
                    ))}
                  </View>
                )}

                <View style={styles.factsGrid}>
                  <View style={[styles.factBox, { backgroundColor: palette.surface2 }]}>
                    <Text style={{ color: palette.textSubtle, fontSize: 11 }}>Assignee</Text>
                    <Text style={{ color: palette.text, fontSize: 13, fontWeight: '600' }}>{drawerIssue.assigned_to || 'Unassigned'}</Text>
                  </View>
                  <View style={[styles.factBox, { backgroundColor: palette.surface2 }]}>
                    <Text style={{ color: palette.textSubtle, fontSize: 11 }}>Priority</Text>
                    <Text style={{ color: palette.text, fontSize: 13, fontWeight: '600' }}>{drawerIssue.priority || '—'}</Text>
                  </View>
                  <View style={[styles.factBox, { backgroundColor: palette.surface2 }]}>
                    <Text style={{ color: palette.textSubtle, fontSize: 11 }}>Hours</Text>
                    <Text style={{ color: palette.text, fontSize: 13, fontWeight: '600' }}>
                      {drawerIssue.spent_hours || 0}h / {drawerIssue.estimated_hours || 0}h
                    </Text>
                  </View>
                  <View style={[styles.factBox, { backgroundColor: palette.surface2 }]}>
                    <Text style={{ color: palette.textSubtle, fontSize: 11 }}>Progress</Text>
                    <Text style={{ color: palette.text, fontSize: 13, fontWeight: '600' }}>{drawerIssue.done_ratio ?? 0}%</Text>
                  </View>
                </View>

                {drawerIssue.is_mine && (
                  <SelectField
                    label="Update Status"
                    value={drawerIssue.status_id}
                    options={statuses.map(s => ({ value: s.id, label: s.name }))}
                    onChange={val => handleStatusChange(drawerIssue.id, val)}
                  />
                )}

                {(kidsMap.get(drawerIssue.id) || []).length > 0 && (
                  <View style={{ gap: 8 }}>
                    <Text style={{ color: palette.text2, fontWeight: '600', fontSize: 13 }}>Child Items</Text>
                    {(kidsMap.get(drawerIssue.id) || []).map(k => (
                      <Pressable
                        key={k.id}
                        onPress={() => setDrawerIssue(k)}
                        style={[styles.feedRow, { backgroundColor: palette.surface2, borderColor: palette.borderSubtle }]}
                      >
                        <Text style={{ color: palette.text, fontSize: 13, fontWeight: '600' }}>
                          #{k.id} · {k.subject}
                        </Text>
                        <Text style={{ color: palette.textMuted, fontSize: 11.5 }}>{k.status}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}

                <View style={styles.row2}>
                  <Button
                    label="Log Time"
                    onPress={() => {
                      setLogTarget(drawerIssue);
                      setLogModalOpen(true);
                    }}
                    style={{ flex: 1 }}
                  />
                  <Button
                    label="Open in Redmine"
                    variant="ghost"
                    onPress={() => Linking.openURL(`${redmineBase}/issues/${drawerIssue.id}`)}
                    style={{ flex: 1 }}
                  />
                </View>
              </ScrollView>
            </Pressable>
          )}
        </Pressable>
      </Modal>

      <LogTimeModal
        visible={logModalOpen}
        tasks={nodes.filter(n => n.tracker === 'Task' || n.tracker === 'Bug')}
        activities={activities}
        initialTask={logTarget}
        todayHours={timeSummary.today_hours}
        onClose={() => setLogModalOpen(false)}
        onSuccess={loadFromSqlite}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  cardBody: {
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  kpiTile: {
    width: '31.5%',
    padding: SPACING.md,
    borderRadius: RADII.md,
    borderWidth: 1,
    alignItems: 'center',
    gap: 2,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.lg,
    gap: SPACING.lg,
  },
  ringWrap: {
    width: 80,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringCenter: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekChart: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 68,
  },
  weekCol: {
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  weekBar: {
    width: 12,
    borderRadius: 4,
  },
  nodeCard: {
    padding: SPACING.md,
    borderRadius: RADII.sm,
    borderWidth: 1,
    gap: 6,
  },
  nodeTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  nodeMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  boardScroll: {
    gap: SPACING.md,
    paddingBottom: 12,
  },
  lane: {
    width: 280,
    borderRadius: RADII.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  laneHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.md,
    borderBottomWidth: 1,
  },
  laneBody: {
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  feedRow: {
    padding: SPACING.md,
    borderRadius: RADII.sm,
    borderWidth: 1,
    gap: 3,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: RADII.xl,
    borderTopRightRadius: RADII.xl,
    borderWidth: 1,
    maxHeight: '85%',
  },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: SPACING.lg,
    borderBottomWidth: 1,
  },
  crumbs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  factsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  factBox: {
    width: '48%',
    padding: SPACING.md,
    borderRadius: RADII.sm,
    gap: 2,
  },
  row2: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
});

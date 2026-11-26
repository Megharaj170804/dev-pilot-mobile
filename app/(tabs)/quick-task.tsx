import { useIsFocused } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { InteractionManager, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Chip,
  FieldInput,
  OfflineBanner,
  ScreenScroll,
  SelectField,
} from '../../src/components/ui';
import { LOG_TIME_HOUR_CHIPS, QUICK_TASK_PRESETS } from '../../src/constants/config';
import { RADII, SPACING } from '../../src/constants/theme';
import { useApp } from '../../src/context/AppContext';
import {
  CalendarRepo,
  HistoryRepo,
  IssuesRepo,
  ReferenceRepo,
} from '../../src/db/repositories';
import { toDateString } from '../../src/domain/redmineUtils';
import { AiClient } from '../../src/services/aiClient';
import { RedmineClient } from '../../src/services/redmineClient';
import { SyncEngine } from '../../src/services/syncEngine';
import type {
  CalendarEvent,
  ProjectMember,
  ProjectRecord,
  RedmineUser,
  SyncHistoryItem,
  TargetVersion,
  TimeActivity,
  TrackerNode,
} from '../../src/types';

export default function QuickTaskScreen() {
  const router = useRouter();
  const isFocused = useIsFocused();
  const params = useLocalSearchParams<{ context?: string; hours?: string }>();
  const { palette, config, isOnline, syncVersion, showToast } = useApp();
  const lastSyncVersionRef = useRef(-1);
  const idsRef = useRef<{ projectId: number | null; assigneeId: number | null; activityId: number | null }>({
    projectId: null,
    assigneeId: null,
    activityId: null,
  });

  const [context, setContext] = useState('');
  const [dateStr, setDateStr] = useState(toDateString(new Date()));
  const [dueStr, setDueStr] = useState(toDateString(new Date()));
  const [hoursStr, setHoursStr] = useState('');
  const [loggedHoursStr, setLoggedHoursStr] = useState('');
  const [activityId, setActivityId] = useState<number | null>(null);
  const [projectId, setProjectId] = useState<number | null>(null);
  const [assigneeId, setAssigneeId] = useState<number | null>(null);
  const [parentId, setParentId] = useState<number | null>(null);
  const [versionId, setVersionId] = useState<number | null>(null);

  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [acceptance, setAcceptance] = useState('');
  const [steps, setSteps] = useState('');
  const [priority, setPriority] = useState<'High' | 'Medium' | 'Low'>('Medium');

  const [me, setMe] = useState<RedmineUser | null>(null);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [features, setFeatures] = useState<TrackerNode[]>([]);
  const [versions, setVersions] = useState<TargetVersion[]>([]);
  const [activities, setActivities] = useState<TimeActivity[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [recentQuick, setRecentQuick] = useState<SyncHistoryItem[]>([]);

  const [drafting, setDrafting] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<{ issue_id: number; issue_url: string; queued: boolean; time_warning: string | null } | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  idsRef.current.projectId = projectId;
  idsRef.current.assigneeId = assigneeId;
  idsRef.current.activityId = activityId;

  const loadData = useCallback(async () => {
    const [cachedMe, cachedProjects, cachedActs, cachedHist, calEvents] = await Promise.all([
      ReferenceRepo.getMe(),
      ReferenceRepo.getProjects(),
      ReferenceRepo.getActivities(),
      HistoryRepo.list(50),
      CalendarRepo.getByDate(dateStr),
    ]);
    setMe(cachedMe);
    setProjects(cachedProjects);
    setActivities(cachedActs);
    setEvents(calEvents);
    setRecentQuick(cachedHist.filter(h => h.quick_task).slice(0, 6));

    const pid = idsRef.current.projectId || cachedMe?.default_project_id || cachedProjects[0]?.id || null;
    if (pid && !idsRef.current.projectId) {
      idsRef.current.projectId = pid;
      setProjectId(pid);
    }
    if (!idsRef.current.assigneeId && cachedMe) {
      idsRef.current.assigneeId = cachedMe.id;
      setAssigneeId(cachedMe.id);
    }
    if (!idsRef.current.activityId && cachedActs.length) {
      const def = cachedActs.find(a => /meeting/i.test(a.name)) || cachedActs[0];
      idsRef.current.activityId = def.id;
      setActivityId(def.id);
    }
    if (pid) {
      const [mems, feats, vers] = await Promise.all([
        ReferenceRepo.getProjectMembers(pid),
        IssuesRepo.getFeatures(pid),
        ReferenceRepo.getTargetVersions(pid),
      ]);
      setMembers(mems);
      setFeatures(feats);
      setVersions(vers);
    }
  }, [dateStr]);

  useEffect(() => {
    if (!isFocused) return;
    if (lastSyncVersionRef.current === syncVersion) return;
    lastSyncVersionRef.current = syncVersion;
    const handle = InteractionManager.runAfterInteractions(() => {
      loadData();
    });
    return () => handle.cancel();
  }, [isFocused, loadData, syncVersion]);

  useEffect(() => {
    if (params.context) setContext(params.context);
    if (params.hours) {
      setHoursStr(params.hours);
      setLoggedHoursStr(params.hours);
    }
  }, [params.context, params.hours]);

  const handleDraft = async () => {
    if (!context.trim()) {
      setErrorMsg('Describe what you worked on first.');
      return;
    }
    if (!config) return;
    setDrafting(true);
    setErrorMsg('');
    try {
      const draft = await AiClient.generateQuickTaskFields(
        config,
        { context: context.trim(), hours: Number(hoursStr) || null, features },
        isOnline
      );
      setSubject(draft.subject);
      setDescription(draft.description);
      setAcceptance(draft.acceptance_criteria);
      setSteps(draft.steps_for_implementation);
      setPriority(draft.priority);
      if (draft.parent_issue_id) setParentId(draft.parent_issue_id);
      if (draft.estimated_hours && !hoursStr) setHoursStr(String(draft.estimated_hours));
      setReviewOpen(true);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to draft task');
    } finally {
      setDrafting(false);
    }
  };

  const handleSubmit = async () => {
    const est = Number(hoursStr);
    const logged = Number(loggedHoursStr) || 0;
    if (!subject.trim()) {
      setErrorMsg('Task title is required.');
      return;
    }
    if (!(est > 0)) {
      setErrorMsg('Estimated hours must be greater than 0.');
      return;
    }
    if (logged > 0 && !activityId) {
      setErrorMsg('Select an activity to log time.');
      return;
    }
    setSubmitting(true);
    setErrorMsg('');
    try {
      const res = await SyncEngine.createQuickTask(
        {
          subject: subject.trim(),
          description: description.trim(),
          acceptance_criteria: acceptance.trim(),
          steps_for_implementation: steps.trim(),
          priority,
          context: context.trim(),
          project_id: projectId || me?.default_project_id || 0,
          assigned_to_id: assigneeId || me?.id || 0,
          due_date: dueStr,
          parent_issue_id: parentId,
          fixed_version_id: versionId,
          estimated_hours: est,
          logged_hours: logged > 0 ? logged : null,
          activity_id: activityId,
          spent_on: dateStr,
        },
        isOnline
      );
      setReviewOpen(false);
      setCreated(res);
      showToast(res.queued ? 'Quick Task queued offline' : `Task #${res.issue_id} created`);
      await loadData();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to create Quick Task');
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setCreated(null);
    setContext('');
    setSubject('');
    setDescription('');
    setAcceptance('');
    setSteps('');
    setHoursStr('');
    setLoggedHoursStr('');
    setErrorMsg('');
  };

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <ScreenHeader title="Quick Task" subtitle="Meetings & ad-hoc time logging" />

      <ScreenScroll>
        <OfflineBanner />

        {errorMsg ? (
          <View style={[styles.errBox, { backgroundColor: palette.dangerSurface, borderColor: palette.danger }]}>
            <Text style={{ color: palette.danger, fontSize: 13 }}>{errorMsg}</Text>
          </View>
        ) : null}

        {created ? (
          <Card>
            <CardHeader
              title={created.queued ? 'Quick Task Queued Offline' : `Task #${created.issue_id} Created`}
              subtitle={subject}
              right={<Badge label={created.queued ? 'Pending Sync' : 'Resolved'} tone={created.queued ? 'warning' : 'success'} />}
            />
            <View style={styles.body}>
              {created.time_warning ? (
                <Text style={{ color: palette.warning, fontSize: 12.5 }}>{created.time_warning}</Text>
              ) : null}
              {!created.queued && (
                <Button label="Open in Redmine" onPress={() => Linking.openURL(created.issue_url)} icon="open-outline" />
              )}
              <Button
                label="Add to EOD Sheet"
                variant="ghost"
                onPress={() =>
                  router.push({
                    pathname: '/eod-updates',
                    params: {
                      task: `#${created.issue_id} ${subject}`,
                      status: 'Done',
                      hours: loggedHoursStr || hoursStr,
                    },
                  })
                }
              />
              <Button label="Log Another" variant="ghost" onPress={resetForm} />
            </View>
          </Card>
        ) : (
          <Card>
            <CardHeader title="Describe Work or Pick Preset" subtitle="Drafts task fields & logs hours in one submit" />
            <View style={styles.body}>
              <View style={styles.chipRow}>
                {QUICK_TASK_PRESETS.map(p => (
                  <Chip
                    key={p.label}
                    label={p.label}
                    active={context === p.text}
                    onPress={() => {
                      setContext(p.text);
                      setHoursStr(p.hours);
                      setLoggedHoursStr(p.hours);
                    }}
                  />
                ))}
              </View>

              <FieldInput
                label="Context"
                value={context}
                onChangeText={setContext}
                multiline
                placeholder="What meeting, discussion, or ad-hoc task did you work on?"
              />

              <View style={styles.row2}>
                <View style={{ flex: 1 }}>
                  <FieldInput label="Date" value={dateStr} onChangeText={setDateStr} />
                </View>
                <View style={{ flex: 1 }}>
                  <FieldInput label="Due Date" value={dueStr} onChangeText={setDueStr} />
                </View>
              </View>

              <View style={styles.row2}>
                <View style={{ flex: 1 }}>
                  <FieldInput
                    label="Estimated Hours"
                    value={hoursStr}
                    onChangeText={setHoursStr}
                    keyboardType="decimal-pad"
                    placeholder="1"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <FieldInput
                    label="Hours to Log (optional)"
                    value={loggedHoursStr}
                    onChangeText={setLoggedHoursStr}
                    keyboardType="decimal-pad"
                    placeholder="1"
                  />
                </View>
              </View>

              <View style={styles.chipRow}>
                {LOG_TIME_HOUR_CHIPS.map(h => (
                  <Chip
                    key={h}
                    label={h < 1 ? `${h * 60}m` : `${h}h`}
                    active={Number(hoursStr) === h}
                    onPress={() => {
                      setHoursStr(String(h));
                      setLoggedHoursStr(String(h));
                    }}
                  />
                ))}
              </View>

              <SelectField
                label="Activity"
                value={activityId}
                options={activities.map(a => ({ value: a.id, label: a.name }))}
                onChange={setActivityId}
              />

              <SelectField
                label="Project"
                value={projectId}
                options={projects.map(p => ({ value: p.id, label: p.name }))}
                onChange={setProjectId}
              />

              <SelectField
                label="Assignee"
                value={assigneeId}
                options={(members.length ? members : me ? [{ id: me.id, name: me.name }] : []).map(m => ({
                  value: m.id,
                  label: m.name,
                }))}
                onChange={setAssigneeId}
              />

              <SelectField
                label="Parent Feature (optional)"
                value={parentId}
                options={features.map(f => ({ value: f.id, label: `#${f.id} · ${f.subject}` }))}
                onChange={setParentId}
              />

              {versions.length > 0 && (
                <SelectField
                  label="Target Version"
                  value={versionId}
                  options={versions.map(v => ({ value: v.id, label: v.name }))}
                  onChange={setVersionId}
                />
              )}

              <Button
                label={drafting ? 'Drafting…' : 'Draft with AI'}
                loading={drafting}
                onPress={handleDraft}
                icon="sparkles"
              />
              {subject ? (
                <Button label="Open Draft Review" variant="ghost" onPress={() => setReviewOpen(true)} />
              ) : null}
            </View>
          </Card>
        )}

        <Card>
          <CardHeader
            title="Google Calendar Meetings"
            subtitle="Tap a meeting to prefill context & duration"
            right={
              config?.serverUrl ? (
                <Button
                  label="Login Calendar"
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
          <View style={styles.body}>
            {events.length === 0 ? (
              <Text style={{ color: palette.textMuted, fontSize: 13 }}>
                No meetings cached for {dateStr}. Tap "Login Calendar" above if not connected yet, or configure Google Client ID in Settings.
              </Text>
            ) : (
              events.map(ev => (
                <Pressable
                  key={ev.id}
                  onPress={() => {
                    setContext(`${ev.title} meeting${ev.description ? ` — ${ev.description}` : ''}`);
                    if (ev.hours) {
                      setHoursStr(String(ev.hours));
                      setLoggedHoursStr(String(ev.hours));
                    }
                  }}
                  style={[styles.eventRow, { backgroundColor: palette.surface2, borderColor: palette.borderSubtle }]}
                >
                  <Text style={{ color: palette.text, fontWeight: '600', fontSize: 13 }}>{ev.title}</Text>
                  <Text style={{ color: palette.textMuted, fontSize: 12 }}>
                    {ev.all_day ? 'All day' : ev.start.slice(11, 16)}
                    {ev.hours ? ` · ${ev.hours}h` : ''}
                  </Text>
                </Pressable>
              ))
            )}
          </View>
        </Card>

        {recentQuick.length > 0 && (
          <Card>
            <CardHeader title="Recent Quick Tasks" />
            <View style={styles.body}>
              {recentQuick.map((item, idx) => (
                <View
                  key={`${item.issue_id}-${idx}`}
                  style={[styles.eventRow, { backgroundColor: palette.surface2, borderColor: palette.borderSubtle }]}
                >
                  <Text style={{ color: palette.text, fontWeight: '600', fontSize: 13 }}>{item.subject}</Text>
                  <Text style={{ color: palette.textMuted, fontSize: 11.5 }}>
                    #{item.issue_id} {item.hours ? `· ${item.hours}h` : ''} {item.pending_sync ? '· Queued' : ''}
                  </Text>
                </View>
              ))}
            </View>
          </Card>
        )}
      </ScreenScroll>

      {/* Draft Review Sheet */}
      <Modal visible={reviewOpen} transparent animationType="slide" onRequestClose={() => setReviewOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setReviewOpen(false)}>
          <Pressable style={[styles.sheet, { backgroundColor: palette.panel, borderColor: palette.borderStrong }]}>
            <View style={[styles.sheetHead, { borderBottomColor: palette.borderSubtle }]}>
              <Text style={{ color: palette.text, fontSize: 16, fontWeight: '700' }}>Review Quick Task</Text>
              <Button label="Close" size="sm" variant="ghost" onPress={() => setReviewOpen(false)} />
            </View>
            <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
              <FieldInput label="Subject" value={subject} onChangeText={setSubject} />
              <SelectField
                label="Priority"
                value={priority}
                options={[
                  { value: 'High', label: 'High' },
                  { value: 'Medium', label: 'Medium' },
                  { value: 'Low', label: 'Low' },
                ]}
                onChange={setPriority}
              />
              <FieldInput label="Description" value={description} onChangeText={setDescription} multiline />
              <FieldInput label="Acceptance Criteria" value={acceptance} onChangeText={setAcceptance} multiline />
              <FieldInput label="Steps" value={steps} onChangeText={setSteps} multiline />
              <Button
                label={isOnline ? 'Create Task & Log Time' : 'Queue Quick Task Offline'}
                variant="success"
                loading={submitting}
                onPress={handleSubmit}
              />
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  errBox: {
    padding: SPACING.md,
    borderRadius: RADII.sm,
    borderWidth: 1,
  },
  body: {
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  row2: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  eventRow: {
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
    maxHeight: '88%',
  },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.lg,
    borderBottomWidth: 1,
  },
});

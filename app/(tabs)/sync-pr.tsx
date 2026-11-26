import { useIsFocused } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { InteractionManager, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  FieldInput,
  OfflineBanner,
  ScreenScroll,
  SegmentedControl,
  SelectField,
  TextilePreview,
} from '../../src/components/ui';
import {
  ISSUE_LABELS,
  REDMINE_PRIORITY_LABELS,
  REDMINE_PRIORITY_MAP,
} from '../../src/constants/config';
import { RADII, SPACING } from '../../src/constants/theme';
import { useApp } from '../../src/context/AppContext';
import {
  HistoryRepo,
  IssuesRepo,
  PrCacheRepo,
  ReferenceRepo,
} from '../../src/db/repositories';
import { buildIssueDates, statusLabelForPr } from '../../src/domain/redmineUtils';
import { AiClient } from '../../src/services/aiClient';
import { fetchPullRequest } from '../../src/services/githubClient';
import { RedmineClient } from '../../src/services/redmineClient';
import { SyncEngine } from '../../src/services/syncEngine';
import type {
  ProjectMember,
  ProjectRecord,
  PullRequestPayload,
  RedmineUser,
  SyncHistoryItem,
  TrackerNode,
} from '../../src/types';

export default function SyncPrScreen() {
  const router = useRouter();
  const isFocused = useIsFocused();
  const params = useLocalSearchParams<{ url?: string }>();
  const { palette, config, isOnline, syncVersion, showToast } = useApp();
  const lastSyncVersionRef = useRef(-1);
  const idsRef = useRef<{ projectId: number | null; assigneeId: number | null }>({
    projectId: null,
    assigneeId: null,
  });

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [prUrl, setPrUrl] = useState('');
  const [fetching, setFetching] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [activityLogs, setActivityLogs] = useState<string[]>([]);

  const [prData, setPrData] = useState<PullRequestPayload | null>(null);
  const [duplicateInfo, setDuplicateInfo] = useState<SyncHistoryItem | null>(null);

  const [me, setMe] = useState<RedmineUser | null>(null);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [features, setFeatures] = useState<TrackerNode[]>([]);
  const [history, setHistory] = useState<SyncHistoryItem[]>([]);

  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [criteria, setCriteria] = useState('');
  const [steps, setSteps] = useState('');
  const [criteriaTab, setCriteriaTab] = useState<'edit' | 'preview'>('edit');
  const [stepsTab, setStepsTab] = useState<'edit' | 'preview'>('edit');
  const [priorityId, setPriorityId] = useState<number>(REDMINE_PRIORITY_MAP.Medium);
  const [estimatedHours, setEstimatedHours] = useState('8');
  const [issueLabel, setIssueLabel] = useState('Planned');
  const [projectId, setProjectId] = useState<number | null>(null);
  const [assigneeId, setAssigneeId] = useState<number | null>(null);
  const [parentId, setParentId] = useState<number | null>(null);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [createdResult, setCreatedResult] = useState<{ id: number; url: string; queued: boolean } | null>(null);

  const pushLog = (msg: string) => setActivityLogs(prev => [...prev, `${new Date().toLocaleTimeString()} · ${msg}`]);

  idsRef.current.projectId = projectId;
  idsRef.current.assigneeId = assigneeId;

  const loadRefs = useCallback(async () => {
    const [cachedMe, cachedProjects, cachedHist] = await Promise.all([
      ReferenceRepo.getMe(),
      ReferenceRepo.getProjects(),
      HistoryRepo.list(30),
    ]);
    setMe(cachedMe);
    setProjects(cachedProjects);
    setHistory(cachedHist);
    const pid = idsRef.current.projectId || cachedMe?.default_project_id || cachedProjects[0]?.id || null;
    if (pid && !idsRef.current.projectId) {
      idsRef.current.projectId = pid;
      setProjectId(pid);
    }
    if (!idsRef.current.assigneeId && cachedMe) {
      idsRef.current.assigneeId = cachedMe.id;
      setAssigneeId(cachedMe.id);
    }
    if (pid) {
      const [mems, feats] = await Promise.all([
        ReferenceRepo.getProjectMembers(pid),
        IssuesRepo.getFeatures(pid),
      ]);
      setMembers(mems);
      setFeatures(feats);
    }
  }, []);

  useEffect(() => {
    if (!isFocused) return;
    if (lastSyncVersionRef.current === syncVersion) return;
    lastSyncVersionRef.current = syncVersion;
    const handle = InteractionManager.runAfterInteractions(() => {
      loadRefs();
    });
    return () => handle.cancel();
  }, [isFocused, loadRefs, syncVersion]);

  const handleProjectSelect = async (newPid: number) => {
    setProjectId(newPid);
    setParentId(null);
    const [cachedMems, cachedFeats] = await Promise.all([
      ReferenceRepo.getProjectMembers(newPid),
      IssuesRepo.getFeatures(newPid),
    ]);
    setMembers(cachedMems);
    setFeatures(cachedFeats);
    if (isOnline && config) {
      Promise.all([
        RedmineClient.fetchProjectMembers(config, newPid).then(m => {
          ReferenceRepo.saveProjectMembers(newPid, m);
          setMembers(m);
        }),
        RedmineClient.fetchProjectFeatures(config, newPid).then(f => {
          IssuesRepo.upsertMany(newPid, f, false);
          setFeatures(f);
        }),
      ]).catch(() => {});
    }
  };

  const handleFetchAndGenerate = useCallback(
    async (overrideUrl?: string) => {
      const targetUrl = (overrideUrl ?? prUrl).trim();
      if (!targetUrl) {
        setErrorMsg('Paste a GitHub Pull Request URL first.');
        return;
      }
      if (!config) return;
      setFetching(true);
      setErrorMsg('');
      setActivityLogs([]);
      pushLog(`Loading PR: ${targetUrl}`);

      try {
        const prior = await HistoryRepo.findByPrUrl(targetUrl);
        setDuplicateInfo(prior);

        let pr: PullRequestPayload | null = null;
        if (isOnline) {
          pr = await fetchPullRequest(config, targetUrl);
          await PrCacheRepo.save(pr);
          pushLog(`Fetched PR #${pr.number} from GitHub (${pr.changed_files.length} files)`);
        } else {
          pr = await PrCacheRepo.get(targetUrl);
          if (!pr) throw new Error('Offline and this PR is not in SQLite cache yet.');
          pushLog('Loaded PR from offline SQLite cache');
        }

        setPrData(pr);
        setStep(2);

        pushLog('Generating Redmine task fields…');
        const fields = await AiClient.generatePrFields(config, pr, isOnline);
        setSubject(fields.subject);
        setDescription(fields.description);
        setCriteria(fields.acceptance_criteria);
        setSteps(fields.steps_for_implementation);
        setPriorityId(REDMINE_PRIORITY_MAP[fields.priority] || REDMINE_PRIORITY_MAP.Medium);
        setEstimatedHours(String(fields.estimated_hours || 8));
        setIssueLabel(fields.issue_label || 'Planned');
        pushLog(`Fields generated via ${fields._via || 'template'}`);
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Failed to fetch PR');
      } finally {
        setFetching(false);
      }
    },
    [prUrl, config, isOnline]
  );

  useEffect(() => {
    if (params.url) {
      setPrUrl(params.url);
      handleFetchAndGenerate(params.url);
    }
  }, [params.url]);

  const handleRegen = async (field: 'criteria' | 'steps') => {
    if (!prData || !config) return;
    setFetching(true);
    try {
      const fields = await AiClient.generatePrFields(config, prData, isOnline);
      if (field === 'criteria') setCriteria(fields.acceptance_criteria);
      else setSteps(fields.steps_for_implementation);
      showToast(`Regenerated ${field}`);
    } finally {
      setFetching(false);
    }
  };

  const handleOpenPreview = () => {
    if (!subject.trim()) {
      setErrorMsg('Subject cannot be empty.');
      return;
    }
    if (duplicateInfo) {
      setErrorMsg(`Already synced as issue #${duplicateInfo.issue_id}.`);
      return;
    }
    setErrorMsg('');
    setPreviewOpen(true);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setErrorMsg('');
    try {
      const res = await SyncEngine.createIssueFromPr(
        {
          subject: subject.trim(),
          description: description.trim(),
          priority_id: priorityId,
          estimated_hours: Number(estimatedHours) || null,
          acceptance_criteria: criteria.trim(),
          steps_for_implementation: steps.trim(),
          issue_label: issueLabel,
          pr_state: prData?.state || null,
          pr_merged: prData?.merged || false,
          parent_issue_id: parentId,
          project_id: projectId,
          assigned_to_id: assigneeId,
          pr_url: prData?.url || prUrl.trim(),
          pr_number: prData?.number || null,
          pr_repo: prData?.repo || null,
        },
        isOnline
      );
      setPreviewOpen(false);
      setCreatedResult(res);
      setStep(3);
      await loadRefs();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to create Redmine issue');
    } finally {
      setSubmitting(false);
    }
  };

  const resetWizard = () => {
    setStep(1);
    setPrUrl('');
    setPrData(null);
    setDuplicateInfo(null);
    setCreatedResult(null);
    setErrorMsg('');
  };

  const dates = buildIssueDates(new Date());

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <ScreenHeader title="PR -> Redmine" subtitle="Step-by-step PR task sync (offline capable)" />

      <ScreenScroll>
        <OfflineBanner />

        {/* Step Indicator */}
        <View style={styles.stepRow}>
          {[
            { n: 1, label: '1. Paste PR' },
            { n: 2, label: '2. Review & Edit' },
            { n: 3, label: '3. Created' },
          ].map(s => (
            <View
              key={s.n}
              style={[
                styles.stepPill,
                {
                  backgroundColor: step === s.n ? palette.primaryMuted : palette.surface2,
                  borderColor: step === s.n ? palette.primary : palette.borderSubtle,
                },
              ]}
            >
              <Text
                style={{
                  color: step === s.n ? palette.primaryInk : step > s.n ? palette.success : palette.textMuted,
                  fontWeight: '600',
                  fontSize: 12,
                }}
              >
                {s.label}
              </Text>
            </View>
          ))}
        </View>

        {errorMsg ? (
          <View style={[styles.errBox, { backgroundColor: palette.dangerSurface, borderColor: palette.danger }]}>
            <Text style={{ color: palette.danger, fontSize: 13 }}>{errorMsg}</Text>
          </View>
        ) : null}

        {step === 1 && (
          <>
            <Card>
              <CardHeader title="Paste GitHub PR URL" subtitle="Works offline for previously cached PRs" />
              <View style={styles.body}>
                <FieldInput
                  label="Pull Request URL"
                  value={prUrl}
                  onChangeText={setPrUrl}
                  placeholder="https://github.com/owner/repo/pull/42"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Button
                  label={fetching ? 'Fetching & Drafting…' : 'Fetch & Generate'}
                  loading={fetching}
                  onPress={() => handleFetchAndGenerate()}
                  icon="sparkles"
                />
              </View>
            </Card>

            <Card>
              <CardHeader title="Recent Syncs" subtitle={`${history.length} task(s) recorded locally`} />
              <View style={styles.body}>
                {!history.length ? (
                  <Text style={{ color: palette.textMuted, fontSize: 13 }}>No syncs yet.</Text>
                ) : (
                  history.slice(0, 8).map((h, i) => (
                    <View
                      key={`${h.issue_id}-${i}`}
                      style={[styles.histRow, { backgroundColor: palette.surface2, borderColor: palette.borderSubtle }]}
                    >
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={{ color: palette.text, fontWeight: '600', fontSize: 13 }} numberOfLines={1}>
                          {h.subject}
                        </Text>
                        <Text style={{ color: palette.textMuted, fontSize: 11.5 }}>
                          #{h.issue_id} {h.pr_repo ? `· ${h.pr_repo}` : ''} {h.pending_sync ? '· Queued' : ''}
                        </Text>
                      </View>
                      {h.pr_url ? (
                        <Button
                          label="Comments"
                          size="sm"
                          variant="ghost"
                          onPress={() => router.push({ pathname: '/pr-comments', params: { url: h.pr_url! } })}
                        />
                      ) : null}
                    </View>
                  ))
                )}
              </View>
            </Card>
          </>
        )}

        {step === 2 && prData && (
          <>
            {duplicateInfo ? (
              <View style={[styles.errBox, { backgroundColor: palette.warningSurface, borderColor: palette.warning }]}>
                <Text style={{ color: palette.warning, fontWeight: '600', fontSize: 13 }}>
                  Already synced as Issue #{duplicateInfo.issue_id}
                </Text>
              </View>
            ) : null}

            <Card>
              <CardHeader
                title={`${prData.repo} · #${prData.number}`}
                subtitle={`${prData.author} · ${prData.changed_files.length} files · ${prData.discussion_count} comments`}
                right={<Badge label={statusLabelForPr(prData)} tone={prData.merged ? 'success' : 'warning'} />}
              />
              <View style={styles.body}>
                <Text style={{ color: palette.text, fontWeight: '600', fontSize: 14 }}>{prData.title}</Text>
                <Button
                  label="Collect PR Review Comments"
                  size="sm"
                  variant="ghost"
                  onPress={() => router.push({ pathname: '/pr-comments', params: { url: prData.url } })}
                />
              </View>
            </Card>

            <Card>
              <CardHeader title="Task Details" subtitle={`Start ${dates.start_date} · Due ${dates.due_date}`} />
              <View style={styles.body}>
                <FieldInput
                  label={`Subject (${subject.length}/90)`}
                  value={subject}
                  onChangeText={setSubject}
                />

                <SelectField
                  label="Project"
                  value={projectId}
                  options={projects.map(p => ({ value: p.id, label: p.name }))}
                  onChange={handleProjectSelect}
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
                  label="Parent Feature"
                  value={parentId}
                  options={features.map(f => ({ value: f.id, label: `#${f.id} · ${f.subject}` }))}
                  placeholder="Optional Parent Feature…"
                  onChange={setParentId}
                />

                <View style={styles.row2}>
                  <View style={{ flex: 1 }}>
                    <SelectField
                      label="Priority"
                      value={priorityId}
                      options={[
                        { value: REDMINE_PRIORITY_MAP.High, label: 'High' },
                        { value: REDMINE_PRIORITY_MAP.Medium, label: 'Medium' },
                        { value: REDMINE_PRIORITY_MAP.Low, label: 'Low' },
                      ]}
                      onChange={setPriorityId}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <FieldInput
                      label="Est. Hours"
                      value={estimatedHours}
                      onChangeText={setEstimatedHours}
                      keyboardType="decimal-pad"
                    />
                  </View>
                </View>

                <SelectField
                  label="Issue Label"
                  value={issueLabel}
                  options={ISSUE_LABELS.map(l => ({ value: l, label: l }))}
                  onChange={setIssueLabel}
                />

                <FieldInput label="Description" value={description} onChangeText={setDescription} multiline />

                <View style={styles.sectionHead}>
                  <Text style={{ color: palette.text2, fontWeight: '600', fontSize: 13 }}>Acceptance Criteria</Text>
                  <Button label="Regen" size="sm" variant="ghost" onPress={() => handleRegen('criteria')} />
                </View>
                <SegmentedControl
                  value={criteriaTab}
                  onChange={setCriteriaTab}
                  options={[
                    { value: 'edit', label: 'Edit Textile' },
                    { value: 'preview', label: 'Preview' },
                  ]}
                />
                {criteriaTab === 'edit' ? (
                  <FieldInput value={criteria} onChangeText={setCriteria} multiline style={{ minHeight: 140 }} />
                ) : (
                  <View style={[styles.previewBox, { backgroundColor: palette.surface2, borderColor: palette.borderSubtle }]}>
                    <TextilePreview text={criteria} />
                  </View>
                )}

                <View style={styles.sectionHead}>
                  <Text style={{ color: palette.text2, fontWeight: '600', fontSize: 13 }}>Steps for Implementation</Text>
                  <Button label="Regen" size="sm" variant="ghost" onPress={() => handleRegen('steps')} />
                </View>
                <SegmentedControl
                  value={stepsTab}
                  onChange={setStepsTab}
                  options={[
                    { value: 'edit', label: 'Edit Textile' },
                    { value: 'preview', label: 'Preview' },
                  ]}
                />
                {stepsTab === 'edit' ? (
                  <FieldInput value={steps} onChangeText={setSteps} multiline style={{ minHeight: 140 }} />
                ) : (
                  <View style={[styles.previewBox, { backgroundColor: palette.surface2, borderColor: palette.borderSubtle }]}>
                    <TextilePreview text={steps} />
                  </View>
                )}

                {activityLogs.length > 0 && (
                  <View style={[styles.logBox, { backgroundColor: palette.surface2 }]}>
                    {activityLogs.map((l, idx) => (
                      <Text key={idx} style={{ color: palette.textMuted, fontSize: 11 }}>
                        {l}
                      </Text>
                    ))}
                  </View>
                )}

                <View style={styles.row2}>
                  <Button label="Back" variant="ghost" onPress={() => setStep(1)} style={{ flex: 1 }} />
                  <Button label="Review & Add" onPress={handleOpenPreview} style={{ flex: 2 }} />
                </View>
              </View>
            </Card>
          </>
        )}

        {step === 3 && createdResult && (
          <Card>
            <CardHeader
              title={createdResult.queued ? 'Queued Offline' : `Created Redmine Issue #${createdResult.id}`}
              subtitle={subject}
              right={<Badge label={createdResult.queued ? 'Pending Sync' : 'Synced'} tone={createdResult.queued ? 'warning' : 'success'} />}
            />
            <View style={styles.body}>
              {!createdResult.queued && (
                <Button label="Open in Redmine" onPress={() => Linking.openURL(createdResult.url)} icon="open-outline" />
              )}
              <Button
                label="Add to EOD Sheet"
                variant="ghost"
                onPress={() =>
                  router.push({
                    pathname: '/eod-updates',
                    params: {
                      task: `#${createdResult.id} ${subject}`,
                      status: prData?.merged ? 'Done' : 'In Progress',
                      hours: estimatedHours,
                    },
                  })
                }
              />
              <Button label="Sync Another PR" variant="ghost" onPress={resetWizard} />
            </View>
          </Card>
        )}
      </ScreenScroll>

      {/* Final Preview Modal */}
      <Modal visible={previewOpen} transparent animationType="slide" onRequestClose={() => setPreviewOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setPreviewOpen(false)}>
          <Pressable style={[styles.sheet, { backgroundColor: palette.panel, borderColor: palette.borderStrong }]}>
            <View style={[styles.sheetHead, { borderBottomColor: palette.borderSubtle }]}>
              <Text style={{ color: palette.text, fontSize: 16, fontWeight: '700' }}>Review Tracker Entry</Text>
              <Button label="Close" size="sm" variant="ghost" onPress={() => setPreviewOpen(false)} />
            </View>
            <ScrollView contentContainerStyle={styles.body}>
              <Text style={{ color: palette.text, fontSize: 15, fontWeight: '700' }}>{subject}</Text>
              <Text style={{ color: palette.textMuted, fontSize: 12.5 }}>
                Priority: {REDMINE_PRIORITY_LABELS[priorityId]} · Est: {estimatedHours || '—'}h · Label: {issueLabel}
              </Text>
              <Text style={{ color: palette.text2, fontSize: 13 }}>{description}</Text>
              <Text style={{ color: palette.text, fontWeight: '700', marginTop: 6 }}>Acceptance Criteria</Text>
              <TextilePreview text={criteria} />
              <Text style={{ color: palette.text, fontWeight: '700', marginTop: 6 }}>Steps for Implementation</Text>
              <TextilePreview text={steps} />
              <Button
                label={isOnline ? 'Add to Redmine' : 'Queue Creation Offline'}
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
  stepRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  stepPill: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: RADII.sm,
    borderWidth: 1,
    alignItems: 'center',
  },
  errBox: {
    padding: SPACING.md,
    borderRadius: RADII.sm,
    borderWidth: 1,
  },
  body: {
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  histRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: SPACING.md,
    borderRadius: RADII.sm,
    borderWidth: 1,
  },
  row2: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  previewBox: {
    padding: SPACING.md,
    borderRadius: RADII.sm,
    borderWidth: 1,
  },
  logBox: {
    padding: SPACING.md,
    borderRadius: RADII.sm,
    gap: 4,
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

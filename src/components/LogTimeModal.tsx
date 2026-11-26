import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { DAILY_TARGET_HOURS, LOG_TIME_HOUR_CHIPS } from '../constants/config';
import { RADII, SPACING } from '../constants/theme';
import { useApp } from '../context/AppContext';
import { toDateString } from '../domain/redmineUtils';
import { AiClient } from '../services/aiClient';
import { SyncEngine } from '../services/syncEngine';
import type { TimeActivity, TrackerNode } from '../types';
import { Button, Chip, FieldInput, SelectField } from './ui';

export function LogTimeModal({
  visible,
  tasks,
  activities,
  initialTask,
  initialDate,
  initialHours,
  todayHours = 0,
  onClose,
  onSuccess,
}: {
  visible: boolean;
  tasks: TrackerNode[];
  activities: TimeActivity[];
  initialTask: TrackerNode | null;
  initialDate?: string;
  initialHours?: string;
  todayHours?: number;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { palette, config, isOnline, showToast } = useApp();
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [dateStr, setDateStr] = useState(toDateString(new Date()));
  const [hoursStr, setHoursStr] = useState('');
  const [activityId, setActivityId] = useState<number | null>(null);
  const [contextNotes, setContextNotes] = useState('');
  const [comment, setComment] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [drafting, setDrafting] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setSelectedTaskId(initialTask?.id ?? tasks[0]?.id ?? null);
    setDateStr(initialDate || toDateString(new Date()));
    setHoursStr(initialHours || '');
    const devAct = activities.find(a => a.name === 'Development') || activities[0];
    setActivityId(devAct?.id ?? null);
    setContextNotes('');
    setComment('');
    setErrorMsg('');
  }, [visible, initialTask, initialDate, initialHours, tasks, activities]);

  const activeTask = tasks.find(t => t.id === selectedTaskId) || initialTask;
  const remainingToday = Math.max(0, Math.round((DAILY_TARGET_HOURS - todayHours) * 100) / 100);

  const handleAiComment = async () => {
    if (!activeTask || !config) {
      setErrorMsg('Select an issue first.');
      return;
    }
    setDrafting(true);
    setErrorMsg('');
    try {
      const actName = activities.find(a => a.id === activityId)?.name || 'Development';
      const draft = await AiClient.generateTimeComment(
        config,
        {
          subject: activeTask.subject,
          tracker: activeTask.tracker,
          status: activeTask.status,
          activity: actName,
          hours: hoursStr,
          context: contextNotes,
        },
        isOnline
      );
      setComment(draft);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to generate comment');
    } finally {
      setDrafting(false);
    }
  };

  const handleSubmit = async () => {
    if (!activeTask) {
      setErrorMsg('Choose a Redmine issue.');
      return;
    }
    const hrs = Number(hoursStr);
    if (!hrs || hrs <= 0) {
      setErrorMsg('Enter valid hours (> 0).');
      return;
    }
    if (!activityId) {
      setErrorMsg('Select an activity type.');
      return;
    }
    setSubmitting(true);
    setErrorMsg('');
    try {
      const actName = activities.find(a => a.id === activityId)?.name || '';
      const res = await SyncEngine.logTime(
        {
          issue_id: activeTask.id,
          issue_subject: activeTask.subject,
          project_name: '',
          hours: hrs,
          activity_id: activityId,
          activity_name: actName,
          comments: comment.trim() || contextNotes.trim() || activeTask.subject,
          spent_on: dateStr || toDateString(new Date()),
        },
        isOnline
      );
      showToast(
        res.queued
          ? `Saved ${hrs}h offline on #${activeTask.id} — queued for sync`
          : `Logged ${hrs}h on #${activeTask.id}`
      );
      onSuccess();
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to log time');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: palette.panel, borderColor: palette.borderStrong }]}>
          <View style={[styles.header, { borderBottomColor: palette.borderSubtle }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: palette.text }]}>Log Time</Text>
              <Text style={{ color: palette.textMuted, fontSize: 12 }} numberOfLines={1}>
                {activeTask ? `#${activeTask.id} · ${activeTask.subject}` : 'Select an issue'}
              </Text>
            </View>
            <Button label="Close" variant="ghost" size="sm" onPress={onClose} />
          </View>

          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {!initialTask && (
              <SelectField
                label="Redmine Issue"
                value={selectedTaskId}
                options={tasks.map(t => ({
                  value: t.id,
                  label: `#${t.id} · ${t.subject}`,
                  sub: `${t.tracker} · ${t.status || ''}`,
                }))}
                onChange={val => setSelectedTaskId(val)}
              />
            )}

            <View style={styles.row2}>
              <View style={{ flex: 1 }}>
                <FieldInput label="Date (YYYY-MM-DD)" value={dateStr} onChangeText={setDateStr} />
              </View>
              <View style={{ flex: 1 }}>
                <FieldInput
                  label="Hours"
                  value={hoursStr}
                  onChangeText={setHoursStr}
                  keyboardType="decimal-pad"
                  placeholder="e.g. 1.5"
                />
              </View>
            </View>

            <View style={styles.chipRow}>
              {LOG_TIME_HOUR_CHIPS.map(h => (
                <Chip
                  key={h}
                  label={h < 1 ? `${h * 60}m` : `${h}h`}
                  active={Number(hoursStr) === h}
                  onPress={() => setHoursStr(String(h))}
                />
              ))}
              {remainingToday > 0 && (
                <Chip
                  label={`Fill day (${remainingToday}h)`}
                  active={Number(hoursStr) === remainingToday}
                  onPress={() => setHoursStr(String(remainingToday))}
                />
              )}
            </View>

            <SelectField
              label="Activity"
              value={activityId}
              options={activities.map(a => ({ value: a.id, label: a.name }))}
              onChange={val => setActivityId(val)}
            />

            <FieldInput
              label="What did you do? (optional context for AI)"
              value={contextNotes}
              onChangeText={setContextNotes}
              placeholder="Meeting topic, bug fixed, endpoint updated…"
            />

            <View style={styles.commentHead}>
              <Text style={[styles.label, { color: palette.text2 }]}>Work-log Comment</Text>
              <Button
                label={drafting ? 'Writing…' : 'Write with AI'}
                size="sm"
                variant="ghost"
                icon="sparkles"
                loading={drafting}
                onPress={handleAiComment}
              />
            </View>
            <FieldInput
              value={comment}
              onChangeText={setComment}
              multiline
              placeholder="Summary of work completed…"
            />

            {errorMsg ? <Text style={{ color: palette.danger, fontSize: 12.5 }}>{errorMsg}</Text> : null}

            <Button
              label={isOnline ? 'Log to Redmine' : 'Queue Time Log Offline'}
              onPress={handleSubmit}
              loading={submitting}
              icon="time-outline"
            />
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: SPACING.lg,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
  },
  body: {
    padding: SPACING.lg,
    gap: SPACING.md,
    paddingBottom: 34,
  },
  row2: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  commentHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    fontSize: 12.5,
    fontWeight: '600',
  },
});

import {
  AUDIT_LOOKBACK_DAYS,
  DEFAULT_PROJECT_ID,
  MAX_SYNC_QUEUE_ATTEMPTS,
} from '../constants/config';
import {
  ActivityFeedRepo,
  CalendarRepo,
  EodSheetRepo,
  HistoryRepo,
  IssuesRepo,
  MetaRepo,
  ReferenceRepo,
  SyncQueueRepo,
  TimeEntriesRepo,
} from '../db/repositories';
import { toDateString } from '../domain/redmineUtils';
import type {
  ActivityFeedItem,
  IssueStatus,
  SyncQueueItem,
  TimeEntryRecord,
  TrackerNode,
} from '../types';
import { loadAppConfig } from './configService';
import { HttpApiError, RedmineClient } from './redmineClient';

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeSyncUpdates(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function notifySyncListeners(): void {
  listeners.forEach(fn => fn());
}

const WATCHED_FIELDS: Array<keyof TrackerNode> = [
  'status',
  'done_ratio',
  'spent_hours',
  'estimated_hours',
  'subject',
  'priority',
  'assigned_to',
  'due_date',
  'parent_id',
];

function diffIssueNodes(oldNodes: TrackerNode[], nextNodes: TrackerNode[]): Omit<ActivityFeedItem, 'id'>[] {
  if (!oldNodes.length) return [];
  const oldMap = new Map(oldNodes.map(n => [n.id, n]));
  const nextMap = new Map(nextNodes.map(n => [n.id, n]));
  const now = new Date().toISOString();
  const changes: Omit<ActivityFeedItem, 'id'>[] = [];

  for (const next of nextNodes) {
    const prev = oldMap.get(next.id);
    if (!prev) {
      if (next.is_mine) {
        changes.push({
          issue_id: next.id,
          subject: next.subject,
          tracker: next.tracker,
          change_type: 'added',
          field: null,
          from_val: null,
          to_val: null,
          occurred_at: now,
        });
      }
      continue;
    }
    for (const field of WATCHED_FIELDS) {
      const a = prev[field] ?? null;
      const b = next[field] ?? null;
      if (a !== b) {
        changes.push({
          issue_id: next.id,
          subject: next.subject,
          tracker: next.tracker,
          change_type: 'changed',
          field: String(field),
          from_val: a == null ? null : String(a),
          to_val: b == null ? null : String(b),
          occurred_at: now,
        });
      }
    }
  }

  for (const prev of oldNodes) {
    if (!nextMap.has(prev.id) && prev.is_mine) {
      changes.push({
        issue_id: prev.id,
        subject: prev.subject,
        tracker: prev.tracker,
        change_type: 'removed',
        field: null,
        from_val: null,
        to_val: null,
        occurred_at: now,
      });
    }
  }

  return changes;
}

let isSyncing = false;

export const SyncEngine = {
  async syncAll(projectId?: number, forceNotify = false): Promise<{ syncedAt: string; changesCount: number }> {
    if (isSyncing) {
      return { syncedAt: (await MetaRepo.get('last_synced_at')) || new Date().toISOString(), changesCount: 0 };
    }
    isSyncing = true;
    try {
      const cfg = await loadAppConfig();
      if (!cfg.redmineApiKey && cfg.mode === 'direct') {
        throw new Error('Add your Redmine API key in Settings to sync.');
      }

      const [me, statuses, activities] = await Promise.all([
        RedmineClient.fetchMe(cfg),
        RedmineClient.fetchStatuses(cfg),
        RedmineClient.fetchActivities(cfg),
      ]);

      await Promise.all([
        ReferenceRepo.saveMe(me),
        ReferenceRepo.saveStatuses(statuses),
        ReferenceRepo.saveActivities(activities),
      ]);

      const resolvedProjectId =
        projectId ||
        Number((await MetaRepo.get('active_project_id')) || 0) ||
        me.default_project_id ||
        DEFAULT_PROJECT_ID;

      const today = new Date();
      const start30 = new Date(today);
      start30.setDate(start30.getDate() - (AUDIT_LOOKBACK_DAYS - 1));
      const fromStr = toDateString(start30);
      const toStr = toDateString(today);

      const oldNodes = await IssuesRepo.getAll(resolvedProjectId);
      const [nextNodes, timeEntries, members, versions] = await Promise.all([
        RedmineClient.fetchTrackerHierarchy(cfg, resolvedProjectId, me.id),
        RedmineClient.fetchTimeEntriesRange(cfg, fromStr, toStr),
        RedmineClient.fetchProjectMembers(cfg, resolvedProjectId).catch(() => []),
        RedmineClient.fetchTargetVersions(cfg, resolvedProjectId).catch(() => []),
      ]);

      const diffs = diffIssueNodes(oldNodes, nextNodes);
      await Promise.all([
        IssuesRepo.upsertMany(resolvedProjectId, nextNodes, true),
        TimeEntriesRepo.replaceRemoteRange(fromStr, toStr, timeEntries),
        members.length ? ReferenceRepo.saveProjectMembers(resolvedProjectId, members) : Promise.resolve(),
        versions.length ? ReferenceRepo.saveTargetVersions(resolvedProjectId, versions) : Promise.resolve(),
        ActivityFeedRepo.recordBatch(diffs),
      ]);

      if (cfg.mode === 'server' || cfg.serverUrl) {
        const serverCfg = cfg.mode === 'server' ? cfg : { ...cfg, mode: 'server' as const };
        await Promise.all([
          cfg.mode === 'server'
            ? RedmineClient.fetchHistory(serverCfg, 100)
                .then(items => HistoryRepo.mergeRemote(items))
                .catch(() => {})
            : Promise.resolve(),
          RedmineClient.fetchCalendarEvents(serverCfg, toStr)
            .then(events => CalendarRepo.replaceDate(toStr, events))
            .catch(() => {}),
          RedmineClient.fetchSheetsData(serverCfg)
            .then(sheetData => EodSheetRepo.saveSheetData(sheetData))
            .catch(() => {}),
        ]);
      }

      const syncedAt = new Date().toISOString();
      await MetaRepo.set('last_synced_at', syncedAt);
      if (forceNotify || diffs.length > 0 || oldNodes.length === 0) {
        notifySyncListeners();
      }
      return { syncedAt, changesCount: diffs.length };
    } finally {
      isSyncing = false;
    }
  },

  async flushQueue(): Promise<{ processed: number; failed: number }> {
    const cfg = await loadAppConfig();
    const queue = await SyncQueueRepo.list();
    let processed = 0;
    let failed = 0;

    for (const item of queue) {
      if (item.attempts >= MAX_SYNC_QUEUE_ATTEMPTS && item.status === 'failed') {
        failed += 1;
        continue;
      }

      await SyncQueueRepo.markStatus(item.id, 'syncing', null);
      try {
        await executeQueuedItem(cfg, item);
        await SyncQueueRepo.remove(item.id);
        processed += 1;
      } catch (err) {
        const isNet = err instanceof HttpApiError && err.isNetwork;
        const message = err instanceof Error ? err.message : 'Sync failed';
        if (isNet) {
          await SyncQueueRepo.markStatus(item.id, 'pending', message);
          break;
        }
        await SyncQueueRepo.markStatus(item.id, 'failed', message);
        failed += 1;
      }
    }

    if (processed > 0) {
      await SyncEngine.syncAll().catch(() => {});
    }
    notifySyncListeners();
    return { processed, failed };
  },

  async updateIssueStatus(issueId: number, targetStatus: IssueStatus, online: boolean): Promise<{ queued: boolean }> {
    const prev = await IssuesRepo.getById(issueId);
    await IssuesRepo.updateStatusLocal(issueId, targetStatus);
    notifySyncListeners();

    if (!online) {
      await SyncQueueRepo.enqueue('UPDATE_ISSUE_STATUS', { issue_id: issueId, status_id: targetStatus.id }, String(issueId));
      notifySyncListeners();
      return { queued: true };
    }

    try {
      const cfg = await loadAppConfig();
      await RedmineClient.updateIssueStatus(cfg, issueId, targetStatus.id);
      return { queued: false };
    } catch (err) {
      if (err instanceof HttpApiError && err.isNetwork) {
        await SyncQueueRepo.enqueue('UPDATE_ISSUE_STATUS', { issue_id: issueId, status_id: targetStatus.id }, String(issueId));
        notifySyncListeners();
        return { queued: true };
      }
      if (prev && prev.status_id != null && prev.status != null) {
        await IssuesRepo.updateStatusLocal(issueId, {
          id: prev.status_id,
          name: prev.status,
          is_closed: prev.is_closed,
        });
        notifySyncListeners();
      }
      throw err;
    }
  },

  async logTime(
    payload: {
      issue_id: number;
      issue_subject: string;
      project_name: string;
      hours: number;
      activity_id: number;
      activity_name: string;
      comments: string;
      spent_on: string;
    },
    online: boolean
  ): Promise<{ queued: boolean; entry: TimeEntryRecord }> {
    const localEntry = await TimeEntriesRepo.insertLocal({
      issue_id: payload.issue_id,
      issue_subject: payload.issue_subject,
      project_name: payload.project_name,
      hours: payload.hours,
      activity_id: payload.activity_id,
      activity: payload.activity_name,
      comments: payload.comments,
      spent_on: payload.spent_on,
      pending_sync: true,
    });
    await IssuesRepo.addSpentHoursLocal(payload.issue_id, payload.hours);
    notifySyncListeners();

    if (!online) {
      await SyncQueueRepo.enqueue('LOG_TIME', payload, String(localEntry.id));
      notifySyncListeners();
      return { queued: true, entry: localEntry };
    }

    try {
      const cfg = await loadAppConfig();
      const confirmed = await RedmineClient.logTime(cfg, {
        issue_id: payload.issue_id,
        hours: payload.hours,
        activity_id: payload.activity_id,
        comments: payload.comments,
        spent_on: payload.spent_on,
      });
      await TimeEntriesRepo.confirmRemote(localEntry.id, {
        ...confirmed,
        issue_subject: payload.issue_subject,
        project_name: payload.project_name || confirmed.project_name,
        activity: payload.activity_name || confirmed.activity,
      });
      notifySyncListeners();
      return { queued: false, entry: confirmed };
    } catch (err) {
      if (err instanceof HttpApiError && err.isNetwork) {
        await SyncQueueRepo.enqueue('LOG_TIME', payload, String(localEntry.id));
        notifySyncListeners();
        return { queued: true, entry: localEntry };
      }
      throw err;
    }
  },

  async createIssueFromPr(
    payload: Parameters<typeof RedmineClient.createIssueFromPr>[1] & {
      pr_url?: string | null;
      pr_number?: number | null;
      pr_repo?: string | null;
    },
    online: boolean
  ): Promise<{ queued: boolean; id: number; url: string }> {
    const cfg = await loadAppConfig();
    if (!online) {
      const tempId = -Math.floor(Date.now());
      const tempUrl = `${cfg.redmineUrl}/issues/${tempId}`;
      await HistoryRepo.add({
        pr_url: payload.pr_url ?? null,
        pr_number: payload.pr_number ?? null,
        pr_repo: payload.pr_repo ?? null,
        subject: payload.subject,
        issue_id: tempId,
        issue_url: tempUrl,
        created_at: new Date().toISOString(),
        quick_task: false,
        hours: payload.estimated_hours ?? null,
        pending_sync: true,
      });
      await SyncQueueRepo.enqueue('CREATE_ISSUE', payload, String(tempId));
      notifySyncListeners();
      return { queued: true, id: tempId, url: tempUrl };
    }

    try {
      const created = await RedmineClient.createIssueFromPr(cfg, payload);
      await HistoryRepo.add({
        pr_url: payload.pr_url ?? null,
        pr_number: payload.pr_number ?? null,
        pr_repo: payload.pr_repo ?? null,
        subject: payload.subject,
        issue_id: created.id,
        issue_url: created.url,
        created_at: new Date().toISOString(),
        quick_task: false,
        hours: payload.estimated_hours ?? null,
        pending_sync: false,
      });
      notifySyncListeners();
      return { queued: false, ...created };
    } catch (err) {
      if (err instanceof HttpApiError && err.isNetwork) {
        const tempId = -Math.floor(Date.now());
        const tempUrl = `${cfg.redmineUrl}/issues/${tempId}`;
        await HistoryRepo.add({
          pr_url: payload.pr_url ?? null,
          pr_number: payload.pr_number ?? null,
          pr_repo: payload.pr_repo ?? null,
          subject: payload.subject,
          issue_id: tempId,
          issue_url: tempUrl,
          created_at: new Date().toISOString(),
          quick_task: false,
          hours: payload.estimated_hours ?? null,
          pending_sync: true,
        });
        await SyncQueueRepo.enqueue('CREATE_ISSUE', payload, String(tempId));
        notifySyncListeners();
        return { queued: true, id: tempId, url: tempUrl };
      }
      throw err;
    }
  },

  async createQuickTask(
    payload: Parameters<typeof RedmineClient.createQuickTask>[1] & { calendar_event_id?: string | null },
    online: boolean
  ): Promise<{ queued: boolean; issue_id: number; issue_url: string; time_warning: string | null }> {
    const cfg = await loadAppConfig();
    if (!online) {
      const tempId = -Math.floor(Date.now());
      const tempUrl = `${cfg.redmineUrl}/issues/${tempId}`;
      await HistoryRepo.add({
        pr_url: null,
        pr_number: null,
        pr_repo: null,
        calendar_event_id: payload.calendar_event_id ?? null,
        subject: payload.subject,
        issue_id: tempId,
        issue_url: tempUrl,
        created_at: new Date().toISOString(),
        quick_task: true,
        hours: payload.estimated_hours,
        pending_sync: true,
      });
      await SyncQueueRepo.enqueue('CREATE_QUICK_TASK', payload, String(tempId));
      notifySyncListeners();
      return { queued: true, issue_id: tempId, issue_url: tempUrl, time_warning: null };
    }

    try {
      const res = await RedmineClient.createQuickTask(cfg, payload);
      await HistoryRepo.add({
        pr_url: null,
        pr_number: null,
        pr_repo: null,
        calendar_event_id: payload.calendar_event_id ?? null,
        subject: payload.subject,
        issue_id: res.issue_id,
        issue_url: res.issue_url,
        created_at: new Date().toISOString(),
        quick_task: true,
        hours: payload.estimated_hours,
        pending_sync: false,
      });
      notifySyncListeners();
      return { queued: false, ...res };
    } catch (err) {
      if (err instanceof HttpApiError && err.isNetwork) {
        const tempId = -Math.floor(Date.now());
        const tempUrl = `${cfg.redmineUrl}/issues/${tempId}`;
        await HistoryRepo.add({
          pr_url: null,
          pr_number: null,
          pr_repo: null,
          calendar_event_id: payload.calendar_event_id ?? null,
          subject: payload.subject,
          issue_id: tempId,
          issue_url: tempUrl,
          created_at: new Date().toISOString(),
          quick_task: true,
          hours: payload.estimated_hours,
          pending_sync: true,
        });
        await SyncQueueRepo.enqueue('CREATE_QUICK_TASK', payload, String(tempId));
        notifySyncListeners();
        return { queued: true, issue_id: tempId, issue_url: tempUrl, time_warning: null };
      }
      throw err;
    }
  },

  async mutateSheetCell(gid: string, row: number, col: number, value: string, online: boolean): Promise<{ queued: boolean }> {
    await EodSheetRepo.updateCellLocal(gid, row, col, value, true);
    notifySyncListeners();
    if (!online) {
      await SyncQueueRepo.enqueue('SHEETS_UPDATE_CELL', { gid, row, col, value }, `${gid}:${row}:${col}`);
      notifySyncListeners();
      return { queued: true };
    }
    try {
      const cfg = await loadAppConfig();
      await RedmineClient.updateSheetCell(cfg, gid, row, col, value);
      await EodSheetRepo.updateCellLocal(gid, row, col, value, false);
      notifySyncListeners();
      return { queued: false };
    } catch (err) {
      if (err instanceof HttpApiError && err.isNetwork) {
        await SyncQueueRepo.enqueue('SHEETS_UPDATE_CELL', { gid, row, col, value }, `${gid}:${row}:${col}`);
        notifySyncListeners();
        return { queued: true };
      }
      throw err;
    }
  },

  async appendSheetRow(gid: string, values: string[], online: boolean): Promise<{ queued: boolean; row: number }> {
    const localRow = await EodSheetRepo.appendRowLocal(gid, values, true);
    notifySyncListeners();
    if (!online) {
      await SyncQueueRepo.enqueue('SHEETS_APPEND_ROW', { gid, values }, `${gid}:${localRow}`);
      notifySyncListeners();
      return { queued: true, row: localRow };
    }
    try {
      const cfg = await loadAppConfig();
      await RedmineClient.appendSheetRow(cfg, gid, values);
      const fresh = await RedmineClient.fetchSheetsData(cfg, gid);
      await EodSheetRepo.saveSheetData(fresh);
      notifySyncListeners();
      return { queued: false, row: localRow };
    } catch (err) {
      if (err instanceof HttpApiError && err.isNetwork) {
        await SyncQueueRepo.enqueue('SHEETS_APPEND_ROW', { gid, values }, `${gid}:${localRow}`);
        notifySyncListeners();
        return { queued: true, row: localRow };
      }
      throw err;
    }
  },

  async deleteSheetRow(gid: string, row: number, online: boolean): Promise<{ queued: boolean }> {
    await EodSheetRepo.deleteRowLocal(gid, row);
    notifySyncListeners();
    if (!online) {
      await SyncQueueRepo.enqueue('SHEETS_DELETE_ROW', { gid, row }, `${gid}:${row}`);
      notifySyncListeners();
      return { queued: true };
    }
    try {
      const cfg = await loadAppConfig();
      await RedmineClient.deleteSheetRow(cfg, gid, row);
      return { queued: false };
    } catch (err) {
      if (err instanceof HttpApiError && err.isNetwork) {
        await SyncQueueRepo.enqueue('SHEETS_DELETE_ROW', { gid, row }, `${gid}:${row}`);
        notifySyncListeners();
        return { queued: true };
      }
      throw err;
    }
  },
};

async function executeQueuedItem(cfg: Awaited<ReturnType<typeof loadAppConfig>>, item: SyncQueueItem): Promise<void> {
  const payload = JSON.parse(item.payload_json);
  switch (item.op_type) {
    case 'UPDATE_ISSUE_STATUS':
      await RedmineClient.updateIssueStatus(cfg, payload.issue_id, payload.status_id);
      return;
    case 'LOG_TIME': {
      const confirmed = await RedmineClient.logTime(cfg, {
        issue_id: payload.issue_id,
        hours: payload.hours,
        activity_id: payload.activity_id,
        comments: payload.comments,
        spent_on: payload.spent_on,
      });
      if (item.local_ref) {
        await TimeEntriesRepo.confirmRemote(Number(item.local_ref), {
          ...confirmed,
          issue_subject: payload.issue_subject || confirmed.issue_subject,
          project_name: payload.project_name || confirmed.project_name,
          activity: payload.activity_name || confirmed.activity,
        });
      }
      return;
    }
    case 'CREATE_ISSUE': {
      const created = await RedmineClient.createIssueFromPr(cfg, payload);
      if (item.local_ref) {
        await HistoryRepo.replaceByIssueId(Number(item.local_ref), {
          issue_id: created.id,
          issue_url: created.url,
        });
      }
      return;
    }
    case 'CREATE_QUICK_TASK': {
      const created = await RedmineClient.createQuickTask(cfg, payload);
      if (item.local_ref) {
        await HistoryRepo.replaceByIssueId(Number(item.local_ref), {
          issue_id: created.issue_id,
          issue_url: created.issue_url,
        });
      }
      return;
    }
    case 'SHEETS_UPDATE_CELL':
      await RedmineClient.updateSheetCell(cfg, payload.gid, payload.row, payload.col, payload.value);
      return;
    case 'SHEETS_APPEND_ROW':
      await RedmineClient.appendSheetRow(cfg, payload.gid, payload.values);
      return;
    case 'SHEETS_DELETE_ROW':
      await RedmineClient.deleteSheetRow(cfg, payload.gid, payload.row);
      return;
  }
}

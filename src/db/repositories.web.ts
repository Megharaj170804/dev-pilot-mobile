import { DEFAULT_PROJECT_ID, MAX_ACTIVITY_FEED_ITEMS } from '../constants/config';
import { normalizePrUrl } from '../domain/redmineUtils';
import type {
  ActivityFeedItem,
  CalendarEvent,
  EodSheetData,
  IssueStatus,
  ProjectMember,
  ProjectRecord,
  PullRequestPayload,
  RedmineUser,
  SyncHistoryItem,
  SyncOpType,
  SyncQueueItem,
  TargetVersion,
  TimeActivity,
  TimeEntryRecord,
  TrackerNode,
} from '../types';

const FALLBACK_STATUSES: IssueStatus[] = [
  { id: 1, name: 'New', is_closed: false },
  { id: 2, name: 'In Progress', is_closed: false },
  { id: 3, name: 'Resolved', is_closed: true },
  { id: 5, name: 'Closed', is_closed: true },
];

const memoryStore = new Map<string, string>();

function readTable<T>(key: string, fallback: T): T {
  try {
    const raw =
      typeof window !== 'undefined' && window.localStorage
        ? window.localStorage.getItem(`dp_web_${key}`)
        : memoryStore.get(key) ?? null;
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeTable(key: string, value: unknown): void {
  const serialized = JSON.stringify(value);
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(`dp_web_${key}`, serialized);
    } else {
      memoryStore.set(key, serialized);
    }
  } catch {
    memoryStore.set(key, serialized);
  }
}

export const MetaRepo = {
  async get(key: string): Promise<string | null> {
    const map = readTable<Record<string, string>>('meta', {});
    return map[key] ?? null;
  },
  async set(key: string, value: string): Promise<void> {
    const map = readTable<Record<string, string>>('meta', {});
    map[key] = value;
    writeTable('meta', map);
  },
  async getJson<T>(key: string): Promise<T | null> {
    const raw = await MetaRepo.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },
  async setJson(key: string, value: unknown): Promise<void> {
    await MetaRepo.set(key, JSON.stringify(value));
  },
};

export const ReferenceRepo = {
  async getMe(): Promise<RedmineUser | null> {
    return MetaRepo.getJson<RedmineUser>('me_user');
  },
  async saveMe(me: RedmineUser): Promise<void> {
    await MetaRepo.setJson('me_user', me);
    await ReferenceRepo.saveProjects(me.projects, me.default_project_id);
  },
  async getProjects(): Promise<ProjectRecord[]> {
    return readTable<ProjectRecord[]>('projects', []);
  },
  async saveProjects(projects: ProjectRecord[], _defaultProjectId = DEFAULT_PROJECT_ID): Promise<void> {
    writeTable('projects', projects);
  },
  async getProjectMembers(projectId: number): Promise<ProjectMember[]> {
    const all = readTable<Record<string, ProjectMember[]>>('members', {});
    return all[String(projectId)] || [];
  },
  async saveProjectMembers(projectId: number, members: ProjectMember[]): Promise<void> {
    const all = readTable<Record<string, ProjectMember[]>>('members', {});
    all[String(projectId)] = members;
    writeTable('members', all);
  },
  async getStatuses(): Promise<IssueStatus[]> {
    const list = readTable<IssueStatus[]>('statuses', []);
    return list.length ? list : FALLBACK_STATUSES;
  },
  async saveStatuses(statuses: IssueStatus[]): Promise<void> {
    writeTable('statuses', statuses);
  },
  async getActivities(): Promise<TimeActivity[]> {
    return readTable<TimeActivity[]>('activities', []);
  },
  async saveActivities(activities: TimeActivity[]): Promise<void> {
    writeTable('activities', activities);
  },
  async getTargetVersions(projectId: number): Promise<TargetVersion[]> {
    const all = readTable<Record<string, TargetVersion[]>>('versions', {});
    return all[String(projectId)] || [];
  },
  async saveTargetVersions(projectId: number, versions: TargetVersion[]): Promise<void> {
    const all = readTable<Record<string, TargetVersion[]>>('versions', {});
    all[String(projectId)] = versions;
    writeTable('versions', all);
  },
};

export const IssuesRepo = {
  async getAll(projectId?: number): Promise<TrackerNode[]> {
    const all = readTable<TrackerNode[]>('issues', []);
    return projectId ? all.filter(i => i.project_id === projectId) : all;
  },
  async getFeatures(projectId: number): Promise<TrackerNode[]> {
    const all = await IssuesRepo.getAll(projectId);
    return all.filter(i => i.tracker.toLowerCase() === 'feature').sort((a, b) => a.subject.localeCompare(b.subject));
  },
  async getById(id: number): Promise<TrackerNode | null> {
    const all = readTable<TrackerNode[]>('issues', []);
    return all.find(i => i.id === id) || null;
  },
  async upsertMany(projectId: number, nodes: TrackerNode[], replaceProject = false): Promise<void> {
    const existing = readTable<TrackerNode[]>('issues', []);
    const pinSet = new Set(existing.filter(i => i.is_pinned).map(i => i.id));
    const kept = replaceProject
      ? existing.filter(i => i.project_id !== projectId || i.id < 0)
      : existing.filter(i => !nodes.some(n => n.id === i.id));
    const next = nodes.map(n => ({
      ...n,
      project_id: n.project_id || projectId,
      is_pinned: Boolean(n.is_pinned || pinSet.has(n.id)),
    }));
    writeTable('issues', [...next, ...kept].sort((a, b) => b.id - a.id));
  },
  async updateStatusLocal(issueId: number, status: IssueStatus): Promise<void> {
    const all = readTable<TrackerNode[]>('issues', []);
    writeTable(
      'issues',
      all.map(i =>
        i.id === issueId
          ? { ...i, status: status.name, status_id: status.id, is_closed: status.is_closed, updated_on: new Date().toISOString() }
          : i
      )
    );
  },
  async togglePin(issueId: number): Promise<boolean> {
    const all = readTable<TrackerNode[]>('issues', []);
    let result = false;
    writeTable(
      'issues',
      all.map(i => {
        if (i.id !== issueId) return i;
        result = !i.is_pinned;
        return { ...i, is_pinned: result };
      })
    );
    return result;
  },
  async addSpentHoursLocal(issueId: number, deltaHours: number): Promise<void> {
    const all = readTable<TrackerNode[]>('issues', []);
    writeTable(
      'issues',
      all.map(i => (i.id === issueId ? { ...i, spent_hours: (i.spent_hours || 0) + deltaHours } : i))
    );
  },
  async deleteById(issueId: number): Promise<void> {
    const all = readTable<TrackerNode[]>('issues', []);
    writeTable('issues', all.filter(i => i.id !== issueId));
  },
};

export const TimeEntriesRepo = {
  async getRange(fromDate: string, toDate: string): Promise<TimeEntryRecord[]> {
    const all = readTable<TimeEntryRecord[]>('time_entries', []);
    return all.filter(e => e.spent_on >= fromDate && e.spent_on <= toDate);
  },
  async replaceRemoteRange(fromDate: string, toDate: string, entries: TimeEntryRecord[]): Promise<void> {
    const all = readTable<TimeEntryRecord[]>('time_entries', []);
    const kept = all.filter(e => e.pending_sync || e.spent_on < fromDate || e.spent_on > toDate);
    writeTable('time_entries', [...entries, ...kept]);
  },
  async insertLocal(entry: Omit<TimeEntryRecord, 'id'> & { id?: number }): Promise<TimeEntryRecord> {
    const all = readTable<TimeEntryRecord[]>('time_entries', []);
    const rec: TimeEntryRecord = { ...entry, id: entry.id ?? -Math.floor(Date.now()) };
    writeTable('time_entries', [rec, ...all]);
    return rec;
  },
  async confirmRemote(localId: number, confirmed: TimeEntryRecord): Promise<void> {
    const all = readTable<TimeEntryRecord[]>('time_entries', []);
    writeTable('time_entries', [{ ...confirmed, pending_sync: false }, ...all.filter(e => e.id !== localId)]);
  },
};

export const HistoryRepo = {
  async list(limit = 50): Promise<SyncHistoryItem[]> {
    return readTable<SyncHistoryItem[]>('history', []).slice(0, limit);
  },
  async findByPrUrl(prUrl: string): Promise<SyncHistoryItem | null> {
    const target = normalizePrUrl(prUrl);
    return readTable<SyncHistoryItem[]>('history', []).find(i => i.pr_url && normalizePrUrl(i.pr_url) === target) || null;
  },
  async add(item: SyncHistoryItem): Promise<void> {
    const all = readTable<SyncHistoryItem[]>('history', []);
    writeTable('history', [item, ...all]);
  },
  async replaceByIssueId(oldIssueId: number, updated: Partial<SyncHistoryItem>): Promise<void> {
    const all = readTable<SyncHistoryItem[]>('history', []);
    writeTable(
      'history',
      all.map(i => (i.issue_id === oldIssueId ? { ...i, ...updated, pending_sync: false } : i))
    );
  },
  async mergeRemote(items: SyncHistoryItem[]): Promise<void> {
    const all = readTable<SyncHistoryItem[]>('history', []);
    const pending = all.filter(i => i.pending_sync);
    writeTable('history', [...pending, ...items.map(i => ({ ...i, pending_sync: false }))]);
  },
};

export const PrCacheRepo = {
  async get(prUrl: string): Promise<PullRequestPayload | null> {
    const all = readTable<Record<string, PullRequestPayload>>('pr_cache', {});
    return all[normalizePrUrl(prUrl)] || null;
  },
  async save(pr: PullRequestPayload): Promise<void> {
    const all = readTable<Record<string, PullRequestPayload>>('pr_cache', {});
    all[normalizePrUrl(pr.url)] = pr;
    writeTable('pr_cache', all);
  },
  async listRecent(limit = 10): Promise<PullRequestPayload[]> {
    const all = readTable<Record<string, PullRequestPayload>>('pr_cache', {});
    return Object.values(all).slice(0, limit);
  },
};

export const CalendarRepo = {
  async getByDate(dateStr: string): Promise<CalendarEvent[]> {
    const all = readTable<Record<string, CalendarEvent[]>>('calendar', {});
    return all[dateStr] || [];
  },
  async replaceDate(dateStr: string, events: CalendarEvent[]): Promise<void> {
    const all = readTable<Record<string, CalendarEvent[]>>('calendar', {});
    all[dateStr] = events;
    writeTable('calendar', all);
  },
};

export const EodSheetRepo = {
  async getCached(gid?: string): Promise<EodSheetData | null> {
    const sheets = readTable<Record<string, EodSheetData>>('eod_sheets', {});
    if (gid && sheets[gid]) return sheets[gid];
    return Object.values(sheets)[0] || null;
  },
  async saveSheetData(data: EodSheetData): Promise<void> {
    const sheets = readTable<Record<string, EodSheetData>>('eod_sheets', {});
    sheets[data.tab.gid] = data;
    writeTable('eod_sheets', sheets);
  },
  async updateCellLocal(gid: string, rowNum: number, col: number, value: string, pending = true): Promise<void> {
    const sheets = readTable<Record<string, EodSheetData>>('eod_sheets', {});
    const target = sheets[gid];
    if (!target) return;
    target.rows = target.rows.map(r => {
      if (r.row !== rowNum) return r;
      const cells = [...r.cells];
      while (cells.length <= col) cells.push('');
      cells[col] = value;
      return { ...r, cells, pending_sync: pending };
    });
    writeTable('eod_sheets', sheets);
  },
  async appendRowLocal(gid: string, values: string[], pending = true): Promise<number> {
    const sheets = readTable<Record<string, EodSheetData>>('eod_sheets', {});
    const target = sheets[gid];
    const nextRow = (target?.rows[target.rows.length - 1]?.row ?? 1) + 1;
    if (target) {
      target.rows.push({ row: nextRow, cells: values, pending_sync: pending });
      writeTable('eod_sheets', sheets);
    }
    return nextRow;
  },
  async deleteRowLocal(gid: string, rowNum: number): Promise<void> {
    const sheets = readTable<Record<string, EodSheetData>>('eod_sheets', {});
    const target = sheets[gid];
    if (!target) return;
    target.rows = target.rows
      .filter(r => r.row !== rowNum)
      .map(r => (r.row > rowNum ? { ...r, row: r.row - 1 } : r));
    writeTable('eod_sheets', sheets);
  },
};

export const KpiDraftsRepo = {
  async getAllForPeriod(periodKey: string): Promise<Record<string, { contextLine: string; generatedText: string }>> {
    const all = readTable<Record<string, Record<string, { contextLine: string; generatedText: string }>>>('kpi_drafts', {});
    return all[periodKey] || {};
  },
  async save(periodKey: string, kpiId: string, contextLine: string, generatedText: string): Promise<void> {
    const all = readTable<Record<string, Record<string, { contextLine: string; generatedText: string }>>>('kpi_drafts', {});
    if (!all[periodKey]) all[periodKey] = {};
    all[periodKey][kpiId] = { contextLine, generatedText };
    writeTable('kpi_drafts', all);
  },
};

export const ActivityFeedRepo = {
  async list(limit = MAX_ACTIVITY_FEED_ITEMS): Promise<ActivityFeedItem[]> {
    return readTable<ActivityFeedItem[]>('activity_feed', []).slice(0, limit);
  },
  async recordBatch(items: Omit<ActivityFeedItem, 'id'>[]): Promise<void> {
    if (!items.length) return;
    const prev = readTable<ActivityFeedItem[]>('activity_feed', []);
    const next = items.map((item, idx) => ({ ...item, id: Date.now() + idx }));
    writeTable('activity_feed', [...next, ...prev].slice(0, MAX_ACTIVITY_FEED_ITEMS));
  },
};

export const SyncQueueRepo = {
  async list(): Promise<SyncQueueItem[]> {
    return readTable<SyncQueueItem[]>('sync_queue', []);
  },
  async pendingCount(): Promise<number> {
    return readTable<SyncQueueItem[]>('sync_queue', []).filter(i => i.status !== 'syncing').length;
  },
  async enqueue(opType: SyncOpType, payload: unknown, localRef: string | null = null): Promise<number> {
    const list = readTable<SyncQueueItem[]>('sync_queue', []);
    const now = new Date().toISOString();
    const id = Date.now();
    list.push({
      id,
      op_type: opType,
      payload_json: JSON.stringify(payload),
      local_ref: localRef,
      status: 'pending',
      attempts: 0,
      last_error: null,
      created_at: now,
      updated_at: now,
    });
    writeTable('sync_queue', list);
    return id;
  },
  async markStatus(id: number, status: SyncQueueItem['status'], lastError: string | null = null): Promise<void> {
    const list = readTable<SyncQueueItem[]>('sync_queue', []);
    writeTable(
      'sync_queue',
      list.map(i =>
        i.id === id
          ? {
              ...i,
              status,
              attempts: i.attempts + (status === 'failed' ? 1 : 0),
              last_error: lastError,
              updated_at: new Date().toISOString(),
            }
          : i
      )
    );
  },
  async remove(id: number): Promise<void> {
    const list = readTable<SyncQueueItem[]>('sync_queue', []);
    writeTable('sync_queue', list.filter(i => i.id !== id));
  },
  async clearAll(): Promise<void> {
    writeTable('sync_queue', []);
  },
};

export async function clearCachedData(): Promise<void> {
  for (const key of [
    'projects',
    'members',
    'statuses',
    'activities',
    'versions',
    'issues',
    'time_entries',
    'pr_cache',
    'calendar',
    'eod_sheets',
    'activity_feed',
  ]) {
    writeTable(key, Array.isArray(readTable(key, [])) ? [] : {});
  }
}

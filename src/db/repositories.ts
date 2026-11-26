import {
  DEFAULT_PROJECT_ID,
  MAX_ACTIVITY_FEED_ITEMS,
} from '../constants/config';
import { normalizePrUrl } from '../domain/redmineUtils';
import type {
  ActivityFeedItem,
  CalendarEvent,
  EodSheetData,
  EodSheetRow,
  EodSheetTab,
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
import { getDb, runInTransaction } from './schema';

const FALLBACK_STATUSES: IssueStatus[] = [
  { id: 1, name: 'New', is_closed: false },
  { id: 2, name: 'In Progress', is_closed: false },
  { id: 3, name: 'Resolved', is_closed: true },
  { id: 5, name: 'Closed', is_closed: true },
];

export const MetaRepo = {
  async get(key: string): Promise<string | null> {
    const db = await getDb();
    const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM meta WHERE key = ?', [key]);
    return row?.value ?? null;
  },
  async set(key: string, value: string): Promise<void> {
    const db = await getDb();
    await db.runAsync('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', [key, value]);
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
    await runInTransaction(async db => {
      await db.runAsync('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', ['me_user', JSON.stringify(me)]);
      await db.runAsync('DELETE FROM projects');
      for (const p of me.projects) {
        await db.runAsync(
          'INSERT INTO projects (id, name, issue_count, is_default) VALUES (?, ?, ?, ?)',
          [p.id, p.name, p.count ?? 0, p.id === me.default_project_id ? 1 : 0]
        );
      }
    });
  },
  async getProjects(): Promise<ProjectRecord[]> {
    const db = await getDb();
    const rows = await db.getAllAsync<{ id: number; name: string; issue_count: number }>(
      'SELECT id, name, issue_count FROM projects ORDER BY issue_count DESC, name ASC'
    );
    return rows.map(r => ({ id: r.id, name: r.name, count: r.issue_count }));
  },
  async saveProjects(projects: ProjectRecord[], defaultProjectId = DEFAULT_PROJECT_ID): Promise<void> {
    await runInTransaction(async db => {
      await db.runAsync('DELETE FROM projects');
      for (const p of projects) {
        await db.runAsync(
          'INSERT INTO projects (id, name, issue_count, is_default) VALUES (?, ?, ?, ?)',
          [p.id, p.name, p.count ?? 0, p.id === defaultProjectId ? 1 : 0]
        );
      }
    });
  },
  async getProjectMembers(projectId: number): Promise<ProjectMember[]> {
    const db = await getDb();
    const rows = await db.getAllAsync<{ user_id: number; name: string }>(
      'SELECT user_id, name FROM project_members WHERE project_id = ? ORDER BY name ASC',
      [projectId]
    );
    return rows.map(r => ({ id: r.user_id, name: r.name }));
  },
  async saveProjectMembers(projectId: number, members: ProjectMember[]): Promise<void> {
    await runInTransaction(async db => {
      await db.runAsync('DELETE FROM project_members WHERE project_id = ?', [projectId]);
      for (const m of members) {
        await db.runAsync(
          'INSERT INTO project_members (project_id, user_id, name) VALUES (?, ?, ?)',
          [projectId, m.id, m.name]
        );
      }
    });
  },
  async getStatuses(): Promise<IssueStatus[]> {
    const db = await getDb();
    const rows = await db.getAllAsync<{ id: number; name: string; is_closed: number }>(
      'SELECT id, name, is_closed FROM issue_statuses ORDER BY id ASC'
    );
    if (!rows.length) return FALLBACK_STATUSES;
    return rows.map(r => ({ id: r.id, name: r.name, is_closed: r.is_closed === 1 }));
  },
  async saveStatuses(statuses: IssueStatus[]): Promise<void> {
    await runInTransaction(async db => {
      await db.runAsync('DELETE FROM issue_statuses');
      for (const s of statuses) {
        await db.runAsync(
          'INSERT INTO issue_statuses (id, name, is_closed) VALUES (?, ?, ?)',
          [s.id, s.name, s.is_closed ? 1 : 0]
        );
      }
    });
  },
  async getActivities(): Promise<TimeActivity[]> {
    const db = await getDb();
    const rows = await db.getAllAsync<{ id: number; name: string; is_default: number }>(
      'SELECT id, name, is_default FROM time_activities ORDER BY id ASC'
    );
    return rows.map(r => ({ id: r.id, name: r.name, is_default: r.is_default === 1 }));
  },
  async saveActivities(activities: TimeActivity[]): Promise<void> {
    await runInTransaction(async db => {
      await db.runAsync('DELETE FROM time_activities');
      for (const a of activities) {
        await db.runAsync(
          'INSERT INTO time_activities (id, name, is_default) VALUES (?, ?, ?)',
          [a.id, a.name, a.is_default ? 1 : 0]
        );
      }
    });
  },
  async getTargetVersions(projectId: number): Promise<TargetVersion[]> {
    const db = await getDb();
    return db.getAllAsync<TargetVersion>(
      'SELECT id, name, due_date FROM target_versions WHERE project_id = ? ORDER BY name ASC',
      [projectId]
    );
  },
  async saveTargetVersions(projectId: number, versions: TargetVersion[]): Promise<void> {
    await runInTransaction(async db => {
      await db.runAsync('DELETE FROM target_versions WHERE project_id = ?', [projectId]);
      for (const v of versions) {
        await db.runAsync(
          'INSERT INTO target_versions (id, project_id, name, due_date) VALUES (?, ?, ?, ?)',
          [v.id, projectId, v.name, v.due_date]
        );
      }
    });
  },
};

function mapIssueRow(r: Record<string, unknown>): TrackerNode {
  return {
    id: Number(r.id),
    project_id: Number(r.project_id),
    subject: String(r.subject || ''),
    description: String(r.description || ''),
    tracker: String(r.tracker || 'Task'),
    status: (r.status as string | null) ?? null,
    status_id: r.status_id != null ? Number(r.status_id) : null,
    is_closed: Number(r.is_closed) === 1,
    done_ratio: r.done_ratio != null ? Number(r.done_ratio) : null,
    priority: (r.priority as string | null) ?? null,
    assigned_to: (r.assigned_to as string | null) ?? null,
    assigned_to_id: r.assigned_to_id != null ? Number(r.assigned_to_id) : null,
    parent_id: r.parent_id != null ? Number(r.parent_id) : null,
    estimated_hours: r.estimated_hours != null ? Number(r.estimated_hours) : null,
    spent_hours: r.spent_hours != null ? Number(r.spent_hours) : null,
    start_date: (r.start_date as string | null) ?? null,
    due_date: (r.due_date as string | null) ?? null,
    created_on: (r.created_on as string | null) ?? null,
    updated_on: (r.updated_on as string | null) ?? null,
    is_mine: Number(r.is_mine) === 1,
    is_pinned: Number(r.is_pinned) === 1,
    acceptance_criteria: String(r.acceptance_criteria || ''),
    steps_for_implementation: String(r.steps_for_implementation || ''),
  };
}

export const IssuesRepo = {
  async getAll(projectId?: number): Promise<TrackerNode[]> {
    const db = await getDb();
    const rows = projectId
      ? await db.getAllAsync<Record<string, unknown>>(
          'SELECT * FROM issues WHERE project_id = ? ORDER BY id DESC',
          [projectId]
        )
      : await db.getAllAsync<Record<string, unknown>>('SELECT * FROM issues ORDER BY id DESC');
    return rows.map(mapIssueRow);
  },

  async getFeatures(projectId: number): Promise<TrackerNode[]> {
    const db = await getDb();
    const rows = await db.getAllAsync<Record<string, unknown>>(
      "SELECT * FROM issues WHERE project_id = ? AND lower(tracker) = 'feature' ORDER BY subject ASC",
      [projectId]
    );
    return rows.map(mapIssueRow);
  },

  async getById(id: number): Promise<TrackerNode | null> {
    const db = await getDb();
    const row = await db.getFirstAsync<Record<string, unknown>>('SELECT * FROM issues WHERE id = ?', [id]);
    return row ? mapIssueRow(row) : null;
  },

  async upsertMany(projectId: number, nodes: TrackerNode[], replaceProject = false): Promise<void> {
    const now = new Date().toISOString();
    await runInTransaction(async db => {
      const existingPins = new Set<number>();
      const pinRows = await db.getAllAsync<{ id: number }>('SELECT id FROM issues WHERE is_pinned = 1');
      pinRows.forEach(p => existingPins.add(p.id));

      if (replaceProject) {
        await db.runAsync('DELETE FROM issues WHERE project_id = ? AND id > 0', [projectId]);
      }
      for (const n of nodes) {
        const pinned = n.is_pinned || existingPins.has(n.id) ? 1 : 0;
        await db.runAsync(
          `INSERT OR REPLACE INTO issues (
            id, project_id, subject, description, tracker, status, status_id, is_closed,
            done_ratio, priority, assigned_to, assigned_to_id, parent_id, estimated_hours,
            spent_hours, start_date, due_date, created_on, updated_on, is_mine, is_pinned,
            acceptance_criteria, steps_for_implementation, synced_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            n.id,
            n.project_id || projectId,
            n.subject,
            n.description || '',
            n.tracker,
            n.status,
            n.status_id,
            n.is_closed ? 1 : 0,
            n.done_ratio,
            n.priority,
            n.assigned_to,
            n.assigned_to_id,
            n.parent_id,
            n.estimated_hours,
            n.spent_hours,
            n.start_date,
            n.due_date,
            n.created_on,
            n.updated_on,
            n.is_mine ? 1 : 0,
            pinned,
            n.acceptance_criteria || '',
            n.steps_for_implementation || '',
            now,
          ]
        );
      }
    });
  },

  async updateStatusLocal(issueId: number, status: IssueStatus): Promise<void> {
    const db = await getDb();
    await db.runAsync(
      'UPDATE issues SET status = ?, status_id = ?, is_closed = ?, updated_on = ? WHERE id = ?',
      [status.name, status.id, status.is_closed ? 1 : 0, new Date().toISOString(), issueId]
    );
  },

  async togglePin(issueId: number): Promise<boolean> {
    const db = await getDb();
    const row = await db.getFirstAsync<{ is_pinned: number }>('SELECT is_pinned FROM issues WHERE id = ?', [issueId]);
    const next = row?.is_pinned === 1 ? 0 : 1;
    await db.runAsync('UPDATE issues SET is_pinned = ? WHERE id = ?', [next, issueId]);
    return next === 1;
  },

  async addSpentHoursLocal(issueId: number, deltaHours: number): Promise<void> {
    const db = await getDb();
    await db.runAsync('UPDATE issues SET spent_hours = COALESCE(spent_hours, 0) + ? WHERE id = ?', [deltaHours, issueId]);
  },

  async deleteById(issueId: number): Promise<void> {
    const db = await getDb();
    await db.runAsync('DELETE FROM issues WHERE id = ?', [issueId]);
  },
};

export const TimeEntriesRepo = {
  async getRange(fromDate: string, toDate: string): Promise<TimeEntryRecord[]> {
    const db = await getDb();
    const rows = await db.getAllAsync<Record<string, unknown>>(
      'SELECT * FROM time_entries WHERE spent_on >= ? AND spent_on <= ? ORDER BY spent_on DESC, id DESC',
      [fromDate, toDate]
    );
    return rows.map(r => ({
      id: Number(r.id),
      local_id: (r.local_id as string | null) ?? null,
      issue_id: r.issue_id != null ? Number(r.issue_id) : null,
      issue_subject: String(r.issue_subject || ''),
      project_name: String(r.project_name || ''),
      hours: Number(r.hours) || 0,
      activity_id: r.activity_id != null ? Number(r.activity_id) : null,
      activity: String(r.activity || ''),
      comments: String(r.comments || ''),
      spent_on: String(r.spent_on || ''),
      pending_sync: Number(r.pending_sync) === 1,
    }));
  },

  async replaceRemoteRange(fromDate: string, toDate: string, entries: TimeEntryRecord[]): Promise<void> {
    await runInTransaction(async db => {
      await db.runAsync(
        'DELETE FROM time_entries WHERE pending_sync = 0 AND spent_on >= ? AND spent_on <= ?',
        [fromDate, toDate]
      );
      for (const e of entries) {
        await db.runAsync(
          `INSERT OR REPLACE INTO time_entries (
            id, local_id, issue_id, issue_subject, project_name, hours, activity_id, activity, comments, spent_on, pending_sync
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
          [e.id, null, e.issue_id, e.issue_subject, e.project_name, e.hours, e.activity_id, e.activity, e.comments, e.spent_on]
        );
      }
    });
  },

  async insertLocal(entry: Omit<TimeEntryRecord, 'id'> & { id?: number }): Promise<TimeEntryRecord> {
    const db = await getDb();
    const id = entry.id ?? -Math.floor(Date.now());
    await db.runAsync(
      `INSERT OR REPLACE INTO time_entries (
        id, local_id, issue_id, issue_subject, project_name, hours, activity_id, activity, comments, spent_on, pending_sync
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        entry.local_id ?? null,
        entry.issue_id,
        entry.issue_subject,
        entry.project_name,
        entry.hours,
        entry.activity_id,
        entry.activity,
        entry.comments,
        entry.spent_on,
        entry.pending_sync ? 1 : 0,
      ]
    );
    return { ...entry, id };
  },

  async confirmRemote(localId: number, confirmed: TimeEntryRecord): Promise<void> {
    await runInTransaction(async db => {
      await db.runAsync('DELETE FROM time_entries WHERE id = ?', [localId]);
      await db.runAsync(
        `INSERT OR REPLACE INTO time_entries (
          id, local_id, issue_id, issue_subject, project_name, hours, activity_id, activity, comments, spent_on, pending_sync
        ) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        [
          confirmed.id,
          confirmed.issue_id,
          confirmed.issue_subject,
          confirmed.project_name,
          confirmed.hours,
          confirmed.activity_id,
          confirmed.activity,
          confirmed.comments,
          confirmed.spent_on,
        ]
      );
    });
  },
};

export const HistoryRepo = {
  async list(limit = 50): Promise<SyncHistoryItem[]> {
    const db = await getDb();
    const rows = await db.getAllAsync<Record<string, unknown>>(
      'SELECT * FROM sync_history ORDER BY created_at DESC, id DESC LIMIT ?',
      [limit]
    );
    return rows.map(r => ({
      id: Number(r.id),
      pr_url: (r.pr_url as string | null) ?? null,
      pr_number: r.pr_number != null ? Number(r.pr_number) : null,
      pr_repo: (r.pr_repo as string | null) ?? null,
      calendar_event_id: (r.calendar_event_id as string | null) ?? null,
      subject: String(r.subject || ''),
      issue_id: Number(r.issue_id),
      issue_url: String(r.issue_url || ''),
      created_at: String(r.created_at || ''),
      quick_task: Number(r.quick_task) === 1,
      hours: r.hours != null ? Number(r.hours) : null,
      pending_sync: Number(r.pending_sync) === 1,
    }));
  },

  async findByPrUrl(prUrl: string): Promise<SyncHistoryItem | null> {
    const target = normalizePrUrl(prUrl);
    const items = await HistoryRepo.list(200);
    return items.find(i => i.pr_url && normalizePrUrl(i.pr_url) === target) || null;
  },

  async add(item: SyncHistoryItem): Promise<void> {
    const db = await getDb();
    await db.runAsync(
      `INSERT INTO sync_history (
        pr_url, pr_number, pr_repo, calendar_event_id, subject, issue_id, issue_url, created_at, quick_task, hours, pending_sync
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.pr_url,
        item.pr_number,
        item.pr_repo,
        item.calendar_event_id ?? null,
        item.subject,
        item.issue_id,
        item.issue_url,
        item.created_at,
        item.quick_task ? 1 : 0,
        item.hours ?? null,
        item.pending_sync ? 1 : 0,
      ]
    );
  },

  async replaceByIssueId(oldIssueId: number, updated: Partial<SyncHistoryItem>): Promise<void> {
    const db = await getDb();
    await db.runAsync(
      'UPDATE sync_history SET issue_id = COALESCE(?, issue_id), issue_url = COALESCE(?, issue_url), pending_sync = 0 WHERE issue_id = ?',
      [updated.issue_id ?? null, updated.issue_url ?? null, oldIssueId]
    );
  },

  async mergeRemote(items: SyncHistoryItem[]): Promise<void> {
    await runInTransaction(async db => {
      await db.runAsync('DELETE FROM sync_history WHERE pending_sync = 0');
      for (const item of items) {
        await db.runAsync(
          `INSERT INTO sync_history (
            pr_url, pr_number, pr_repo, calendar_event_id, subject, issue_id, issue_url, created_at, quick_task, hours, pending_sync
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
          [
            item.pr_url ?? null,
            item.pr_number ?? null,
            item.pr_repo ?? null,
            item.calendar_event_id ?? null,
            item.subject,
            item.issue_id,
            item.issue_url,
            item.created_at,
            item.quick_task ? 1 : 0,
            item.hours ?? null,
          ]
        );
      }
    });
  },
};

export const PrCacheRepo = {
  async get(prUrl: string): Promise<PullRequestPayload | null> {
    const db = await getDb();
    const row = await db.getFirstAsync<{ payload_json: string }>(
      'SELECT payload_json FROM pr_cache WHERE pr_url = ?',
      [normalizePrUrl(prUrl)]
    );
    if (!row) return null;
    try {
      return JSON.parse(row.payload_json) as PullRequestPayload;
    } catch {
      return null;
    }
  },
  async save(pr: PullRequestPayload): Promise<void> {
    const db = await getDb();
    await db.runAsync(
      'INSERT OR REPLACE INTO pr_cache (pr_url, repo, number, payload_json, fetched_at) VALUES (?, ?, ?, ?, ?)',
      [normalizePrUrl(pr.url), pr.repo, pr.number, JSON.stringify(pr), new Date().toISOString()]
    );
  },
  async listRecent(limit = 10): Promise<PullRequestPayload[]> {
    const db = await getDb();
    const rows = await db.getAllAsync<{ payload_json: string }>(
      'SELECT payload_json FROM pr_cache ORDER BY fetched_at DESC LIMIT ?',
      [limit]
    );
    const out: PullRequestPayload[] = [];
    for (const r of rows) {
      try {
        out.push(JSON.parse(r.payload_json) as PullRequestPayload);
      } catch {
        // skip corrupt cache entry
      }
    }
    return out;
  },
};

export const CalendarRepo = {
  async getByDate(dateStr: string): Promise<CalendarEvent[]> {
    const db = await getDb();
    const rows = await db.getAllAsync<Record<string, unknown>>(
      'SELECT * FROM calendar_events WHERE date_str = ? ORDER BY start_iso ASC',
      [dateStr]
    );
    return rows.map(r => ({
      id: String(r.id),
      date_str: String(r.date_str),
      title: String(r.title),
      description: String(r.description || ''),
      location: String(r.location || ''),
      start: String(r.start_iso),
      end: String(r.end_iso),
      all_day: Number(r.all_day) === 1,
      hours: r.hours != null ? Number(r.hours) : null,
      organizer: (r.organizer as string | null) ?? null,
    }));
  },
  async replaceDate(dateStr: string, events: CalendarEvent[]): Promise<void> {
    const now = new Date().toISOString();
    await runInTransaction(async db => {
      await db.runAsync('DELETE FROM calendar_events WHERE date_str = ?', [dateStr]);
      for (const ev of events) {
        await db.runAsync(
          `INSERT INTO calendar_events (
            id, date_str, title, description, location, start_iso, end_iso, all_day, hours, organizer, fetched_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            ev.id,
            dateStr,
            ev.title,
            ev.description,
            ev.location,
            ev.start,
            ev.end,
            ev.all_day ? 1 : 0,
            ev.hours,
            ev.organizer,
            now,
          ]
        );
      }
    });
  },
};

export const EodSheetRepo = {
  async getCached(gid?: string): Promise<EodSheetData | null> {
    const db = await getDb();
    const tabs = await db.getAllAsync<EodSheetTab & { spreadsheet_title: string }>(
      'SELECT gid, title, spreadsheet_title FROM eod_sheet_tabs ORDER BY rowid ASC'
    );
    if (!tabs.length) return null;
    const activeTab = (gid ? tabs.find(t => t.gid === gid) : tabs[0]) || tabs[0];
    const rowRecords = await db.getAllAsync<{ row_num: number; cells_json: string; pending_sync: number }>(
      'SELECT row_num, cells_json, pending_sync FROM eod_sheet_rows WHERE gid = ? ORDER BY row_num ASC',
      [activeTab.gid]
    );
    const rows: EodSheetRow[] = rowRecords.map(r => ({
      row: r.row_num,
      cells: JSON.parse(r.cells_json) as string[],
      pending_sync: r.pending_sync === 1,
    }));
    const width = Math.max(1, ...rows.map(r => r.cells.length));
    return {
      spreadsheetTitle: activeTab.spreadsheet_title,
      tabs: tabs.map(t => ({ gid: t.gid, title: t.title })),
      tab: { gid: activeTab.gid, title: activeTab.title },
      width,
      rows,
    };
  },

  async saveSheetData(data: EodSheetData): Promise<void> {
    const now = new Date().toISOString();
    await runInTransaction(async db => {
      await db.runAsync('DELETE FROM eod_sheet_tabs');
      for (const t of data.tabs) {
        await db.runAsync(
          'INSERT INTO eod_sheet_tabs (gid, title, spreadsheet_title, updated_at) VALUES (?, ?, ?, ?)',
          [t.gid, t.title, data.spreadsheetTitle, now]
        );
      }
      await db.runAsync('DELETE FROM eod_sheet_rows WHERE gid = ? AND pending_sync = 0', [data.tab.gid]);
      for (const r of data.rows) {
        await db.runAsync(
          'INSERT OR REPLACE INTO eod_sheet_rows (gid, row_num, cells_json, pending_sync) VALUES (?, ?, ?, 0)',
          [data.tab.gid, r.row, JSON.stringify(r.cells)]
        );
      }
    });
  },

  async updateCellLocal(gid: string, rowNum: number, col: number, value: string, pending = true): Promise<void> {
    const db = await getDb();
    const rec = await db.getFirstAsync<{ cells_json: string }>(
      'SELECT cells_json FROM eod_sheet_rows WHERE gid = ? AND row_num = ?',
      [gid, rowNum]
    );
    if (!rec) return;
    const cells = JSON.parse(rec.cells_json) as string[];
    while (cells.length <= col) cells.push('');
    cells[col] = value;
    await db.runAsync(
      'UPDATE eod_sheet_rows SET cells_json = ?, pending_sync = ? WHERE gid = ? AND row_num = ?',
      [JSON.stringify(cells), pending ? 1 : 0, gid, rowNum]
    );
  },

  async appendRowLocal(gid: string, values: string[], pending = true): Promise<number> {
    const db = await getDb();
    const maxRow = await db.getFirstAsync<{ max_row: number | null }>(
      'SELECT MAX(row_num) AS max_row FROM eod_sheet_rows WHERE gid = ?',
      [gid]
    );
    const nextRow = (maxRow?.max_row ?? 1) + 1;
    await db.runAsync(
      'INSERT INTO eod_sheet_rows (gid, row_num, cells_json, pending_sync) VALUES (?, ?, ?, ?)',
      [gid, nextRow, JSON.stringify(values), pending ? 1 : 0]
    );
    return nextRow;
  },

  async deleteRowLocal(gid: string, rowNum: number): Promise<void> {
    await runInTransaction(async db => {
      await db.runAsync('DELETE FROM eod_sheet_rows WHERE gid = ? AND row_num = ?', [gid, rowNum]);
      await db.runAsync('UPDATE eod_sheet_rows SET row_num = row_num - 1 WHERE gid = ? AND row_num > ?', [gid, rowNum]);
    });
  },
};

export const KpiDraftsRepo = {
  async getAllForPeriod(periodKey: string): Promise<Record<string, { contextLine: string; generatedText: string }>> {
    const db = await getDb();
    const rows = await db.getAllAsync<{ kpi_id: string; context_line: string; generated_text: string }>(
      'SELECT kpi_id, context_line, generated_text FROM kpi_drafts WHERE period_key = ?',
      [periodKey]
    );
    const out: Record<string, { contextLine: string; generatedText: string }> = {};
    for (const r of rows) {
      out[r.kpi_id] = { contextLine: r.context_line, generatedText: r.generated_text };
    }
    return out;
  },
  async save(periodKey: string, kpiId: string, contextLine: string, generatedText: string): Promise<void> {
    const db = await getDb();
    await db.runAsync(
      'INSERT OR REPLACE INTO kpi_drafts (period_key, kpi_id, context_line, generated_text, updated_at) VALUES (?, ?, ?, ?, ?)',
      [periodKey, kpiId, contextLine, generatedText, new Date().toISOString()]
    );
  },
};

export const ActivityFeedRepo = {
  async list(limit = MAX_ACTIVITY_FEED_ITEMS): Promise<ActivityFeedItem[]> {
    const db = await getDb();
    return db.getAllAsync<ActivityFeedItem>(
      'SELECT * FROM activity_feed ORDER BY occurred_at DESC, id DESC LIMIT ?',
      [limit]
    );
  },
  async recordBatch(items: Omit<ActivityFeedItem, 'id'>[]): Promise<void> {
    if (!items.length) return;
    await runInTransaction(async db => {
      for (const item of items) {
        await db.runAsync(
          'INSERT INTO activity_feed (issue_id, subject, tracker, change_type, field, from_val, to_val, occurred_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [item.issue_id, item.subject, item.tracker, item.change_type, item.field, item.from_val, item.to_val, item.occurred_at]
        );
      }
      await db.runAsync(
        `DELETE FROM activity_feed WHERE id NOT IN (SELECT id FROM activity_feed ORDER BY id DESC LIMIT ?)`,
        [MAX_ACTIVITY_FEED_ITEMS]
      );
    });
  },
};

export const SyncQueueRepo = {
  async list(): Promise<SyncQueueItem[]> {
    const db = await getDb();
    return db.getAllAsync<SyncQueueItem>('SELECT * FROM sync_queue ORDER BY id ASC');
  },
  async pendingCount(): Promise<number> {
    const db = await getDb();
    const row = await db.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) AS count FROM sync_queue WHERE status != 'syncing'"
    );
    return row?.count ?? 0;
  },
  async enqueue(opType: SyncOpType, payload: unknown, localRef: string | null = null): Promise<number> {
    const db = await getDb();
    const now = new Date().toISOString();
    const res = await db.runAsync(
      `INSERT INTO sync_queue (op_type, payload_json, local_ref, status, attempts, last_error, created_at, updated_at)
       VALUES (?, ?, ?, 'pending', 0, NULL, ?, ?)`,
      [opType, JSON.stringify(payload), localRef, now, now]
    );
    return res.lastInsertRowId;
  },
  async markStatus(id: number, status: SyncQueueItem['status'], lastError: string | null = null): Promise<void> {
    const db = await getDb();
    await db.runAsync(
      'UPDATE sync_queue SET status = ?, attempts = attempts + ?, last_error = ?, updated_at = ? WHERE id = ?',
      [status, status === 'failed' ? 1 : 0, lastError, new Date().toISOString(), id]
    );
  },
  async remove(id: number): Promise<void> {
    const db = await getDb();
    await db.runAsync('DELETE FROM sync_queue WHERE id = ?', [id]);
  },
  async clearAll(): Promise<void> {
    const db = await getDb();
    await db.runAsync('DELETE FROM sync_queue');
  },
};

export async function clearCachedData(): Promise<void> {
  await runInTransaction(async db => {
    await db.execAsync(`
      DELETE FROM projects;
      DELETE FROM project_members;
      DELETE FROM issue_statuses;
      DELETE FROM time_activities;
      DELETE FROM target_versions;
      DELETE FROM issues;
      DELETE FROM time_entries;
      DELETE FROM pr_cache;
      DELETE FROM calendar_events;
      DELETE FROM eod_sheet_tabs;
      DELETE FROM eod_sheet_rows;
      DELETE FROM activity_feed;
    `);
  });
}

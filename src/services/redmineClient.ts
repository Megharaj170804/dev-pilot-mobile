import {
  CUSTOM_FIELD_IDS,
  DEFAULT_PROJECT_ID,
  DEFAULT_TRACKER_ID,
  DEFAULT_VERSION_ID,
  HTTP_TIMEOUT_MS,
  REDMINE_ID_BATCH_SIZE,
  REDMINE_PAGE_SIZE,
  REDMINE_PRIORITY_MAP,
  REDMINE_STATUS_IDS,
} from '../constants/config';
import {
  buildIssueDates,
  sanitizeIssueFields,
  sanitizeTimeComment,
  statusIdForPr,
  toDateString,
} from '../domain/redmineUtils';
import type {
  AppConfig,
  CalendarEvent,
  EodSheetData,
  GoogleIntegrationsStatus,
  IssueStatus,
  ProjectMember,
  RedmineUser,
  TargetVersion,
  TimeActivity,
  TimeEntryRecord,
  TrackerNode,
} from '../types';

export class HttpApiError extends Error {
  status: number;
  isNetwork: boolean;
  constructor(message: string, status = 0, isNetwork = false) {
    super(message);
    this.status = status;
    this.isNetwork = isNetwork;
  }
}

async function requestJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const text = await res.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      parsed = null;
    }
    if (!res.ok) {
      const msg =
        (parsed as { error?: string; errors?: string[] } | null)?.error ||
        (parsed as { errors?: string[] } | null)?.errors?.join(', ') ||
        text.slice(0, 200) ||
        `HTTP ${res.status}`;
      throw new HttpApiError(msg, res.status, false);
    }
    if (parsed === null && /html/i.test(res.headers.get('content-type') || '')) {
      throw new HttpApiError(
        'Server returned HTML instead of JSON — restart "npm start" in pr-to-tracker/ to load the updated API.',
        502,
        false
      );
    }
    return (parsed ?? {}) as T;
  } catch (err) {
    if (err instanceof HttpApiError) throw err;
    throw new HttpApiError(err instanceof Error ? err.message : 'Network error', 0, true);
  } finally {
    clearTimeout(timer);
  }
}

async function redmineGet<T>(cfg: AppConfig, endpoint: string): Promise<T> {
  if (!cfg.redmineApiKey) {
    throw new HttpApiError('Redmine API key is not configured in Settings.', 401, false);
  }
  return requestJson<T>(`${cfg.redmineUrl}${endpoint}`, {
    headers: {
      'X-Redmine-API-Key': cfg.redmineApiKey,
      'Content-Type': 'application/json',
    },
  });
}

async function redmineWrite<T>(cfg: AppConfig, method: 'POST' | 'PUT', endpoint: string, body: unknown): Promise<T> {
  if (!cfg.redmineApiKey) {
    throw new HttpApiError('Redmine API key is not configured in Settings.', 401, false);
  }
  return requestJson<T>(`${cfg.redmineUrl}${endpoint}`, {
    method,
    headers: {
      'X-Redmine-API-Key': cfg.redmineApiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

interface RawRedmineIssue {
  id: number;
  project?: { id: number; name: string };
  subject: string;
  description?: string;
  tracker?: { id: number; name: string };
  status?: { id: number; name: string; is_closed?: boolean };
  done_ratio?: number;
  priority?: { id: number; name: string };
  assigned_to?: { id: number; name: string };
  parent?: { id: number };
  estimated_hours?: number;
  spent_hours?: number;
  start_date?: string;
  due_date?: string;
  created_on?: string;
  updated_on?: string;
  closed_on?: string;
  fixed_version?: { id: number; name: string };
  custom_fields?: Array<{ id: number; value?: string }>;
}

function mapRawIssue(issue: RawRedmineIssue, assigneeId: number): TrackerNode {
  const cf = (id: number) => issue.custom_fields?.find(c => c.id === id)?.value || '';
  return {
    id: issue.id,
    project_id: issue.project?.id || DEFAULT_PROJECT_ID,
    subject: issue.subject,
    description: issue.description || '',
    tracker: issue.tracker?.name || 'Task',
    status: issue.status?.name || null,
    status_id: issue.status?.id || null,
    is_closed: Boolean(issue.status?.is_closed),
    done_ratio: issue.done_ratio ?? null,
    priority: issue.priority?.name || null,
    assigned_to: issue.assigned_to?.name || null,
    assigned_to_id: issue.assigned_to?.id || null,
    parent_id: issue.parent?.id || null,
    estimated_hours: issue.estimated_hours ?? null,
    spent_hours: issue.spent_hours ?? null,
    start_date: issue.start_date || null,
    due_date: issue.due_date || null,
    created_on: issue.created_on || null,
    updated_on: issue.updated_on || null,
    is_mine: issue.assigned_to?.id === assigneeId,
    acceptance_criteria: cf(CUSTOM_FIELD_IDS.ACCEPTANCE_CRITERIA),
    steps_for_implementation: cf(CUSTOM_FIELD_IDS.STEPS_FOR_IMPLEMENTATION),
  };
}

async function fetchAllRedminePages<T>(cfg: AppConfig, path: string, key: string): Promise<T[]> {
  const sep = path.includes('?') ? '&' : '?';
  const first = await redmineGet<Record<string, unknown>>(cfg, `${path}${sep}limit=${REDMINE_PAGE_SIZE}&offset=0`);
  const items = [...((first[key] as T[]) || [])];
  const total = Number(first.total_count ?? items.length);
  const offsets: number[] = [];
  for (let offset = REDMINE_PAGE_SIZE; offset < total && offset < 2000; offset += REDMINE_PAGE_SIZE) {
    offsets.push(offset);
  }
  const rest = await Promise.all(
    offsets.map(offset => redmineGet<Record<string, unknown>>(cfg, `${path}${sep}limit=${REDMINE_PAGE_SIZE}&offset=${offset}`))
  );
  rest.forEach(p => items.push(...((p[key] as T[]) || [])));
  return items;
}

export const RedmineClient = {
  async fetchMe(cfg: AppConfig): Promise<RedmineUser> {
    if (cfg.mode === 'server') {
      return requestJson<RedmineUser>(`${cfg.serverUrl}/api/me`);
    }
    const data = await redmineGet<{
      user?: {
        id: number;
        firstname: string;
        lastname: string;
        login: string;
        memberships?: Array<{ project?: { id: number; name: string } }>;
      };
    }>(cfg, '/users/current.json?include=memberships');
    const user = data.user;
    if (!user) throw new HttpApiError('Redmine did not return the current user.', 500, false);
    const projects = (user.memberships || [])
      .map(m => m.project)
      .filter((p): p is { id: number; name: string } => Boolean(p))
      .sort((a, b) => a.name.localeCompare(b.name));
    return {
      id: user.id,
      name: `${user.firstname} ${user.lastname}`.trim(),
      login: user.login,
      default_project_id: DEFAULT_PROJECT_ID,
      projects,
    };
  },

  async fetchStatuses(cfg: AppConfig): Promise<IssueStatus[]> {
    if (cfg.mode === 'server') {
      const res = await requestJson<{ statuses: IssueStatus[] }>(`${cfg.serverUrl}/api/issue-statuses`);
      return res.statuses || [];
    }
    const data = await redmineGet<{ issue_statuses?: Array<{ id: number; name: string; is_closed?: boolean }> }>(
      cfg,
      '/issue_statuses.json'
    );
    return (data.issue_statuses || []).map(s => ({ id: s.id, name: s.name, is_closed: Boolean(s.is_closed) }));
  },

  async fetchActivities(cfg: AppConfig): Promise<TimeActivity[]> {
    if (cfg.mode === 'server') {
      const res = await requestJson<{ activities: TimeActivity[] }>(`${cfg.serverUrl}/api/time-activities`);
      return res.activities || [];
    }
    const data = await redmineGet<{
      time_entry_activities?: Array<{ id: number; name: string; active?: boolean; is_default?: boolean }>;
    }>(cfg, '/enumerations/time_entry_activities.json');
    return (data.time_entry_activities || [])
      .filter(a => a.active !== false)
      .map(a => ({ id: a.id, name: a.name, is_default: Boolean(a.is_default) }));
  },

  async fetchProjectMembers(cfg: AppConfig, projectId: number): Promise<ProjectMember[]> {
    if (cfg.mode === 'server') {
      const res = await requestJson<{ members: ProjectMember[] }>(
        `${cfg.serverUrl}/api/project-members?project_id=${projectId}`
      );
      return res.members || [];
    }
    const memberships = await fetchAllRedminePages<{ user?: { id: number; name: string } }>(
      cfg,
      `/projects/${projectId}/memberships.json`,
      'memberships'
    );
    const byId = new Map<number, string>();
    for (const m of memberships) {
      if (m.user) byId.set(m.user.id, m.user.name);
    }
    return [...byId.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },

  async fetchTargetVersions(cfg: AppConfig, projectId: number): Promise<TargetVersion[]> {
    if (cfg.mode === 'server') {
      const res = await requestJson<{ versions: TargetVersion[] }>(`${cfg.serverUrl}/api/versions?project_id=${projectId}`);
      return res.versions || [];
    }
    const data = await redmineGet<{ versions?: Array<{ id: number; name: string; status?: string; due_date?: string }> }>(
      cfg,
      `/projects/${projectId}/versions.json`
    );
    return (data.versions || [])
      .filter(v => v.status === 'open')
      .map(v => ({ id: v.id, name: v.name, due_date: v.due_date || null }));
  },

  async fetchProjectFeatures(cfg: AppConfig, projectId: number): Promise<TrackerNode[]> {
    if (cfg.mode === 'server') {
      const res = await requestJson<{ features?: Array<{ id: number; subject: string; status?: string }> }>(
        `${cfg.serverUrl}/api/features?project_id=${projectId}`
      );
      return (res.features || []).map(f => ({
        id: f.id,
        project_id: projectId,
        subject: f.subject,
        tracker: 'Feature',
        status: f.status || null,
        status_id: null,
        is_closed: false,
        done_ratio: null,
        priority: null,
        assigned_to: null,
        assigned_to_id: null,
        parent_id: null,
        estimated_hours: null,
        spent_hours: null,
        start_date: null,
        due_date: null,
        created_on: null,
        updated_on: null,
        is_mine: false,
      }));
    }
    const trackersRes = await redmineGet<{ trackers?: Array<{ id: number; name: string }> }>(cfg, '/trackers.json');
    const featureTracker = (trackersRes.trackers || []).find(t => /feature/i.test(t.name));
    if (!featureTracker) return [];
    const issues = await fetchAllRedminePages<RawRedmineIssue>(
      cfg,
      `/issues.json?project_id=${projectId}&tracker_id=${featureTracker.id}&status_id=*&sort=subject`,
      'issues'
    );
    return issues.map(i => mapRawIssue(i, -1));
  },

  async fetchTrackerHierarchy(cfg: AppConfig, projectId: number, assigneeId: number): Promise<TrackerNode[]> {
    if (cfg.mode === 'server') {
      const snap = await requestJson<{ nodes: TrackerNode[] }>(
        `${cfg.serverUrl}/api/my-tracker-data?project_id=${projectId}`
      );
      return snap.nodes.map(n => ({ ...n, project_id: projectId }));
    }

    const mine = await fetchAllRedminePages<RawRedmineIssue>(
      cfg,
      `/issues.json?project_id=${projectId}&assigned_to_id=${assigneeId}&status_id=*&sort=id`,
      'issues'
    );
    const map = new Map<number, TrackerNode>();
    mine.forEach(issue => map.set(issue.id, mapRawIssue(issue, assigneeId)));

    for (;;) {
      const missing = [...new Set([...map.values()].map(n => n.parent_id).filter((id): id is number => Boolean(id && !map.has(id))))];
      if (!missing.length) break;
      const batches: number[][] = [];
      for (let i = 0; i < missing.length; i += REDMINE_ID_BATCH_SIZE) {
        batches.push(missing.slice(i, i + REDMINE_ID_BATCH_SIZE));
      }
      const pages = await Promise.all(
        batches.map(batch =>
          redmineGet<{ issues?: RawRedmineIssue[] }>(
            cfg,
            `/issues.json?issue_id=${batch.join(',')}&status_id=*&limit=${REDMINE_PAGE_SIZE}`
          )
        )
      );
      const parents = pages.flatMap(p => p.issues || []);
      if (!parents.length) break;
      parents.forEach(issue => map.set(issue.id, mapRawIssue(issue, assigneeId)));
    }

    // Also cache Features in the project so PR -> Redmine & Quick Task parent dropdowns work offline
    try {
      const features = await RedmineClient.fetchProjectFeatures(cfg, projectId);
      features.forEach(f => {
        if (!map.has(f.id)) map.set(f.id, f);
      });
    } catch {
      // Non-fatal if tracker list fails
    }

    return [...map.values()];
  },

  async fetchTimeEntriesRange(cfg: AppConfig, fromDate: string, toDate: string): Promise<TimeEntryRecord[]> {
    if (cfg.mode === 'server') {
      try {
        const res = await requestJson<{ entries?: TimeEntryRecord[] }>(
          `${cfg.serverUrl}/api/time-entries?from=${encodeURIComponent(fromDate)}&to=${encodeURIComponent(toDate)}`
        );
        return (res.entries || []).map(te => ({ ...te, pending_sync: false }));
      } catch {
        // Fallback if an older server instance without /api/time-entries is running
        const brief = await requestJson<{
          today_entries?: TimeEntryRecord[];
          yesterday_entries?: TimeEntryRecord[];
        }>(`${cfg.serverUrl}/api/daily-brief`).catch(
          () => ({ today_entries: [], yesterday_entries: [] })
        );
        return [...(brief.today_entries || []), ...(brief.yesterday_entries || [])].map(te => ({
          ...te,
          pending_sync: false,
        }));
      }
    }
    const raw = await fetchAllRedminePages<{
      id: number;
      issue?: { id: number; subject?: string };
      project?: { id: number; name: string };
      hours: number;
      activity?: { id: number; name: string };
      comments?: string;
      spent_on: string;
    }>(cfg, `/time_entries.json?user_id=me&from=${fromDate}&to=${toDate}`, 'time_entries');

    return raw.map(te => ({
      id: te.id,
      issue_id: te.issue?.id || null,
      issue_subject: te.issue?.subject || (te.issue?.id ? `Issue #${te.issue.id}` : 'General'),
      project_name: te.project?.name || '',
      hours: Math.round((Number(te.hours) || 0) * 100) / 100,
      activity_id: te.activity?.id || null,
      activity: te.activity?.name || '',
      comments: te.comments || '',
      spent_on: te.spent_on,
      pending_sync: false,
    }));
  },

  async updateIssueStatus(cfg: AppConfig, issueId: number, statusId: number): Promise<void> {
    if (cfg.mode === 'server') {
      await requestJson(`${cfg.serverUrl}/api/issue-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issue_id: issueId, status_id: statusId }),
      });
      return;
    }
    await redmineWrite(cfg, 'PUT', `/issues/${issueId}.json`, { issue: { status_id: statusId } });
    const verify = await redmineGet<{ issue?: { status?: { id: number; name: string } } }>(cfg, `/issues/${issueId}.json`);
    if (verify.issue?.status && verify.issue.status.id !== statusId) {
      throw new HttpApiError(
        `Redmine kept the issue in "${verify.issue.status.name}" — that transition isn't allowed by the workflow.`,
        409,
        false
      );
    }
  },

  async logTime(
    cfg: AppConfig,
    payload: { issue_id: number; hours: number; activity_id: number; comments: string; spent_on: string }
  ): Promise<TimeEntryRecord> {
    if (cfg.mode === 'server') {
      const res = await requestJson<{
        time_entry: { id: number; issue?: { id: number }; hours: number; activity?: { id: number; name: string }; comments: string; spent_on: string };
      }>(`${cfg.serverUrl}/api/log-time`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const te = res.time_entry;
      return {
        id: te.id,
        issue_id: payload.issue_id,
        issue_subject: `#${payload.issue_id}`,
        project_name: '',
        hours: payload.hours,
        activity_id: payload.activity_id,
        activity: te.activity?.name || '',
        comments: payload.comments,
        spent_on: payload.spent_on,
      };
    }

    const res = await redmineWrite<{
      time_entry: { id: number; activity?: { id: number; name: string }; project?: { name: string } };
    }>(cfg, 'POST', '/time_entries.json', {
      time_entry: {
        issue_id: payload.issue_id,
        hours: payload.hours,
        comments: sanitizeTimeComment(payload.comments),
        activity_id: payload.activity_id,
        spent_on: payload.spent_on || toDateString(new Date()),
      },
    });
    return {
      id: res.time_entry.id,
      issue_id: payload.issue_id,
      issue_subject: `#${payload.issue_id}`,
      project_name: res.time_entry.project?.name || '',
      hours: payload.hours,
      activity_id: payload.activity_id,
      activity: res.time_entry.activity?.name || '',
      comments: payload.comments,
      spent_on: payload.spent_on,
    };
  },

  async createIssueFromPr(
    cfg: AppConfig,
    payload: {
      subject: string;
      description: string;
      priority_id: number;
      estimated_hours?: number | null;
      acceptance_criteria: string;
      steps_for_implementation: string;
      issue_label: string;
      pr_url?: string | null;
      pr_number?: number | null;
      pr_repo?: string | null;
      pr_state?: string | null;
      pr_merged?: boolean;
      parent_issue_id?: number | null;
      project_id?: number | null;
      assigned_to_id?: number | null;
    }
  ): Promise<{ id: number; url: string }> {
    if (cfg.mode === 'server') {
      const created = await requestJson<{ id: number; url: string }>(`${cfg.serverUrl}/api/create-issue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return { id: created.id, url: created.url };
    }
    const safe = sanitizeIssueFields(payload);
    const dates = buildIssueDates(new Date());
    const projectId = payload.project_id || DEFAULT_PROJECT_ID;

    const customFields: Array<{ id: number; value: string }> = [
      { id: CUSTOM_FIELD_IDS.ISSUE_LABEL, value: safe.issue_label || 'Planned' },
      { id: CUSTOM_FIELD_IDS.ACTUAL_COMPLETION_DATE, value: dates.actual_completion_date },
    ];
    if (safe.acceptance_criteria) {
      customFields.push({ id: CUSTOM_FIELD_IDS.ACCEPTANCE_CRITERIA, value: safe.acceptance_criteria });
    }
    if (safe.steps_for_implementation) {
      customFields.push({ id: CUSTOM_FIELD_IDS.STEPS_FOR_IMPLEMENTATION, value: safe.steps_for_implementation });
    }

    const issueBody: Record<string, unknown> = {
      project_id: projectId,
      tracker_id: DEFAULT_TRACKER_ID,
      subject: safe.subject,
      description: safe.description,
      status_id: statusIdForPr({ state: payload.pr_state, merged: payload.pr_merged }),
      priority_id: payload.priority_id || REDMINE_PRIORITY_MAP.Medium,
      assigned_to_id: payload.assigned_to_id,
      start_date: dates.start_date,
      due_date: dates.due_date,
      custom_fields: customFields,
    };
    if (projectId === DEFAULT_PROJECT_ID) issueBody.fixed_version_id = DEFAULT_VERSION_ID;
    if (payload.parent_issue_id) issueBody.parent_issue_id = payload.parent_issue_id;
    if (payload.estimated_hours && payload.estimated_hours > 0) issueBody.estimated_hours = payload.estimated_hours;

    const res = await redmineWrite<{ issue: { id: number } }>(cfg, 'POST', '/issues.json', { issue: issueBody });
    return { id: res.issue.id, url: `${cfg.redmineUrl}/issues/${res.issue.id}` };
  },

  async createQuickTask(
    cfg: AppConfig,
    payload: {
      subject: string;
      description: string;
      acceptance_criteria: string;
      steps_for_implementation: string;
      priority: 'High' | 'Medium' | 'Low';
      context: string;
      project_id: number;
      assigned_to_id: number;
      due_date?: string | null;
      parent_issue_id?: number | null;
      fixed_version_id?: number | null;
      estimated_hours: number;
      logged_hours?: number | null;
      activity_id?: number | null;
      spent_on: string;
      calendar_event_id?: string | null;
    }
  ): Promise<{ issue_id: number; issue_url: string; time_warning: string | null }> {
    if (cfg.mode === 'server') {
      const res = await requestJson<{ issue_id: number; issue_url: string; time_warning?: string | null }>(
        `${cfg.serverUrl}/api/quick-task`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );
      return {
        issue_id: res.issue_id,
        issue_url: res.issue_url,
        time_warning: res.time_warning ?? null,
      };
    }
    const safe = sanitizeIssueFields({
      subject: payload.subject,
      description: payload.description || payload.context,
      acceptance_criteria: payload.acceptance_criteria,
      steps_for_implementation: payload.steps_for_implementation,
      issue_label: 'Planned',
    });

    const dateStr = payload.spent_on || toDateString(new Date());
    const customFields: Array<{ id: number; value: string }> = [
      { id: CUSTOM_FIELD_IDS.ISSUE_LABEL, value: 'Planned' },
      { id: CUSTOM_FIELD_IDS.ACTUAL_COMPLETION_DATE, value: dateStr },
    ];
    if (safe.acceptance_criteria) customFields.push({ id: CUSTOM_FIELD_IDS.ACCEPTANCE_CRITERIA, value: safe.acceptance_criteria });
    if (safe.steps_for_implementation) {
      customFields.push({ id: CUSTOM_FIELD_IDS.STEPS_FOR_IMPLEMENTATION, value: safe.steps_for_implementation });
    }

    const issueBody: Record<string, unknown> = {
      project_id: payload.project_id,
      tracker_id: DEFAULT_TRACKER_ID,
      subject: safe.subject,
      description: safe.description,
      status_id: REDMINE_STATUS_IDS.RESOLVED,
      priority_id: REDMINE_PRIORITY_MAP[payload.priority] || REDMINE_PRIORITY_MAP.Medium,
      assigned_to_id: payload.assigned_to_id,
      start_date: dateStr,
      due_date: payload.due_date || dateStr,
      done_ratio: 100,
      estimated_hours: payload.estimated_hours,
      custom_fields: customFields,
    };
    if (payload.fixed_version_id) issueBody.fixed_version_id = payload.fixed_version_id;
    else if (payload.project_id === DEFAULT_PROJECT_ID) issueBody.fixed_version_id = DEFAULT_VERSION_ID;
    if (payload.parent_issue_id) issueBody.parent_issue_id = payload.parent_issue_id;

    const res = await redmineWrite<{ issue: { id: number } }>(cfg, 'POST', '/issues.json', { issue: issueBody });
    const issueId = res.issue.id;
    let timeWarning: string | null = null;

    if (payload.logged_hours && payload.logged_hours > 0 && payload.activity_id) {
      try {
        await RedmineClient.logTime(cfg, {
          issue_id: issueId,
          hours: payload.logged_hours,
          activity_id: payload.activity_id,
          comments: payload.context || payload.description || safe.subject,
          spent_on: dateStr,
        });
      } catch (err) {
        timeWarning = err instanceof Error ? err.message : 'Time log rejected by Redmine';
      }
    }

    return {
      issue_id: issueId,
      issue_url: `${cfg.redmineUrl}/issues/${issueId}`,
      time_warning: timeWarning,
    };
  },

  async fetchHistory(cfg: AppConfig, limit = 100) {
    const res = await requestJson<{
      history?: Array<{
        pr_url: string | null;
        pr_number: number | null;
        pr_repo: string | null;
        calendar_event_id?: string | null;
        subject: string;
        issue_id: number;
        issue_url: string;
        created_at: string;
        quick_task?: boolean;
        hours?: number | null;
      }>;
    }>(`${cfg.serverUrl}/api/history?limit=${limit}`);
    return res.history || [];
  },

  async fetchIntegrationsStatus(cfg: AppConfig): Promise<GoogleIntegrationsStatus> {
    const [cal, sheets, googleConfig] = await Promise.all([
      requestJson<{ configured: boolean; connected: boolean; email?: string | null }>(`${cfg.serverUrl}/api/calendar/status`).catch(() => null),
      requestJson<{ configured: boolean; connected: boolean; email?: string | null; sheet_url?: string }>(`${cfg.serverUrl}/api/sheets/status`).catch(() => null),
      requestJson<{ configured: boolean; client_id_masked?: string; redirect_uri?: string; eod_sheet_id?: string; sheet_url?: string }>(`${cfg.serverUrl}/api/google/config`).catch(() => null),
    ]);
    return { cal, sheets, googleConfig };
  },

  async saveGoogleConfig(
    cfg: AppConfig,
    payload: { client_id?: string; client_secret?: string; eod_sheet_id?: string }
  ): Promise<void> {
    await requestJson(`${cfg.serverUrl}/api/google/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  },

  async disconnectCalendar(cfg: AppConfig): Promise<void> {
    await requestJson(`${cfg.serverUrl}/api/calendar/disconnect`, { method: 'POST' });
  },

  async disconnectSheets(cfg: AppConfig): Promise<void> {
    await requestJson(`${cfg.serverUrl}/api/sheets/disconnect`, { method: 'POST' });
  },

  getCalendarConnectUrl(cfg: AppConfig, returnTo?: string): string {
    const qs = returnTo ? `?return_to=${encodeURIComponent(returnTo)}` : '';
    return `${cfg.serverUrl}/api/calendar/connect${qs}`;
  },

  getSheetsConnectUrl(cfg: AppConfig, returnTo?: string): string {
    const qs = returnTo ? `?return_to=${encodeURIComponent(returnTo)}` : '';
    return `${cfg.serverUrl}/api/sheets/connect${qs}`;
  },

  async fetchCalendarEvents(cfg: AppConfig, dateStr: string): Promise<CalendarEvent[]> {
    if (!cfg.serverUrl) return [];
    const data = await requestJson<{ events?: CalendarEvent[] }>(
      `${cfg.serverUrl}/api/calendar/events?date=${encodeURIComponent(dateStr)}`
    );
    return (data.events || []).map(ev => ({ ...ev, date_str: dateStr }));
  },

  async fetchSheetsData(cfg: AppConfig, gid?: string): Promise<EodSheetData> {
    const qs = gid ? `?gid=${encodeURIComponent(gid)}` : '';
    return requestJson<EodSheetData>(`${cfg.serverUrl}/api/sheets/data${qs}`);
  },

  async updateSheetCell(cfg: AppConfig, gid: string, row: number, col: number, value: string): Promise<void> {
    await requestJson(`${cfg.serverUrl}/api/sheets/cell`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gid, row, col, value }),
    });
  },

  async appendSheetRow(cfg: AppConfig, gid: string, values: string[]): Promise<number | null> {
    const res = await requestJson<{ row: number | null }>(`${cfg.serverUrl}/api/sheets/row`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gid, values }),
    });
    return res.row;
  },

  async deleteSheetRow(cfg: AppConfig, gid: string, row: number): Promise<void> {
    await requestJson(`${cfg.serverUrl}/api/sheets/row`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gid, row }),
    });
  },
};

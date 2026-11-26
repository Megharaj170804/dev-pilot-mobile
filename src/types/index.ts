export type ConnectionMode = 'direct' | 'server';

export interface AppConfig {
  mode: ConnectionMode;
  redmineUrl: string;
  redmineApiKey: string;
  githubToken: string;
  geminiApiKey: string;
  groqApiKey: string;
  serverUrl: string;
  googleClientId?: string;
  googleClientSecret?: string;
  eodSheetId?: string;
}

export interface GoogleIntegrationsStatus {
  cal: { configured: boolean; connected: boolean; email?: string | null } | null;
  sheets: { configured: boolean; connected: boolean; email?: string | null; sheet_url?: string } | null;
  googleConfig?: {
    configured: boolean;
    client_id_masked?: string;
    redirect_uri?: string;
    eod_sheet_id?: string;
    sheet_url?: string;
  } | null;
}

export interface RedmineUser {
  id: number;
  name: string;
  login: string;
  default_project_id: number;
  projects: ProjectRecord[];
}

export interface ProjectRecord {
  id: number;
  name: string;
  count?: number;
}

export interface ProjectMember {
  id: number;
  name: string;
}

export interface IssueStatus {
  id: number;
  name: string;
  is_closed: boolean;
}

export interface TimeActivity {
  id: number;
  name: string;
  is_default?: boolean;
}

export interface TargetVersion {
  id: number;
  name: string;
  due_date: string | null;
}

export interface TrackerNode {
  id: number;
  project_id: number;
  subject: string;
  description?: string;
  tracker: string;
  status: string | null;
  status_id: number | null;
  is_closed: boolean;
  done_ratio: number | null;
  priority: string | null;
  assigned_to: string | null;
  assigned_to_id: number | null;
  parent_id: number | null;
  estimated_hours: number | null;
  spent_hours: number | null;
  start_date: string | null;
  due_date: string | null;
  created_on: string | null;
  updated_on: string | null;
  is_mine: boolean;
  is_pinned?: boolean;
  acceptance_criteria?: string;
  steps_for_implementation?: string;
}

export interface TimeEntryRecord {
  id: number;
  local_id?: string | null;
  issue_id: number | null;
  issue_subject: string;
  project_name: string;
  hours: number;
  activity_id: number | null;
  activity: string;
  comments: string;
  spent_on: string;
  pending_sync?: boolean;
}

export interface AuditDay {
  date: string;
  is_today: boolean;
  logged_hours: number;
  target_hours: number;
  missing_hours: number;
  entries_count: number;
  status: 'complete' | 'partial' | 'missing';
}

export interface SyncHistoryItem {
  id?: number;
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
  pending_sync?: boolean;
}

export interface PrChangedFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
}

export interface PrDiscussionItem {
  id: number;
  body: string;
  user?: { login?: string; type?: string };
  created_at?: string;
  submitted_at?: string;
  html_url?: string;
  path?: string;
  line?: number;
  original_line?: number;
  diff_hunk?: string;
  position?: number | null;
  state?: string;
}

export interface PullRequestPayload {
  number: number;
  title: string;
  body: string;
  url: string;
  branch: string;
  author: string;
  state: string;
  merged: boolean;
  created_at: string;
  repo: string;
  issue_comments: PrDiscussionItem[];
  review_comments: PrDiscussionItem[];
  reviews: PrDiscussionItem[];
  changed_files: PrChangedFile[];
  discussion_count: number;
  already_added: {
    issue_id: number;
    issue_url: string;
    created_at: string;
  } | null;
}

export interface GeneratedTaskFields {
  subject: string;
  description: string;
  acceptance_criteria: string;
  steps_for_implementation: string;
  priority: 'High' | 'Medium' | 'Low';
  estimated_hours: number | null;
  issue_label: string;
  parent_issue_id?: number | null;
  _via?: 'gemini' | 'groq' | 'template';
  _fallback?: boolean;
  _fallback_reason?: string;
}

export interface CalendarEvent {
  id: string;
  date_str: string;
  title: string;
  description: string;
  location: string;
  start: string;
  end: string;
  all_day: boolean;
  hours: number | null;
  organizer: string | null;
}

export interface EodSheetTab {
  gid: string;
  title: string;
}

export interface EodSheetRow {
  row: number;
  cells: string[];
  pending_sync?: boolean;
}

export interface EodSheetData {
  spreadsheetTitle: string;
  tabs: EodSheetTab[];
  tab: EodSheetTab;
  width: number;
  rows: EodSheetRow[];
}

export interface ActivityFeedItem {
  id: number;
  issue_id: number;
  subject: string;
  tracker: string;
  change_type: 'added' | 'removed' | 'changed';
  field: string | null;
  from_val: string | null;
  to_val: string | null;
  occurred_at: string;
}

export type SyncOpType =
  | 'UPDATE_ISSUE_STATUS'
  | 'LOG_TIME'
  | 'CREATE_ISSUE'
  | 'CREATE_QUICK_TASK'
  | 'SHEETS_UPDATE_CELL'
  | 'SHEETS_APPEND_ROW'
  | 'SHEETS_DELETE_ROW';

export interface SyncQueueItem {
  id: number;
  op_type: SyncOpType;
  payload_json: string;
  local_ref: string | null;
  status: 'pending' | 'syncing' | 'failed';
  attempts: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface ActivityLogLine {
  t: string;
  message: string;
  isError?: boolean;
}

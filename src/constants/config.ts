export const DEFAULT_REDMINE_URL = 'https://tracker.tekdi.net';
export const DEFAULT_SERVER_URL = 'http://localhost:3333';
export const DEFAULT_PROJECT_ID = 1482;
export const DEFAULT_TRACKER_ID = 2;
export const DEFAULT_VERSION_ID = 5094;
export const DEFAULT_PINNED_ISSUE_IDS = [258191];

export const DAILY_TARGET_HOURS = 8;
export const AUDIT_LOOKBACK_DAYS = 30;
export const DAILY_BRIEF_LOOKBACK_DAYS = 1;
export const MAX_REDMINE_SUBJECT_CHARS = 255;
export const MAX_SUBJECT_DISPLAY_CHARS = 90;
export const MAX_REDMINE_TIME_COMMENT_CHARS = 1024;
export const MAX_AI_CONTEXT_CHARS = 50000;
export const STANDUP_INPUT_LIMIT = 1500;
export const STANDUP_MAX_TOKENS = 800;

export const AI_TIMEOUT_MS = 45000;
export const HTTP_TIMEOUT_MS = 30000;
export const MODEL_COOLDOWN_MS = 10 * 60 * 1000;
export const TRACKER_POLL_INTERVAL_MS = 60000;
export const FOREGROUND_SYNC_MIN_GAP_MS = 30000;
export const INITIAL_DISPLAY_LIMIT = 25;
export const SPLASH_MIN_DURATION_MS = 950;
export const PR_ROUND_WINDOW_MS = 30 * 60 * 1000;
export const MAX_SYNC_QUEUE_ATTEMPTS = 5;
export const MAX_ACTIVITY_FEED_ITEMS = 60;
export const GITHUB_PAGE_SIZE = 100;
export const GITHUB_MAX_PAGES = 3;
export const REDMINE_PAGE_SIZE = 100;
export const REDMINE_ID_BATCH_SIZE = 50;

export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';
export const FALLBACK_GEMINI_MODELS = ['gemini-flash-latest', 'gemini-2.5-flash-lite'] as const;
export const DEFAULT_GROQ_MODEL = 'openai/gpt-oss-120b';

export const CUSTOM_FIELD_IDS = {
  ACCEPTANCE_CRITERIA: 27,
  STEPS_FOR_IMPLEMENTATION: 26,
  ACTUAL_COMPLETION_DATE: 42,
  ISSUE_LABEL: 12,
  ORIGINAL_ASSIGNEE: 22,
} as const;

export const REDMINE_PRIORITY_MAP = {
  High: 5,
  Medium: 19,
  Low: 3,
} as const;

export const REDMINE_PRIORITY_LABELS: Record<number, 'High' | 'Medium' | 'Low'> = {
  5: 'High',
  19: 'Medium',
  3: 'Low',
};

export const REDMINE_STATUS_IDS = {
  OPEN: 1,
  IN_PROGRESS: 2,
  RESOLVED: 3,
} as const;

export const ISSUE_LABELS = ['Planned', 'Unplanned', 'Bug Fix', 'Technical Debt'] as const;

export const QUICK_TASK_PRESETS = [
  {
    label: 'Daily Standup',
    text: 'Daily team standup sync covering progress, today plan, and blockers',
    hours: '0.5',
  },
  {
    label: 'PR Code Review',
    text: 'Reviewed teammate pull requests and left inline feedback',
    hours: '1',
  },
  {
    label: 'Client Sync',
    text: 'Client demo and requirement discussion call',
    hours: '1',
  },
  {
    label: 'Sprint Planning',
    text: 'Sprint planning, backlog grooming, and task estimation with the team',
    hours: '1.5',
  },
] as const;

export const LOG_TIME_HOUR_CHIPS = [0.5, 1, 2, 4, 8] as const;

export const DB_NAME = 'devpilot_offline.db';
export const DB_SCHEMA_VERSION = 1;

export const SECURE_KEYS = {
  REDMINE_URL: 'dp_redmine_url',
  REDMINE_API_KEY: 'dp_redmine_api_key',
  GITHUB_TOKEN: 'dp_github_token',
  GEMINI_API_KEY: 'dp_gemini_api_key',
  GROQ_API_KEY: 'dp_groq_api_key',
  SERVER_URL: 'dp_server_url',
  CONNECTION_MODE: 'dp_connection_mode',
  GOOGLE_CLIENT_ID: 'dp_google_client_id',
  GOOGLE_CLIENT_SECRET: 'dp_google_client_secret',
  EOD_SHEET_ID: 'dp_eod_sheet_id',
} as const;

export const GITHUB_PR_URL_REGEX = /^https:\/\/github\.com\/([^/\s]+)\/([^/\s]+)\/pull\/(\d+)/i;

export const BOARD_CORE_STATUSES = ['New', 'In Progress', 'Code Review', 'Resolved', 'Closed'] as const;

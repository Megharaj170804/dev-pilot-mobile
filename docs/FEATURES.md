# DevPilot Mobile — Feature Guide

Every screen in DevPilot Mobile is backed by local persistence (`devpilot_offline.db` on native / `localStorage` on Web) so previously synced data opens immediately, even in Airplane Mode.

---

## 1. Today — Daily Workspace (`app/(tabs)/index.tsx`)

- **Daily 8h Progress Meter:** Summarizes hours logged today against the `8h` target (`DAILY_TARGET_HOURS`).
- **30-Day Weekday Audit:** Scans weekdays over the last `30` days (`AUDIT_LOOKBACK_DAYS`) for `0h` missing days or partial (`< 8h`) days and lets you jump straight into logging the remaining time.
- **Today's Meetings (Google Calendar):** Lists synced events with parsed durations and Google Meet links, plus a one-click **Log Meeting** action and a **Connect Calendar** flow when OAuth is not yet linked.
- **Standup & EOD Composer:** Drafts Morning Standup or EOD updates directly from your cached Redmine issues and time entries — works offline.

## 2. PR Sync (`app/(tabs)/sync-pr.tsx`)

- Paste any GitHub PR URL to fetch commits, changed files, and PR description (`githubClient.ts`), caching responses in `pr_cache`.
- Use AI (`aiClient.ts` — Gemini with Groq fallback) to generate Redmine Subject, Description, Acceptance Criteria, and Steps for Implementation.
- Create the Redmine issue immediately or queue it in `sync_queue` (`CREATE_ISSUE`) when offline, with full history saved locally in `sync_history`.

## 3. Quick Task & Log Time (`app/(tabs)/quick-task.tsx`)

- Includes preset templates (`QUICK_TASK_PRESETS`: *Daily Standup*, *PR Code Review*, *Client Sync*, *Sprint Planning*) and quick hour chips (`0.5`, `1`, `2`, `4`, `8`).
- Supports AI expansion from short rough notes into structured Redmine tasks + time entries.
- Offline submissions record temporary negative issue IDs and replay cleanly once back online (`CREATE_QUICK_TASK`).

## 4. Work Hierarchy (`app/(tabs)/hierarchy.tsx`)

- Renders your Redmine tree (**Epics -> Features -> Stories -> Tasks -> Bugs**) built via `src/domain/redmineUtils.ts`.
- Epics start collapsed for smooth scrolling; tap to expand child trees, filter/search issues, view custom fields, and change issue status (`UPDATE_ISSUE_STATUS` — optimistic update + outbox queue).
- Records detected remote field changes (`status`, `done_ratio`, `spent_hours`, `subject`, `assigned_to`, etc.) in `activity_feed`.

## 5. EOD Updates (`app/eod-updates.tsx`)

- View Google Sheet EOD tabs (`eod_sheet_tabs`) and rows (`eod_sheet_rows`).
- Edit cells inline (`SHEETS_UPDATE_CELL`), append new EOD rows (`SHEETS_APPEND_ROW`), or remove rows (`SHEETS_DELETE_ROW`), all with offline queuing.
- Includes one-tap **Connect Google Sheets** integration via the DevPilot server.

## 6. PR Review Comments (`app/pr-comments.tsx`)

- Built via `src/domain/prCommentsBuilder.ts` to summarize GitHub PR review discussions into clean Redmine issue notes ready to copy or log.

## 7. KPI Reflection (`app/kpi-comments.tsx`)

- Powered by `src/domain/kpiData.ts` and persisted locally in `kpi_drafts` (`period_key`, `kpi_id`).
- Generate and save periodic KPI reflection drafts with AI even across app restarts.

## 8. Settings, Outbox & About (`app/settings.tsx`, `app/about.tsx`)

- **Connection Mode Switcher:** Toggle between **DevPilot Server Proxy** and **Direct REST APIs**.
- **Google Calendar & Sheets OAuth Card:** Configure Google Client ID, Client Secret, and Redirect URI (`POST /api/google/config`) directly from the app and launch OAuth connection flows.
- **Offline Sync Queue (`sync_queue`):** Inspect pending/failed operations, see retry attempt counts (`MAX_SYNC_QUEUE_ATTEMPTS = 5`), and trigger **Retry All**.
- **Theme Toggle & About Screen:** Switch Dark/Light mode or open `About` for feature & architecture explanations inside the app.

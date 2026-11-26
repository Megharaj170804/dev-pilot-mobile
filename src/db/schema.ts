import * as SQLite from 'expo-sqlite';
import { DB_NAME, DB_SCHEMA_VERSION } from '../constants/config';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;
let txChain: Promise<unknown> = Promise.resolve();

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = initDatabase();
  }
  return dbPromise;
}

export function runInTransaction<T>(fn: (db: SQLite.SQLiteDatabase) => Promise<T>): Promise<T> {
  const execute = async () => {
    const db = await getDb();
    let result!: T;
    await db.withTransactionAsync(async () => {
      result = await fn(db);
    });
    return result;
  };
  const next = txChain.then(execute, execute);
  txChain = next.catch(() => {});
  return next;
}

async function initDatabase(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const currentVersion = row?.user_version ?? 0;

  if (currentVersion < DB_SCHEMA_VERSION) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS meta (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS projects (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          issue_count INTEGER NOT NULL DEFAULT 0,
          is_default INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS project_members (
          project_id INTEGER NOT NULL,
          user_id INTEGER NOT NULL,
          name TEXT NOT NULL,
          PRIMARY KEY (project_id, user_id)
        );

        CREATE TABLE IF NOT EXISTS issue_statuses (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          is_closed INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS time_activities (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          is_default INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS target_versions (
          id INTEGER PRIMARY KEY,
          project_id INTEGER NOT NULL,
          name TEXT NOT NULL,
          due_date TEXT
        );

        CREATE TABLE IF NOT EXISTS issues (
          id INTEGER PRIMARY KEY,
          project_id INTEGER NOT NULL,
          subject TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          tracker TEXT NOT NULL,
          status TEXT,
          status_id INTEGER,
          is_closed INTEGER NOT NULL DEFAULT 0,
          done_ratio INTEGER,
          priority TEXT,
          assigned_to TEXT,
          assigned_to_id INTEGER,
          parent_id INTEGER,
          estimated_hours REAL,
          spent_hours REAL,
          start_date TEXT,
          due_date TEXT,
          created_on TEXT,
          updated_on TEXT,
          is_mine INTEGER NOT NULL DEFAULT 0,
          is_pinned INTEGER NOT NULL DEFAULT 0,
          acceptance_criteria TEXT NOT NULL DEFAULT '',
          steps_for_implementation TEXT NOT NULL DEFAULT '',
          synced_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_issues_project ON issues(project_id);
        CREATE INDEX IF NOT EXISTS idx_issues_parent ON issues(parent_id);

        CREATE TABLE IF NOT EXISTS time_entries (
          id INTEGER PRIMARY KEY,
          local_id TEXT,
          issue_id INTEGER,
          issue_subject TEXT NOT NULL DEFAULT '',
          project_name TEXT NOT NULL DEFAULT '',
          hours REAL NOT NULL,
          activity_id INTEGER,
          activity TEXT NOT NULL DEFAULT '',
          comments TEXT NOT NULL DEFAULT '',
          spent_on TEXT NOT NULL,
          pending_sync INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_time_spent_on ON time_entries(spent_on);

        CREATE TABLE IF NOT EXISTS sync_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          pr_url TEXT,
          pr_number INTEGER,
          pr_repo TEXT,
          calendar_event_id TEXT,
          subject TEXT NOT NULL,
          issue_id INTEGER NOT NULL,
          issue_url TEXT NOT NULL,
          created_at TEXT NOT NULL,
          quick_task INTEGER NOT NULL DEFAULT 0,
          hours REAL,
          pending_sync INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS pr_cache (
          pr_url TEXT PRIMARY KEY,
          repo TEXT NOT NULL,
          number INTEGER NOT NULL,
          payload_json TEXT NOT NULL,
          fetched_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS calendar_events (
          id TEXT NOT NULL,
          date_str TEXT NOT NULL,
          title TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          location TEXT NOT NULL DEFAULT '',
          start_iso TEXT NOT NULL,
          end_iso TEXT NOT NULL,
          all_day INTEGER NOT NULL DEFAULT 0,
          hours REAL,
          organizer TEXT,
          fetched_at TEXT NOT NULL,
          PRIMARY KEY (id, date_str)
        );

        CREATE TABLE IF NOT EXISTS eod_sheet_tabs (
          gid TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          spreadsheet_title TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS eod_sheet_rows (
          gid TEXT NOT NULL,
          row_num INTEGER NOT NULL,
          cells_json TEXT NOT NULL,
          pending_sync INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (gid, row_num)
        );

        CREATE TABLE IF NOT EXISTS kpi_drafts (
          period_key TEXT NOT NULL,
          kpi_id TEXT NOT NULL,
          context_line TEXT NOT NULL DEFAULT '',
          generated_text TEXT NOT NULL DEFAULT '',
          updated_at TEXT NOT NULL,
          PRIMARY KEY (period_key, kpi_id)
        );

        CREATE TABLE IF NOT EXISTS activity_feed (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          issue_id INTEGER NOT NULL,
          subject TEXT NOT NULL,
          tracker TEXT NOT NULL,
          change_type TEXT NOT NULL,
          field TEXT,
          from_val TEXT,
          to_val TEXT,
          occurred_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS sync_queue (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          op_type TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          local_ref TEXT,
          status TEXT NOT NULL DEFAULT 'pending',
          attempts INTEGER NOT NULL DEFAULT 0,
          last_error TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);
      await db.execAsync(`PRAGMA user_version = ${DB_SCHEMA_VERSION}`);
    });
  }

  return db;
}

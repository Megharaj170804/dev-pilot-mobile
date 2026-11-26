import { AUDIT_LOOKBACK_DAYS, DAILY_TARGET_HOURS } from '../constants/config';
import type { AuditDay, TimeEntryRecord } from '../types';
import { toDateString } from './redmineUtils';

export function compute30DayAudit(
  entries: TimeEntryRecord[],
  referenceDate: Date = new Date(),
  targetHours = DAILY_TARGET_HOURS,
  lookbackDays = AUDIT_LOOKBACK_DAYS
): AuditDay[] {
  const today = toDateString(referenceDate);
  const byDay = new Map<string, { hours: number; count: number }>();

  for (const te of entries) {
    if (!te.spent_on) continue;
    const cur = byDay.get(te.spent_on) || { hours: 0, count: 0 };
    cur.hours += Number(te.hours) || 0;
    cur.count += 1;
    byDay.set(te.spent_on, cur);
  }

  const days: AuditDay[] = [];
  for (let offset = 0; offset < lookbackDays; offset += 1) {
    const d = new Date(referenceDate);
    d.setDate(d.getDate() - offset);
    const dow = d.getDay();
    if (dow === 0 || dow === 6) continue;
    const dateStr = toDateString(d);
    const rec = byDay.get(dateStr) || { hours: 0, count: 0 };
    const logged = Math.round(rec.hours * 100) / 100;
    const missing = Math.max(0, Math.round((targetHours - logged) * 100) / 100);
    days.push({
      date: dateStr,
      is_today: dateStr === today,
      logged_hours: logged,
      target_hours: targetHours,
      missing_hours: missing,
      entries_count: rec.count,
      status: logged >= targetHours ? 'complete' : logged > 0 ? 'partial' : 'missing',
    });
  }

  return days;
}

export function weekStartOf(date: Date = new Date()): Date {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

export function computeWeeklyTimeSummary(entries: TimeEntryRecord[], referenceDate: Date = new Date()) {
  const today = toDateString(referenceDate);
  const monday = toDateString(weekStartOf(referenceDate));
  const byDay: Record<string, number> = {};
  let weekHours = 0;

  for (const e of entries) {
    if (!e.spent_on || e.spent_on < monday || e.spent_on > today) continue;
    const h = Number(e.hours) || 0;
    byDay[e.spent_on] = Math.round(((byDay[e.spent_on] || 0) + h) * 100) / 100;
    weekHours += h;
  }

  return {
    date: today,
    today_hours: Math.round((byDay[today] || 0) * 100) / 100,
    week_hours: Math.round(weekHours * 100) / 100,
    daily_target: DAILY_TARGET_HOURS,
    by_day: byDay,
  };
}

export function formatPlainStandup({
  mode,
  todayTasks = [],
  completedTasks = [],
  timeEntries = [],
  meetings = [],
  notes = '',
}: {
  mode: 'standup' | 'eod';
  todayTasks?: string[];
  completedTasks?: string[];
  timeEntries?: TimeEntryRecord[];
  meetings?: string[];
  notes?: string;
}): string {
  const lines: string[] = [];
  if (mode === 'eod') {
    lines.push('EOD Update:');
    const done = [
      ...timeEntries.map(t => `${t.issue_subject || `#${t.issue_id}`} (${t.hours}h${t.comments ? ` — ${t.comments}` : ''})`),
      ...completedTasks,
    ];
    lines.push(done.length ? done.map(x => `• ${x}`).join('\n') : '• Continued work on active tasks');
    if (meetings.length) lines.push('\nMeetings:\n' + meetings.map(m => `• ${m}`).join('\n'));
    if (todayTasks.length) lines.push('\nIn Progress / Next:\n' + todayTasks.map(t => `• ${t}`).join('\n'));
  } else {
    lines.push('Yesterday:');
    lines.push(completedTasks.length ? completedTasks.map(x => `• ${x}`).join('\n') : '• Progressed active sprint tasks');
    lines.push('\nToday:');
    lines.push(todayTasks.length ? todayTasks.map(t => `• ${t}`).join('\n') : '• Continuing assigned tasks');
    if (meetings.length) lines.push('\nMeetings:\n' + meetings.map(m => `• ${m}`).join('\n'));
    lines.push('\nBlockers:\n• None');
  }

  if (notes.trim()) lines.push(`\nNotes:\n• ${notes.trim()}`);
  return lines.join('\n');
}

import { DEFAULT_REDMINE_URL } from '../constants/config';

export interface KpiContext {
  start: string;
  end: string;
  project?: string;
  userId?: string;
}

export interface KpiStats {
  userId: number;
  userName: string;
  issues: number;
  tasks: number;
  closed: number;
  closedOnTime: number;
  closedWithDueDate: number;
  tasksWithDescription: number;
  withTargetVersion: number;
  bugs: number;
  hours: number;
  projects: string[];
  activities: Record<string, number>;
  subjects: string[];
  prs: Array<{ url: string; subject: string }>;
}

export interface KpiSubDefinition {
  id: string;
  kpiId?: string;
  kpiName?: string;
  name: string;
  guideline: string;
  notes: string[];
  rating: string;
  example: string;
  links: Array<'spentTime' | 'issuesByProject' | 'currentStatus' | 'tasks' | 'bugs'>;
  evidenceHint?: string;
}

export interface KpiGroup {
  id: string;
  name: string;
  subs: KpiSubDefinition[];
}

const ISSUE_COLUMNS = [
  'tracker', 'subject', 'status', 'assigned_to', 'fixed_version', 'agile_sprint',
  'start_date', 'due_date', 'estimated_hours', 'spent_hours', 'parent',
];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function ymd(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`;
}

export function defaultKpiPeriod(today = new Date()): { start: string; end: string } {
  const y = today.getFullYear();
  const m = today.getMonth() + 1;
  const d = today.getDate();
  const start = d >= 21 ? { y, m } : m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 };
  const end = start.m === 12 ? { y: start.y + 1, m: 1 } : { y: start.y, m: start.m + 1 };
  return { start: ymd(start.y, start.m, 21), end: ymd(end.y, end.m, 20) };
}

function query(pairs: Array<[string, string]>): string {
  return pairs.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
}

function issuesUrl(ctx: KpiContext, extraPairs: Array<[string, string]>, trackerBase = DEFAULT_REDMINE_URL): string {
  const base = ctx.project
    ? `${trackerBase}/projects/${encodeURIComponent(ctx.project)}/issues`
    : `${trackerBase}/issues`;
  return `${base}?${query(extraPairs)}`;
}

function columns(): Array<[string, string]> {
  return ISSUE_COLUMNS.map(c => ['c[]', c]);
}

function assigneeFilter(ctx: KpiContext): Array<[string, string]> {
  return [['f[]', 'assigned_to_id'], ['op[assigned_to_id]', '='], ['v[assigned_to_id][]', ctx.userId || 'me']];
}

function dateFilter(field: string, ctx: KpiContext): Array<[string, string]> {
  return [['f[]', field], [`op[${field}]`, '><'], [`v[${field}][]`, ctx.start], [`v[${field}][]`, ctx.end]];
}

export const KPI_LINKS: Record<
  'spentTime' | 'issuesByProject' | 'currentStatus' | 'tasks' | 'bugs',
  (ctx: KpiContext, trackerBase?: string) => { label: string; url: string }
> = {
  spentTime: (ctx, base = DEFAULT_REDMINE_URL) => ({
    label: 'Spent time by activity',
    url: `${base}/time_entries/report?` + query([
      ['utf8', '✓'], ['set_filter', '1'], ['sort', 'spent_on:desc'],
      ...dateFilter('spent_on', ctx),
      ['f[]', 'user_id'], ['op[user_id]', '='], ['v[user_id][]', ctx.userId || 'me'],
      ['columns', 'month'], ['criteria[]', 'project'], ['criteria[]', 'activity'], ['criteria[]', 'issue'], ['t[]', 'hours'],
    ]),
  }),
  issuesByProject: (ctx, base = DEFAULT_REDMINE_URL) => ({
    label: 'Work completed in given / estimated time',
    url: issuesUrl(ctx, [
      ['utf8', '✓'], ['set_filter', '1'], ['sort', 'start_date,id:desc'],
      ...assigneeFilter(ctx), ...dateFilter('start_date', ctx), ['group_by', 'project'], ...columns(),
      ['t[]', 'estimated_hours'], ['t[]', 'spent_hours'],
    ], base),
  }),
  currentStatus: (ctx, base = DEFAULT_REDMINE_URL) => ({
    label: 'Per Project link of current Status of issues assigned to you',
    url: issuesUrl(ctx, [
      ['utf8', '✓'], ['set_filter', '1'], ['sort', 'start_date,id:desc'],
      ...assigneeFilter(ctx), ...columns(), ['t[]', 'estimated_hours'], ['t[]', 'spent_hours'],
    ], base),
  }),
  tasks: (ctx, base = DEFAULT_REDMINE_URL) => ({
    label: 'Tasks by assignee',
    url: issuesUrl(ctx, [
      ['utf8', '✓'], ['set_filter', '1'], ['sort', 'priority'],
      ...assigneeFilter(ctx), ...dateFilter('start_date', ctx),
      ['f[]', 'tracker_id'], ['op[tracker_id]', '='], ['v[tracker_id][]', '2'],
      ['group_by', 'status'], ...columns(), ['t[]', 'estimated_hours'], ['t[]', 'spent_hours'],
    ], base),
  }),
  bugs: (ctx, base = DEFAULT_REDMINE_URL) => ({
    label: 'Bugs by the original assignee',
    url: issuesUrl(ctx, [
      ['utf8', '✓'], ['set_filter', '1'], ['sort', 'tracker,parent:desc,start_date'],
      ['f[]', 'cf_22'], ['op[cf_22]', '='], ['v[cf_22][]', ctx.userId || 'me'],
      ...dateFilter('created_on', ctx),
      ['f[]', 'tracker_id'], ['op[tracker_id]', '='], ['v[tracker_id][]', '1'],
      ['group_by', 'project'], ...columns(), ['t[]', 'estimated_hours'], ['t[]', 'spent_hours'],
    ], base),
  }),
};

export function dirRating(defects: number, tasks: number): { dir: number; rating: number; percent: number } | null {
  if (!(defects >= 0) || !(tasks > 0)) return null;
  const dir = defects / tasks;
  const rating = dir >= 5 ? 0 : dir > 2 ? 1 : dir > 1 ? 2 : dir === 1 ? 3 : 4;
  return { dir, rating, percent: rating * 25 };
}

export function standardsRating(followed: number, total: number): { ratio: number; percent: number } | null {
  if (!(followed >= 0) || !(total > 0) || followed > total) return null;
  return { ratio: followed / total, percent: Math.round((followed / total) * 10000) / 100 };
}

const fmt = (n: number) => String(Math.round(n * 100) / 100);

export const KPIS: KpiGroup[] = [
  {
    id: '1',
    name: 'Technical and Delivery Excellence',
    subs: [
      {
        id: '1.1',
        name: "Follow Tekdi's OR any well known coding standards / guidelines",
        guideline: "Follow Tekdi's OR any well known coding standards/guidelines for all languages / technologies / frameworks team use as suggested by Project's Tech Lead.",
        notes: ['(Total no. of coding standards followed in project) VS (Total no. of languages / technologies / frameworks used in project).'],
        rating: 'Standards followed ÷ technologies used × 100 (out of 100).',
        example: 'Yes following all, Technologies/Frameworks Used (Frontend): TypeScript / JavaScript (ESLint & Prettier), React (Hooks & component architecture).',
        links: [],
        evidenceHint: 'Link to your standards / rules (e.g. repo .agents/rules folder).',
      },
      {
        id: '1.2',
        name: 'Make use of AI tools and Productivity tools proactively',
        guideline: 'Make use of AI tools (for coding, documentation, testing or for any other purposes) and Productivity tools (such as linter, formatter or for any other purposes) proactively.',
        notes: ['TQA Rating can be used for productivity tools usage.'],
        rating: 'Depends on which suggested tools were used.',
        example: '1. AI Tools: Claude Code & Gemini for pair programming.\n2. Coding & Productivity Tools: ESLint, Prettier, Vitest, Husky pre-commit hooks.',
        links: [],
      },
      {
        id: '1.3',
        name: 'Work completed in given / estimated time',
        guideline: 'Work completed in given / estimated time (Plan Target date Vs Actual end date variance to be negligible for the given tasks).',
        notes: ['Subjective to PM/TL/KPI reviewer.'],
        rating: 'Subjective to PM/TL/KPI reviewer — auto-populated from Redmine.',
        example: 'Spent time by activity <link 1>\nWork completed in given / estimated time <link 2>',
        links: ['spentTime', 'issuesByProject'],
      },
    ],
  },
  {
    id: '2',
    name: 'Operational Excellence',
    subs: [
      {
        id: '2.1',
        name: 'Keep all issues in PMS tracker / Jira updated with assignee, target version and status',
        guideline: 'Keep all issues in PMS tracker / Jira updated with assignee, target version and status.',
        notes: ['Subjective to PM/TL/KPI reviewer based on data from tracker usage for given month.'],
        rating: 'Auto-populated from Redmine issue hygiene stats.',
        example: 'Per Project link of current Status of issues assigned to you <link>',
        links: ['currentStatus'],
      },
      {
        id: '2.2',
        name: 'Write user story, steps of implementation and acceptance criteria for all tasks / stories',
        guideline: 'Write user story, steps of implementation and acceptance criteria for all tasks / stories in PMS tracker / Jira.',
        notes: ['Subjective to PM/TL/KPI reviewer based on data from tracker usage for given month.'],
        rating: 'Auto-populated from Redmine task descriptions.',
        example: 'All tasks have been updated with user stories. <link>',
        links: ['tasks'],
      },
    ],
  },
  {
    id: '3',
    name: 'Quality Excellence',
    subs: [
      {
        id: '3.1',
        name: 'Ensure to have code unit tested to have low defect Injection rate (DIR)',
        guideline: 'DIR = (Number of defects introduced / Total number of issues worked on). It should be under < 1.',
        notes: ['If DIR >= 5 -> 0 (0%); >2 and <5 -> 1 (25%); >1 and <=2 -> 2 (50%); =1 -> 3 (75%); <1 -> 4 (100%).'],
        rating: 'DIR -> rating 0-4 -> OKR % (0/25/50/75/100). Auto-calculated.',
        example: '(DIR 0.14 = 5 bugs / 35 tasks)',
        links: ['tasks', 'bugs'],
      },
      {
        id: '3.2',
        name: 'Ensure to have no obvious performance issues in code / queries written as per set metric',
        guideline: 'Ensure to have no obvious performance issues in code / queries written as per set metric.',
        notes: ['As per metric set for given project by TL (e.g. Lighthouse > 75%, API < 1s).'],
        rating: 'Subjective / per project metric set by TL.',
        example: 'Optimization Implementations:\n- Route-Level Code Splitting\n- Client-side Caching\n- Table virtualization',
        links: [],
      },
    ],
  },
  {
    id: '4',
    name: 'Customer Satisfaction / Internal Communications',
    subs: [
      {
        id: '4.1',
        name: 'Replies to client emails / chats as per support SLA (OR / AND) Representing team during client calls / demos',
        guideline: 'Replies to client emails / chats as per support SLA (OR / AND) Representing team during client calls / demos.',
        notes: ['Subjective to PM/TL/KPI reviewer.'],
        rating: 'Subjective to PM/TL/KPI reviewer.',
        example: 'Represented the team in weekly client calls and replied within SLA.',
        links: [],
      },
      {
        id: '4.2',
        name: 'Following communication standards',
        guideline: "Following communication standards — on time attendance of a meeting, status reporting, immediate supervisor's whereabouts, following hybrid culture set by the team.",
        notes: ['Subjective to PM/TL/KPI reviewer.'],
        rating: 'Subjective to PM/TL/KPI reviewer.',
        example: 'Attended meetings on time, posted daily status updates.',
        links: [],
      },
    ],
  },
  {
    id: '5',
    name: 'Learning & Development',
    subs: [
      {
        id: '5.1',
        name: 'Contribution to project / Tekdi level common code',
        guideline: 'Contribution to project / Tekdi level common code, courses, blogs, trainings, or external course completion.',
        notes: ['1 or more contributions -> rating 10 out of 10; 0 -> rating 0.'],
        rating: '>= 1 contribution -> 10 / 10; none -> 0 / 10.',
        example: 'Shared AI skills and review rules with project team members.',
        links: [],
      },
    ],
  },
];

export const KPI_SUBS: KpiSubDefinition[] = KPIS.flatMap(k =>
  k.subs.map(s => ({ ...s, kpiId: k.id, kpiName: k.name }))
);

export const KPI_CONTEXT_HINTS: Record<string, string> = {
  '1.1': 'Technologies/frameworks and the standards you followed',
  '1.2': 'AI and productivity tools you used and for what',
  '3.2': 'Performance optimizations you did (and results, if measured)',
  '4.1': 'Client calls / replies / demos you handled',
  '4.2': 'How you followed communication standards',
  '5.1': 'Learning / training / contribution you made',
};

export function kpiNeedsContext(id: string): boolean {
  return Boolean(KPI_CONTEXT_HINTS[id]);
}

export function entryLinks(
  sub: KpiSubDefinition,
  ctx: KpiContext,
  stats: KpiStats | null,
  trackerBase = DEFAULT_REDMINE_URL
): Array<{ label: string; url: string }> {
  const prs =
    sub.id === '1.3' && stats
      ? (stats.prs || []).map(p => ({ label: `PR: ${p.subject || p.url}`, url: p.url }))
      : [];
  return sub.links.map(k => KPI_LINKS[k](ctx, trackerBase)).concat(prs);
}

export function linksText(links: Array<{ label: string; url: string }>): string {
  return links.map(l => `${l.label}\n${l.url}`).join('\n\n');
}

export function factsForKpi(stats: KpiStats | null): string {
  if (!stats) return '';
  return (
    `${stats.issues} issues (${stats.tasks} tasks) in period, ${stats.closed} closed, ${stats.hours} hours logged` +
    (stats.subjects?.length ? `; task titles: ${stats.subjects.slice(0, 6).join(' | ')}` : '')
  );
}

export function buildTrackerKpiEntry(
  sub: KpiSubDefinition,
  ctx: KpiContext,
  stats: KpiStats | null,
  trackerBase = DEFAULT_REDMINE_URL
): { comment: string; linksText: string; notes: string; rating: string } | null {
  if (!stats) return null;
  const lt = linksText(entryLinks(sub, ctx, stats, trackerBase));
  const period = sub.links.length ? `Tracker period: ${ctx.start} to ${ctx.end}` : '';

  switch (sub.id) {
    case '1.3': {
      const parts = [`Worked on ${stats.issues} issue(s) in this period (${stats.tasks} tasks); ${stats.closed} closed`];
      if (stats.closedWithDueDate) {
        parts.push(`${stats.closedOnTime} of ${stats.closedWithDueDate} closed issues with a due date were closed on or before it`);
      }
      parts.push(`${stats.hours} hours logged`);
      const acts = Object.entries(stats.activities || {}).map(([n, h]) => `${n} ${h}h`).join(', ');
      const comment = parts.join('; ') + '.' + (acts ? ` Time by activity: ${acts}.` : '');
      return { comment, linksText: lt, notes: period, rating: '' };
    }
    case '2.1':
      return {
        comment: `${stats.withTargetVersion} of ${stats.issues} issues assigned to me have a target version set; all carry assignee and status in the tracker.`,
        linksText: lt,
        notes: period,
        rating: '',
      };
    case '2.2':
      if (!stats.tasks) return null;
      return {
        comment: `${stats.tasksWithDescription} of ${stats.tasks} tasks have a description (user story / implementation steps / acceptance criteria) in the tracker.`,
        linksText: lt,
        notes: period,
        rating: '',
      };
    case '3.1': {
      if (!stats.tasks) return null;
      const r = dirRating(stats.bugs, stats.tasks);
      if (!r) return null;
      return {
        comment: `DIR ${fmt(r.dir)} = ${stats.bugs} bugs / ${stats.tasks} tasks`,
        linksText: lt,
        notes: period,
        rating: `DIR ${fmt(r.dir)}, so rating ${r.rating} and OKR % is ${r.percent}%`,
      };
    }
    default:
      return null;
  }
}

export function formatCompleteKpiText(
  sub: KpiSubDefinition,
  entry: { comment: string; linksText: string; notes: string; rating: string }
): string {
  const out = [`${sub.id} ${sub.name}`, '', entry.comment.trim()];
  const lt = entry.linksText.trim();
  const nt = entry.notes.trim();
  const rt = entry.rating.trim();
  if (lt) out.push('', 'Tracker Links:', lt);
  if (nt) out.push('', 'Notes / Evidence:', nt);
  if (rt) out.push('', `Rating: ${rt}`);
  return out.join('\n');
}

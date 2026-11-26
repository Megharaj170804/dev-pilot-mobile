import {
  MAX_REDMINE_SUBJECT_CHARS,
  MAX_REDMINE_TIME_COMMENT_CHARS,
  MAX_SUBJECT_DISPLAY_CHARS,
  REDMINE_STATUS_IDS,
} from '../constants/config';
import type { GeneratedTaskFields } from '../types';

const SYMBOL_REPLACEMENTS = new Map<string, string>([
  ['→', '->'],
  ['←', '<-'],
  ['↔', '<->'],
  ['⇒', '=>'],
  ['⇐', '<='],
  ['↑', '^'],
  ['↓', 'v'],
  ['≤', '<='],
  ['≥', '>='],
  ['≠', '!='],
  ['≈', '~'],
  ['×', 'x'],
  ['✅', '[x]'],
  ['✔', '[x]'],
  ['☑', '[x]'],
  ['❌', '[ ]'],
  ['✖', '[ ]'],
  ['✗', '[ ]'],
  ['⚠', '[!]'],
  ['“', '"'],
  ['”', '"'],
  ['‘', "'"],
  ['’', "'"],
  ['…', '...'],
  ['•', '-'],
  ['◦', '-'],
  ['▪', '-'],
  ['—', '--'],
  ['–', '-'],
  ['\u00A0', ' '],
]);

const SYMBOL_PATTERN = new RegExp(
  `[${[...SYMBOL_REPLACEMENTS.keys()].map(k => k.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')).join('')}]`,
  'g'
);

export function sanitizeRedmineText(
  value: unknown,
  { singleLine = false, maxLength = 0 }: { singleLine?: boolean; maxLength?: number } = {}
): string {
  if (value === null || value === undefined) return '';

  let cleaned = String(value)
    .replace(/\r\n?/g, '\n')
    .replace(SYMBOL_PATTERN, ch => SYMBOL_REPLACEMENTS.get(ch) ?? '')
    .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]|[\uD800-\uDFFF]/g, '')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060\uFE0E\uFE0F\uFEFF\uFFFD]/g, '')
    .replace(/[\u2600-\u27BF\u2B00-\u2BFF]/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');

  if (singleLine) {
    cleaned = cleaned.replace(/[\t\n]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  } else {
    cleaned = cleaned.replace(/[^\S\n]{2,}/g, ' ').replace(/[ \t]+\n/g, '\n').trim();
  }

  if (maxLength > 0 && cleaned.length > maxLength) {
    cleaned = cleaned.slice(0, maxLength).trim();
  }

  return cleaned;
}

export function sanitizeIssueFields(fields: {
  subject?: string;
  description?: string;
  acceptance_criteria?: string;
  steps_for_implementation?: string;
  issue_label?: string;
}) {
  return {
    subject: sanitizeRedmineText(fields.subject, { singleLine: true, maxLength: MAX_REDMINE_SUBJECT_CHARS }),
    description: sanitizeRedmineText(fields.description),
    acceptance_criteria: sanitizeRedmineText(fields.acceptance_criteria),
    steps_for_implementation: sanitizeRedmineText(fields.steps_for_implementation),
    issue_label: sanitizeRedmineText(fields.issue_label, { singleLine: true }),
  };
}

export function sanitizeTimeComment(comment: unknown): string {
  return sanitizeRedmineText(comment, { maxLength: MAX_REDMINE_TIME_COMMENT_CHARS });
}

export function toDateString(date: Date | string | number): string {
  const value = new Date(date);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function buildIssueDates(referenceDate: Date = new Date()) {
  const base = new Date(referenceDate);
  const startDate = new Date(base);
  startDate.setDate(base.getDate() - 1);

  const dueDate = new Date(base);
  dueDate.setDate(base.getDate() + 2);

  return {
    start_date: toDateString(startDate),
    due_date: toDateString(dueDate),
    actual_completion_date: toDateString(base),
  };
}

export function statusIdForPr(pr: { state?: string | null; merged?: boolean | null }): number {
  if (pr.merged) return REDMINE_STATUS_IDS.RESOLVED;
  if (pr.state === 'open') return REDMINE_STATUS_IDS.IN_PROGRESS;
  return REDMINE_STATUS_IDS.OPEN;
}

export function statusLabelForPr(pr: { state?: string | null; merged?: boolean | null }): string {
  if (pr.merged) return 'Resolved';
  if (pr.state === 'open') return 'In Progress';
  return 'Open';
}

export function normalizePrUrl(url: string): string {
  return String(url || '').trim().replace(/\/+$/, '').toLowerCase();
}

export function withRedmineHeader(text: string, rule: string): string {
  const body = String(text || '').trim();
  if (!body || body.includes('@Assignee to update this section')) return body;
  return `@Assignee to update this section:\nAssignee to mark completed criteria as [x] = done eg.\n- [x]\n\n${rule}\n\n${body}`;
}

export function buildPrTemplate(title: string, body = ''): GeneratedTaskFields {
  const bodySummary = body.trim().replace(/\s+/g, ' ').slice(0, 300);
  const cleanSubject = title
    .replace(/^(feat|fix|chore|refactor|docs|test|style|perf|ci|build|revert)(\([^)]*\))?:\s*/i, '')
    .replace(/^(WIP|wip|Draft|DRAFT):?\s*/i, '')
    .replace(/\b\w/g, c => c.toUpperCase())
    .slice(0, MAX_SUBJECT_DISPLAY_CHARS);

  return {
    subject: cleanSubject || 'Implement Changes from Pull Request',
    description: bodySummary
      ? `This task implements the following change: ${title}. ${bodySummary}`
      : `This task implements the following change: ${title}. Review the affected components, apply the necessary code changes, write or update tests to cover the modified logic, and verify the full user flow works as expected before merging.`,
    acceptance_criteria: `*Functional Requirements*
# [ ] ${title} works correctly end-to-end across all affected flows
# [ ] All existing functionality continues to work without regression
# [ ] Edge cases and boundary conditions are handled gracefully
# [ ] Input validation is enforced where user or external data is accepted

*Error Handling & Edge Cases*
# [ ] Network failures and timeout scenarios are handled without crashing
# [ ] Empty states, null values, and missing data are handled safely
# [ ] Meaningful error messages are shown and logged for debugging

*Testing & Quality Assurance*
# [ ] Unit tests written for all new or modified functions and components
# [ ] Manual testing confirms the feature works cleanly across viewports
# [ ] All existing automated tests pass with zero regressions`,
    steps_for_implementation: `@Assignee to update this section:
Assignee to mark completed criteria as [x] = done eg.
- [x]

---

*1. Analysis & Environment Setup*
- [ ] Understand the full scope of changes required and identify all affected modules
- [ ] Verify local development environment is up to date

*2. Implementation*
- [ ] Implement the required changes across affected modules and components
- [ ] Add input validation, error handling, and boundary checks

*3. Testing & Quality Assurance*
- [ ] Write unit and integration tests for the primary use case and edge cases
- [ ] Run the full automated test suite and ensure zero regressions`,
    priority: 'Medium',
    estimated_hours: 8,
    issue_label: 'Planned',
    _via: 'template',
    _fallback: true,
  };
}

export function buildQuickTaskTemplate(context: string, hours?: number | null): GeneratedTaskFields {
  const clean = context.trim().replace(/\s+/g, ' ');
  const subject = clean.slice(0, MAX_SUBJECT_DISPLAY_CHARS) || 'Quick Task';
  const est = hours && hours > 0 ? hours : 1;
  return {
    subject: subject.charAt(0).toUpperCase() + subject.slice(1),
    description: clean || 'Completed ad-hoc team work and documented key outcomes.',
    acceptance_criteria: withRedmineHeader(
      `*Work Completion*\n# [ ] ${clean || 'Task work completed and verified'}\n# [ ] Stakeholders or team updated on outcomes\n\n*Testing & Quality Assurance*\n# [ ] Follow-up action items captured and tracked`,
      '----'
    ),
    steps_for_implementation: withRedmineHeader(
      `*1. Execution*\n- [ ] Completed work: ${clean || 'Ad-hoc task'}\n- [ ] Reviewed outcomes and recorded notes`,
      '---'
    ),
    priority: 'Medium',
    estimated_hours: est,
    issue_label: 'Planned',
    parent_issue_id: null,
    _via: 'template',
    _fallback: true,
  };
}

export interface TextileBlock {
  type: 'heading' | 'checkbox' | 'bullet' | 'hr' | 'paragraph';
  text: string;
  checked?: boolean;
  ordered?: boolean;
  index?: number;
}

export function parseTextileBlocks(text: string): TextileBlock[] {
  if (!text?.trim()) return [];
  const lines = text.split('\n');
  const blocks: TextileBlock[] = [];
  let orderedIdx = 0;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      orderedIdx = 0;
      continue;
    }
    if (/^-{3,}$/.test(line)) {
      orderedIdx = 0;
      blocks.push({ type: 'hr', text: '' });
      continue;
    }
    const olCb = line.match(/^#\s+\[( |x)\]\s*(.*)/i);
    if (olCb) {
      orderedIdx += 1;
      blocks.push({
        type: 'checkbox',
        ordered: true,
        index: orderedIdx,
        checked: olCb[1].toLowerCase() === 'x',
        text: olCb[2],
      });
      continue;
    }
    const ulCb = line.match(/^-\s+\[( |x)\]\s*(.*)/i);
    if (ulCb) {
      orderedIdx = 0;
      blocks.push({
        type: 'checkbox',
        ordered: false,
        checked: ulCb[1].toLowerCase() === 'x',
        text: ulCb[2],
      });
      continue;
    }
    const ulPlain = line.match(/^-\s+(.*)/);
    if (ulPlain) {
      orderedIdx = 0;
      blocks.push({ type: 'bullet', ordered: false, text: ulPlain[1] });
      continue;
    }
    const olPlain = line.match(/^#\s+(.*)/);
    if (olPlain) {
      orderedIdx += 1;
      blocks.push({ type: 'bullet', ordered: true, index: orderedIdx, text: olPlain[1] });
      continue;
    }
    orderedIdx = 0;
    const heading = line.match(/^\*([^*]+)\*$/);
    if (heading) {
      blocks.push({ type: 'heading', text: heading[1] });
      continue;
    }
    blocks.push({ type: 'paragraph', text: line.replace(/\*([^*\n]+)\*/g, '$1') });
  }

  return blocks;
}

import { PR_ROUND_WINDOW_MS } from '../constants/config';
import type { PullRequestPayload } from '../types';

export type AgentTarget = 'claude' | 'antigravity' | 'any';

export interface NormalisedPrComment {
  id: string;
  kind: 'conversation' | 'inline' | 'review';
  author: string;
  bot: boolean;
  body: string;
  at: string;
  url: string;
  path?: string;
  line?: number | null;
  hunk?: string;
  outdated?: boolean;
  state?: string;
}

const AGENT_RULES_TARGET: Record<AgentTarget, string> = {
  claude: 'CLAUDE.md',
  antigravity: 'AGENTS.md, or a file under .agent/rules/',
  any: 'AGENTS.md or CLAUDE.md',
};

function isBotUser(u?: { login?: string; type?: string }): boolean {
  return Boolean(u && (u.type === 'Bot' || /\[bot\]$/i.test(u.login || '')));
}

export function normalisePrComments(pr: PullRequestPayload): NormalisedPrComment[] {
  const out: NormalisedPrComment[] = [];

  for (const c of pr.issue_comments || []) {
    const body = (c.body || '').trim();
    if (!body) continue;
    out.push({
      id: `c${c.id}`,
      kind: 'conversation',
      author: c.user?.login || 'unknown',
      bot: isBotUser(c.user),
      body,
      at: c.created_at || '',
      url: c.html_url || pr.url,
    });
  }

  for (const c of pr.review_comments || []) {
    const body = (c.body || '').trim();
    if (!body) continue;
    out.push({
      id: `r${c.id}`,
      kind: 'inline',
      author: c.user?.login || 'unknown',
      bot: isBotUser(c.user),
      body,
      at: c.created_at || '',
      url: c.html_url || pr.url,
      path: c.path,
      line: c.line || c.original_line || null,
      hunk: c.diff_hunk || '',
      outdated: c.position == null,
    });
  }

  for (const r of pr.reviews || []) {
    const body = (r.body || '').trim();
    if (!body) continue;
    out.push({
      id: `v${r.id}`,
      kind: 'review',
      author: r.user?.login || 'unknown',
      bot: isBotUser(r.user),
      body,
      at: r.submitted_at || r.created_at || '',
      url: r.html_url || pr.url,
      state: r.state,
    });
  }

  return out.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

export function computeLatestRoundIds(comments: NormalisedPrComment[], prAuthor: string): Set<string> {
  const pool = comments.filter(c => c.author !== prAuthor);
  const base = pool.length ? pool : comments;
  if (!base.length) return new Set();
  const newest = new Date(base[0].at).getTime();
  return new Set(base.filter(c => newest - new Date(c.at).getTime() <= PR_ROUND_WINDOW_MS).map(c => c.id));
}

function whereLabel(c: NormalisedPrComment): string {
  if (c.kind === 'inline') return `Inline · \`${c.path || ''}${c.line ? `:${c.line}` : ''}\``;
  if (c.kind === 'review') return `Review${c.state ? ` · ${c.state.toLowerCase().replace('_', ' ')}` : ''}`;
  return 'Conversation';
}

function quoteLines(text: string): string {
  return text.split('\n').map(line => `> ${line}`).join('\n');
}

export function buildAgentFixPrompt({
  pr,
  picked,
  agent,
  includeRules,
  includeContext,
}: {
  pr: PullRequestPayload | null;
  picked: NormalisedPrComment[];
  agent: AgentTarget;
  includeRules: boolean;
  includeContext: boolean;
}): string {
  if (!pr || !picked.length) return '';

  const rulesFile = AGENT_RULES_TARGET[agent];
  const n = picked.length;
  const lines: string[] = [
    `# Task: resolve every review comment on PR #${pr.number}`,
    '',
    `You are working in the local checkout of \`${pr.repo}\`, on branch \`${pr.branch}\`, for pull request #${pr.number} "${pr.title}" (${pr.url}).`,
    '',
    `Reviewers left ${n} comment${n !== 1 ? 's' : ''}, listed below. Your goal is to leave this branch in a state where a fresh review would raise none of them again. Work from the checklist at the bottom of this section and do not stop, summarise or ask for confirmation until every item is closed.`,
    '',
    '## How to work',
    '1. **Split every comment into separate findings.** Give each finding its own line in your checklist and handle all of them.',
    '2. **Status lists are not a to-do list.** Verify [FIXED] items match the code; fix every [PARTIALLY FIXED], [NOT FIXED], [OPEN], and new finding.',
    '3. **Verify, then fix.** Open the file and line named, confirm the issue exists, then change the code cleanly.',
    '4. **Fix the pattern, not only the line.** Search touched files for sibling occurrences.',
    '5. **Stay in scope.** Do not replace a fix with a TODO or lint-disable.',
    '6. **Cover behaviour with tests.** Add or update tests for logic, types, or error handling.',
    '',
    '## Before you finish (all required)',
    "- Run the project's type check, linter and test suite. Fix everything that fails.",
    '- Re-read every comment against the final code. Each finding must end as: `fixed` (with file:line), `already fixed` (with file:line), or `not changed` (with a concrete reason).',
    '- Finish only when the list has no open items.',
  ];

  if (includeRules) {
    lines.push(
      '',
      '## Stop these comments coming back',
      `Once every finding is closed, turn any recurring or general pattern into a concise imperative rule in ${rulesFile} under a "Review rules" heading, without duplicating existing rules.`
    );
  }

  lines.push('', `## Checklist (${n} comment${n !== 1 ? 's' : ''}, newest first)`);
  picked.forEach((c, i) => {
    lines.push(`- [ ] ${i + 1}. ${whereLabel(c)} · ${c.author}${c.bot ? ' (bot)' : ''}`);
  });

  lines.push('', '## Review comments');
  picked.forEach((c, i) => {
    const stamp = c.at ? new Date(c.at).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : '';
    lines.push('', `### ${i + 1}. ${whereLabel(c)} · ${c.author}${c.bot ? ' (bot)' : ''}${stamp ? ` · ${stamp}` : ''}`);
    lines.push(quoteLines(c.body));
    if (includeContext && c.kind === 'inline' && c.hunk) {
      lines.push('', 'Code context:', '````diff', c.hunk, '````');
    }
  });

  lines.push(
    '',
    '## Final report',
    'Reply with a table: `#` · finding · status (`fixed` / `already fixed` / `not changed`) · file:line or reason.' +
      (includeRules
        ? ' Then list the rules you added, and the output of the type check, linter and tests.'
        : ' Then show the output of the type check, linter and tests.')
  );

  return lines.join('\n');
}

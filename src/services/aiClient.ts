import {
  AI_TIMEOUT_MS,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GROQ_MODEL,
  FALLBACK_GEMINI_MODELS,
  MAX_AI_CONTEXT_CHARS,
  MODEL_COOLDOWN_MS,
  STANDUP_INPUT_LIMIT,
  STANDUP_MAX_TOKENS,
} from '../constants/config';
import {
  buildPrTemplate,
  buildQuickTaskTemplate,
  sanitizeIssueFields,
  sanitizeRedmineText,
  sanitizeTimeComment,
  withRedmineHeader,
} from '../domain/redmineUtils';
import { formatPlainStandup } from '../domain/standupFormatter';
import type {
  AppConfig,
  GeneratedTaskFields,
  PrDiscussionItem,
  PullRequestPayload,
  TimeEntryRecord,
  TrackerNode,
} from '../types';

const modelCooldown = new Map<string, number>();

function usableGeminiModels(): string[] {
  const all = [DEFAULT_GEMINI_MODEL, ...FALLBACK_GEMINI_MODELS];
  const ok = all.filter(m => (modelCooldown.get(m) || 0) < Date.now());
  return ok.length ? ok : all;
}

async function callGeminiText(apiKey: string, prompt: string, maxTokens = 1500, jsonMode = false): Promise<string> {
  const models = usableGeminiModels();
  let lastError: Error | null = null;

  for (const model of models) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
    try {
      const generationConfig: Record<string, unknown> = {
        temperature: jsonMode ? 0.2 : 0.4,
        maxOutputTokens: maxTokens,
      };
      if (jsonMode) {
        generationConfig.responseMimeType = 'application/json';
      } else {
        generationConfig.thinkingConfig = { thinkingBudget: 0 };
      }

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig }),
        }
      );

      if (res.ok) {
        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (text) return text;
        lastError = new Error('Gemini returned empty response');
      } else {
        if (res.status === 429) modelCooldown.set(model, Date.now() + MODEL_COOLDOWN_MS);
        lastError = new Error(`Gemini API error (${res.status})`);
      }
    } catch (err) {
      modelCooldown.set(model, Date.now() + MODEL_COOLDOWN_MS);
      lastError = err instanceof Error ? err : new Error('Gemini request failed');
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError || new Error('Gemini generation failed');
}

async function callGroqText(apiKey: string, systemPrompt: string, userPrompt: string, maxTokens = 2000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: DEFAULT_GROQ_MODEL,
        max_tokens: maxTokens,
        temperature: 0.3,
        messages: [
          ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
          { role: 'user', content: userPrompt },
        ],
      }),
    });
    if (!res.ok) throw new Error(`Groq API error (${res.status})`);
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error('Groq returned empty response');
    return text;
  } finally {
    clearTimeout(timer);
  }
}

function formatDiscussion(items: PrDiscussionItem[], label: string): string[] {
  return items
    .map(item => {
      const body = sanitizeRedmineText(String(item.body || '').replace(/<!--[\s\S]*?-->/g, ''));
      if (!body) return '';
      const author = item.user?.login || 'unknown';
      const where = item.path ? ` on ${item.path}${item.line ? `:${item.line}` : ''}` : '';
      return `[${label} by @${author}${where}]\n${body}`;
    })
    .filter(Boolean);
}

function buildPrContext(pr: PullRequestPayload): string {
  const sections = [
    `PR TITLE\n${pr.title || '(no title)'}`,
    `PR DESCRIPTION\n${sanitizeRedmineText(pr.body) || '(no description)'}`,
  ];
  if (pr.changed_files?.length) {
    sections.push(
      `CHANGED FILES\n${pr.changed_files.map(f => `- ${f.filename} (${f.status}, +${f.additions}/-${f.deletions})`).join('\n')}`
    );
  }
  const discussion = [
    ...formatDiscussion(pr.issue_comments || [], 'PR conversation comment'),
    ...formatDiscussion(pr.review_comments || [], 'Inline review comment'),
    ...formatDiscussion(pr.reviews || [], 'Pull request review'),
  ];
  if (discussion.length) sections.push(`REVIEW DISCUSSION\n${discussion.join('\n\n---\n\n')}`);
  return sections.join('\n\n==========\n\n').slice(0, MAX_AI_CONTEXT_CHARS);
}

function parseJsonObject<T>(raw: string): T {
  const cleaned = raw.replace(/^```json?\s*/i, '').replace(/```\s*$/i, '').trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('AI response did not contain valid JSON');
  return JSON.parse(match[0]) as T;
}

export const AiClient = {
  async generatePrFields(cfg: AppConfig, pr: PullRequestPayload, online: boolean): Promise<GeneratedTaskFields> {
    if (!online || (!cfg.geminiApiKey && !cfg.groqApiKey && cfg.mode !== 'server')) {
      return {
        ...buildPrTemplate(pr.title, pr.body),
        _fallback_reason: online ? 'No AI API key configured — smart template applied.' : 'Offline mode — smart template applied.',
      };
    }

    if (cfg.mode === 'server') {
      try {
        const res = await fetch(`${cfg.serverUrl}/api/generate-fields`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(pr),
        });
        if (res.ok) return (await res.json()) as GeneratedTaskFields;
      } catch {
        // fall back below
      }
    }

    const prompt = `Generate Redmine task fields JSON from this GitHub PR in ${pr.repo}.
Keys required: subject (<=90 chars, action verb, no git prefix), description (4-6 plain sentences), acceptance_criteria (Redmine textile with *Section* and # [ ] items ending in *Testing & Quality Assurance*), steps_for_implementation (Redmine textile with *1. Phase* and - [ ] items), priority ("High"|"Medium"|"Low"), estimated_hours (1-40), issue_label ("Planned").
<pull_request_context>\n${buildPrContext(pr)}\n</pull_request_context>`;

    try {
      let raw: string;
      let via: 'gemini' | 'groq' = 'gemini';
      if (cfg.geminiApiKey) {
        try {
          raw = await callGeminiText(cfg.geminiApiKey, prompt, 5000, true);
        } catch {
          if (!cfg.groqApiKey) throw new Error('Gemini failed');
          via = 'groq';
          raw = await callGroqText(cfg.groqApiKey, 'Output ONLY a raw JSON object.', prompt, 5000);
        }
      } else {
        via = 'groq';
        raw = await callGroqText(cfg.groqApiKey, 'Output ONLY a raw JSON object.', prompt, 5000);
      }
      const parsed = parseJsonObject<GeneratedTaskFields>(raw);
      const safe = sanitizeIssueFields(parsed);
      return {
        ...parsed,
        ...safe,
        priority: ['High', 'Medium', 'Low'].includes(parsed.priority) ? parsed.priority : 'Medium',
        estimated_hours: Number(parsed.estimated_hours) > 0 ? Number(parsed.estimated_hours) : 8,
        issue_label: safe.issue_label || 'Planned',
        _via: via,
      };
    } catch {
      return {
        ...buildPrTemplate(pr.title, pr.body),
        _fallback_reason: 'AI providers unavailable — smart template applied.',
      };
    }
  },

  async generateQuickTaskFields(
    cfg: AppConfig,
    { context, hours, features }: { context: string; hours?: number | null; features: TrackerNode[] },
    online: boolean
  ): Promise<GeneratedTaskFields> {
    if (online && cfg.mode === 'server') {
      try {
        const res = await fetch(`${cfg.serverUrl}/api/generate-quick-task`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            context,
            hours: hours || null,
            features: features.map(f => ({ id: f.id, subject: f.subject })),
          }),
        });
        if (res.ok) return (await res.json()) as GeneratedTaskFields;
      } catch {
        // fall through to direct/template
      }
    }
    if (!online || (!cfg.geminiApiKey && !cfg.groqApiKey)) {
      return buildQuickTaskTemplate(context, hours);
    }

    const prompt = `Draft a Redmine Task JSON from this short work summary (NOT a PR): "${context}"
${hours ? `Estimated effort: ${hours}h.` : ''}
Return ONLY JSON with: subject (<=90 chars), description (3-4 first-person past-tense plain sentences), acceptance_criteria (Redmine textile), steps_for_implementation (Redmine textile), priority ("High"|"Medium"|"Low"), estimated_hours (number), parent_issue_id (matching one Feature ID below or null).
${features.length ? 'Features:\n' + features.slice(0, 120).map(f => `${f.id}: ${f.subject}`).join('\n') : ''}`;

    try {
      let raw: string;
      let via: 'gemini' | 'groq' = 'gemini';
      if (cfg.geminiApiKey) {
        try {
          raw = await callGeminiText(cfg.geminiApiKey, prompt, 3000, true);
        } catch {
          if (!cfg.groqApiKey) throw new Error('Gemini failed');
          via = 'groq';
          raw = await callGroqText(cfg.groqApiKey, 'Output ONLY a raw JSON object.', prompt, 3000);
        }
      } else {
        via = 'groq';
        raw = await callGroqText(cfg.groqApiKey, 'Output ONLY a raw JSON object.', prompt, 3000);
      }
      const parsed = parseJsonObject<GeneratedTaskFields & { parent_issue_id?: number | null }>(raw);
      const safe = sanitizeIssueFields({
        subject: parsed.subject || context,
        description: parsed.description || context,
        acceptance_criteria: withRedmineHeader(parsed.acceptance_criteria || '', '----'),
        steps_for_implementation: withRedmineHeader(parsed.steps_for_implementation || '', '---'),
        issue_label: 'Planned',
      });
      return {
        ...safe,
        priority: ['High', 'Medium', 'Low'].includes(parsed.priority) ? parsed.priority : 'Medium',
        estimated_hours: Number(parsed.estimated_hours) > 0 ? Number(parsed.estimated_hours) : hours || 1,
        parent_issue_id: features.some(f => f.id === Number(parsed.parent_issue_id))
          ? Number(parsed.parent_issue_id)
          : null,
        _via: via,
      };
    } catch {
      return buildQuickTaskTemplate(context, hours);
    }
  },

  async generateTimeComment(
    cfg: AppConfig,
    params: { subject: string; tracker: string; status: string | null; activity: string; hours: string; context?: string },
    online: boolean
  ): Promise<string> {
    const fallback = sanitizeTimeComment(
      params.context?.trim() || `${params.activity || 'Worked'} on ${params.subject}`
    );
    if (online && cfg.mode === 'server') {
      try {
        const res = await fetch(`${cfg.serverUrl}/api/generate-time-comment`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.comment) return String(data.comment);
        }
      } catch {
        // fall through
      }
    }
    if (!online || (!cfg.geminiApiKey && !cfg.groqApiKey)) return fallback;

    const prompt = `Write ONE concise past-tense Redmine work-log comment (1-2 plain sentences, no markdown).
Issue: "${params.subject}" (${params.tracker}, ${params.status || 'open'})
Activity: ${params.activity || 'Development'} | Hours: ${params.hours || '1'}
${params.context ? `Notes: "${params.context.slice(0, 600)}"` : ''}
Output ONLY the comment.`;

    try {
      const text = cfg.geminiApiKey
        ? await callGeminiText(cfg.geminiApiKey, prompt, 300, false)
        : await callGroqText(cfg.groqApiKey, '', prompt, 1000);
      return sanitizeTimeComment(text) || fallback;
    } catch {
      return fallback;
    }
  },

  async generateStandup(
    cfg: AppConfig,
    params: {
      mode: 'standup' | 'eod';
      todayTasks: string[];
      completedTasks: string[];
      timeEntries: TimeEntryRecord[];
      meetings: string[];
      notes?: string;
    },
    online: boolean
  ): Promise<string> {
    const plain = formatPlainStandup(params);
    if (online && cfg.mode === 'server') {
      try {
        const res = await fetch(`${cfg.serverUrl}/api/generate-standup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.text) return String(data.text);
        }
      } catch {
        // fall through
      }
    }
    if (!online || (!cfg.geminiApiKey && !cfg.groqApiKey)) return plain;

    const prompt =
      params.mode === 'standup'
        ? `Write a concise Morning Standup with sections "Yesterday:", "Today:", and "Blockers:" using "• " bullets and no markdown bolding.\nCompleted:\n${params.completedTasks.join('\n') || 'none'}\nToday:\n${params.todayTasks.join('\n') || 'none'}\nMeetings:\n${params.meetings.join('\n') || 'none'}\nNotes:\n${(params.notes || '').slice(0, STANDUP_INPUT_LIMIT)}`
        : `Write a crisp EOD summary with sections "Completed Today:", "Meetings:" (only if any), and "Next Up:" using "• " bullets.\nTime logged:\n${params.timeEntries.map(t => `- #${t.issue_id || ''} ${t.issue_subject} (${t.hours}h)${t.comments ? `: ${t.comments}` : ''}`).join('\n') || 'none'}\nActive:\n${params.todayTasks.join('\n') || 'none'}\nMeetings:\n${params.meetings.join('\n') || 'none'}`;

    try {
      const text = cfg.geminiApiKey
        ? await callGeminiText(cfg.geminiApiKey, prompt, STANDUP_MAX_TOKENS, false)
        : await callGroqText(cfg.groqApiKey, '', prompt, STANDUP_MAX_TOKENS);
      return text.trim() || plain;
    } catch {
      return plain;
    }
  },

  async generateKpiNote(
    cfg: AppConfig,
    params: { kpi: string; guideline: string; example: string; context: string; facts: string },
    online: boolean
  ): Promise<string> {
    if (online && cfg.mode === 'server') {
      try {
        const res = await fetch(`${cfg.serverUrl}/api/kpi-note`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.comment) return String(data.comment);
        }
      } catch {
        // fall through
      }
    }
    if (!online || (!cfg.geminiApiKey && !cfg.groqApiKey)) {
      return params.context.trim();
    }

    const prompt = `Write a concise, professional first-person monthly KPI review comment (2-4 sentences, plain text, no markdown).
KPI: ${params.kpi}
Guideline: ${params.guideline}
Style example (do not copy facts): ${params.example}
${params.facts ? `Tracker facts: ${params.facts}` : ''}
Engineer context: "${params.context}"
Use ONLY details from the engineer context and verified facts. Output ONLY the comment.`;

    try {
      const text = cfg.geminiApiKey
        ? await callGeminiText(cfg.geminiApiKey, prompt, 600, false)
        : await callGroqText(cfg.groqApiKey, '', prompt, 1200);
      return text.trim() || params.context.trim();
    } catch {
      return params.context.trim();
    }
  },
};

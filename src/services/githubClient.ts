import {
  GITHUB_MAX_PAGES,
  GITHUB_PAGE_SIZE,
  GITHUB_PR_URL_REGEX,
  HTTP_TIMEOUT_MS,
} from '../constants/config';
import type { AppConfig, PrChangedFile, PrDiscussionItem, PullRequestPayload } from '../types';
import { HttpApiError } from './redmineClient';

async function fetchGitHubJson<T>(url: string, headers: Record<string, string>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    if (!res.ok) {
      const msg =
        res.status === 404
          ? 'PR not found — verify URL or set GITHUB_TOKEN in Settings for private repos.'
          : `GitHub API error (${res.status})`;
      throw new HttpApiError(msg, res.status, false);
    }
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof HttpApiError) throw err;
    throw new HttpApiError(err instanceof Error ? err.message : 'GitHub network error', 0, true);
  } finally {
    clearTimeout(timer);
  }
}

async function fetchGitHubPages<T>(url: string, headers: Record<string, string>): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; page <= GITHUB_MAX_PAGES; page += 1) {
    const sep = url.includes('?') ? '&' : '?';
    const batch = await fetchGitHubJson<T[]>(
      `${url}${sep}per_page=${GITHUB_PAGE_SIZE}&page=${page}`,
      headers
    );
    out.push(...batch);
    if (batch.length < GITHUB_PAGE_SIZE) break;
  }
  return out;
}

export async function fetchPullRequest(cfg: AppConfig, rawUrl: string): Promise<PullRequestPayload> {
  const match = rawUrl.trim().match(GITHUB_PR_URL_REGEX);
  if (!match) {
    throw new HttpApiError('Expected a valid GitHub PR URL (https://github.com/owner/repo/pull/123).', 400, false);
  }

  if (cfg.mode === 'server') {
    const res = await fetch(`${cfg.serverUrl}/api/fetch-pr?url=${encodeURIComponent(rawUrl.trim())}`);
    const data = await res.json();
    if (!res.ok) throw new HttpApiError(data.error || 'Failed to fetch PR', res.status, false);
    return data as PullRequestPayload;
  }

  const [, owner, repo, numStr] = match;
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'devpilot-mobile',
  };
  if (cfg.githubToken) headers.Authorization = `Bearer ${cfg.githubToken}`;

  const apiBase = `https://api.github.com/repos/${owner}/${repo}`;
  const prMeta = await fetchGitHubJson<{
    number: number;
    title: string;
    body: string | null;
    html_url: string;
    head: { ref: string };
    user: { login: string };
    state: string;
    merged: boolean;
    created_at: string;
  }>(`${apiBase}/pulls/${numStr}`, headers);

  const [issueComments, reviewComments, reviews, files] = await Promise.all([
    fetchGitHubPages<PrDiscussionItem>(`${apiBase}/issues/${numStr}/comments`, headers),
    fetchGitHubPages<PrDiscussionItem>(`${apiBase}/pulls/${numStr}/comments`, headers),
    fetchGitHubPages<PrDiscussionItem>(`${apiBase}/pulls/${numStr}/reviews`, headers),
    fetchGitHubPages<PrChangedFile>(`${apiBase}/pulls/${numStr}/files`, headers),
  ]);

  return {
    number: prMeta.number,
    title: prMeta.title,
    body: prMeta.body || '',
    url: prMeta.html_url,
    branch: prMeta.head.ref,
    author: prMeta.user.login,
    state: prMeta.state,
    merged: Boolean(prMeta.merged),
    created_at: prMeta.created_at,
    repo: `${owner}/${repo}`,
    issue_comments: issueComments,
    review_comments: reviewComments,
    reviews,
    changed_files: files.map(f => ({
      filename: f.filename,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
    })),
    discussion_count:
      issueComments.length + reviewComments.length + reviews.filter(r => Boolean(r.body?.trim())).length,
    already_added: null,
  };
}

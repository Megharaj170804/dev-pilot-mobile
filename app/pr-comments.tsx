import * as Clipboard from "expo-clipboard";
import { AppIcon } from "../src/components/AppIcon";
import { useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Pressable,
  Share,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { ScreenHeader } from "../src/components/ScreenHeader";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Chip,
  FieldInput,
  OfflineBanner,
  ScreenScroll,
  SegmentedControl,
} from "../src/components/ui";
import { INITIAL_DISPLAY_LIMIT } from "../src/constants/config";
import { RADII, SPACING } from "../src/constants/theme";
import { useApp } from "../src/context/AppContext";
import { PrCacheRepo } from "../src/db/repositories";
import {
  AgentTarget,
  NormalisedPrComment,
  buildAgentFixPrompt,
  computeLatestRoundIds,
  normalisePrComments,
} from "../src/domain/prCommentsBuilder";
import { fetchPullRequest } from "../src/services/githubClient";
import type { PullRequestPayload } from "../src/types";

export default function PrCommentsScreen() {
  const params = useLocalSearchParams<{ url?: string }>();
  const { palette, config, isOnline, showToast } = useApp();

  const [prUrl, setPrUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [recentPrs, setRecentPrs] = useState<PullRequestPayload[]>([]);
  const [pr, setPr] = useState<PullRequestPayload | null>(null);
  const [comments, setComments] = useState<NormalisedPrComment[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [latestIds, setLatestIds] = useState<Set<string>>(new Set());
  const [authorFilter, setAuthorFilter] = useState<string | null>(null);
  const [agent, setAgent] = useState<AgentTarget>("claude");
  const [includeRules, setIncludeRules] = useState(true);
  const [includeContext, setIncludeContext] = useState(true);
  const [commentLimit, setCommentLimit] = useState<number>(
    INITIAL_DISPLAY_LIMIT,
  );

  const loadCachedList = useCallback(async () => {
    setRecentPrs(await PrCacheRepo.listRecent(8));
  }, []);

  useEffect(() => {
    loadCachedList();
  }, [loadCachedList]);

  const applyPrData = useCallback((data: PullRequestPayload) => {
    const norm = normalisePrComments(data);
    const latest = computeLatestRoundIds(norm, data.author);
    setPr(data);
    setComments(norm);
    setLatestIds(latest);
    setSelectedIds(new Set(latest));
    setAuthorFilter(null);
  }, []);

  const handleFetch = useCallback(
    async (overrideUrl?: string) => {
      const target = (overrideUrl ?? prUrl).trim();
      if (!target) {
        setErrorMsg("Paste a GitHub PR URL.");
        return;
      }
      if (!config) return;
      setLoading(true);
      setErrorMsg("");
      try {
        if (isOnline) {
          const data = await fetchPullRequest(config, target);
          await PrCacheRepo.save(data);
          applyPrData(data);
          await loadCachedList();
        } else {
          const cached = await PrCacheRepo.get(target);
          if (!cached)
            throw new Error(
              "Offline and PR comments are not cached in SQLite yet.",
            );
          applyPrData(cached);
          showToast("Loaded PR comments from offline SQLite cache");
        }
      } catch (err) {
        setErrorMsg(
          err instanceof Error ? err.message : "Failed to fetch PR comments",
        );
      } finally {
        setLoading(false);
      }
    },
    [prUrl, config, isOnline, applyPrData, loadCachedList, showToast],
  );

  useEffect(() => {
    if (params.url) {
      setPrUrl(params.url);
      handleFetch(params.url);
    }
  }, [params.url]);

  const authors = useMemo(() => {
    const counts = new Map<string, { n: number; bot: boolean }>();
    comments.forEach((c) => {
      const cur = counts.get(c.author) || { n: 0, bot: c.bot };
      cur.n += 1;
      counts.set(c.author, cur);
    });
    return [...counts.entries()].sort((a, b) => b[1].n - a[1].n);
  }, [comments]);

  const visibleComments = useMemo(
    () =>
      comments.filter(
        (c) => authorFilter === null || c.author === authorFilter,
      ),
    [comments, authorFilter],
  );

  const promptText = useMemo(() => {
    const picked = comments.filter((c) => selectedIds.has(c.id));
    return buildAgentFixPrompt({
      pr,
      picked,
      agent,
      includeRules,
      includeContext,
    });
  }, [pr, comments, selectedIds, agent, includeRules, includeContext]);

  const toggleComment = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCopyPrompt = async () => {
    if (!promptText) return;
    await Clipboard.setStringAsync(promptText);
    showToast("Copied agent prompt to clipboard");
  };

  const handleSharePrompt = async () => {
    if (!promptText) return;
    await Share.share({
      message: promptText,
      title: `PR #${pr?.number || ""} Fix Prompt`,
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <ScreenHeader
        title="PR Comments"
        subtitle="Collect review comments & build agent prompt"
        showBack
      />

      <ScreenScroll>
        <OfflineBanner />

        {errorMsg ? (
          <View
            style={[
              styles.errBox,
              {
                backgroundColor: palette.dangerSurface,
                borderColor: palette.danger,
              },
            ]}
          >
            <Text style={{ color: palette.danger, fontSize: 13 }}>
              {errorMsg}
            </Text>
          </View>
        ) : null}

        <Card>
          <CardHeader
            title="Load Pull Request"
            subtitle="Cached automatically in SQLite for offline review"
          />
          <View style={styles.body}>
            <FieldInput
              label="GitHub PR URL"
              value={prUrl}
              onChangeText={setPrUrl}
              placeholder="https://github.com/owner/repo/pull/42"
              autoCapitalize="none"
            />
            <Button
              label={loading ? "Loading…" : "Fetch Comments"}
              loading={loading}
              onPress={() => handleFetch()}
            />
          </View>
        </Card>

        {!pr && recentPrs.length > 0 && (
          <Card>
            <CardHeader title="Cached PRs" subtitle="Available offline" />
            <View style={styles.body}>
              {recentPrs.map((item) => (
                <Pressable
                  key={item.url}
                  onPress={() => {
                    setPrUrl(item.url);
                    applyPrData(item);
                  }}
                  style={[
                    styles.recentRow,
                    {
                      backgroundColor: palette.surface2,
                      borderColor: palette.borderSubtle,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: palette.text,
                      fontWeight: "600",
                      fontSize: 13,
                    }}
                  >
                    {item.title}
                  </Text>
                  <Text style={{ color: palette.textMuted, fontSize: 12 }}>
                    {item.repo} #{item.number} · {item.discussion_count}{" "}
                    comments
                  </Text>
                </Pressable>
              ))}
            </View>
          </Card>
        )}

        {pr && (
          <>
            <Card>
              <CardHeader
                title={`${pr.repo} #${pr.number}`}
                subtitle={`${pr.author} · ${comments.length} comments · ${selectedIds.size} selected`}
                right={
                  <Badge
                    label={pr.merged ? "Merged" : pr.state}
                    tone={pr.merged ? "success" : "primary"}
                  />
                }
              />
              <View style={styles.body}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 8 }}
                >
                  <Chip
                    label={`All (${comments.length})`}
                    active={authorFilter === null}
                    onPress={() => setAuthorFilter(null)}
                  />
                  {authors.map(([author, info]) => (
                    <Chip
                      key={author}
                      label={`${info.bot ? "bot · " : ""}${author} (${info.n})`}
                      active={authorFilter === author}
                      onPress={() => setAuthorFilter(author)}
                    />
                  ))}
                </ScrollView>

                <View style={styles.selActions}>
                  <Button
                    label="Latest round"
                    size="sm"
                    variant="ghost"
                    onPress={() => setSelectedIds(new Set(latestIds))}
                  />
                  <Button
                    label="All"
                    size="sm"
                    variant="ghost"
                    onPress={() =>
                      setSelectedIds(new Set(comments.map((c) => c.id)))
                    }
                  />
                  <Button
                    label="None"
                    size="sm"
                    variant="ghost"
                    onPress={() => setSelectedIds(new Set())}
                  />
                </View>

                {visibleComments.slice(0, commentLimit).map((c) => {
                  const checked = selectedIds.has(c.id);
                  return (
                    <Pressable
                      key={c.id}
                      onPress={() => toggleComment(c.id)}
                      style={[
                        styles.cmtRow,
                        {
                          backgroundColor: checked
                            ? palette.surface2
                            : palette.bgElevated,
                          borderColor: checked
                            ? palette.primary
                            : palette.borderSubtle,
                          opacity: checked ? 1 : 0.6,
                        },
                      ]}
                    >
                      <View style={styles.cmtHead}>
                        <AppIcon
                          name={checked ? "checkbox" : "square-outline"}
                          size={18}
                          color={
                            checked ? palette.primaryInk : palette.textMuted
                          }
                        />
                        <Text
                          style={{
                            color: palette.text,
                            fontWeight: "700",
                            fontSize: 13,
                          }}
                        >
                          {c.author}
                        </Text>
                        {c.bot ? <Badge label="bot" tone="primary" /> : null}
                        {c.outdated ? (
                          <Badge label="outdated" tone="warning" />
                        ) : null}
                      </View>
                      <Text
                        style={{ color: palette.textMuted, fontSize: 11.5 }}
                      >
                        {c.kind === "inline"
                          ? `${c.path}${c.line ? `:${c.line}` : ""}`
                          : c.kind}
                      </Text>
                      <Text
                        style={{ color: palette.text2, fontSize: 12.5 }}
                        numberOfLines={5}
                      >
                        {c.body}
                      </Text>
                    </Pressable>
                  );
                })}
                {visibleComments.length > commentLimit && (
                  <Button
                    label={`Show more comments (${visibleComments.length - commentLimit} remaining)`}
                    variant="ghost"
                    onPress={() =>
                      setCommentLimit((prev) => prev + INITIAL_DISPLAY_LIMIT)
                    }
                  />
                )}
              </View>
            </Card>

            <Card>
              <CardHeader
                title="Agent Fix Prompt"
                subtitle={`${promptText.length} chars · ~${Math.ceil(promptText.length / 4)} tokens`}
              />
              <View style={styles.body}>
                <SegmentedControl
                  value={agent}
                  onChange={setAgent}
                  options={[
                    { value: "claude", label: "Claude Code" },
                    { value: "antigravity", label: "Antigravity" },
                    { value: "any", label: "Any Agent" },
                  ]}
                />

                <View style={styles.switchRow}>
                  <Text style={{ color: palette.text2, flex: 1, fontSize: 13 }}>
                    Add review rules instruction
                  </Text>
                  <Switch
                    value={includeRules}
                    onValueChange={setIncludeRules}
                  />
                </View>
                <View style={styles.switchRow}>
                  <Text style={{ color: palette.text2, flex: 1, fontSize: 13 }}>
                    Include inline diff context
                  </Text>
                  <Switch
                    value={includeContext}
                    onValueChange={setIncludeContext}
                  />
                </View>

                <FieldInput
                  value={promptText}
                  editable={false}
                  multiline
                  style={{ minHeight: 180 }}
                />

                <View style={styles.row2}>
                  <Button
                    label="Share .md"
                    variant="ghost"
                    onPress={handleSharePrompt}
                    disabled={!promptText}
                    style={{ flex: 1 }}
                  />
                  <Button
                    label="Copy Prompt"
                    onPress={handleCopyPrompt}
                    disabled={!promptText}
                    style={{ flex: 1 }}
                  />
                </View>
              </View>
            </Card>
          </>
        )}
      </ScreenScroll>
    </View>
  );
}

const styles = StyleSheet.create({
  errBox: {
    padding: SPACING.md,
    borderRadius: RADII.sm,
    borderWidth: 1,
  },
  body: {
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  recentRow: {
    padding: SPACING.md,
    borderRadius: RADII.sm,
    borderWidth: 1,
    gap: 3,
  },
  selActions: {
    flexDirection: "row",
    gap: SPACING.sm,
  },
  cmtRow: {
    padding: SPACING.md,
    borderRadius: RADII.sm,
    borderWidth: 1,
    gap: 5,
  },
  cmtHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  row2: {
    flexDirection: "row",
    gap: SPACING.sm,
  },
});

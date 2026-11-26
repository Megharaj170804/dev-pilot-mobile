import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { ScreenHeader } from '../src/components/ScreenHeader';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Chip,
  EmptyState,
  FieldInput,
  OfflineBanner,
  ScreenScroll,
} from '../src/components/ui';
import { INITIAL_DISPLAY_LIMIT } from '../src/constants/config';
import { RADII, SPACING } from '../src/constants/theme';
import { useApp } from '../src/context/AppContext';
import { EodSheetRepo, HistoryRepo, TimeEntriesRepo } from '../src/db/repositories';
import {
  columnIndexByPattern,
  dateKeyOfCell,
  detectDateCol,
  monthKeyOfCell,
  nextNoForDate,
  pickCopyColumns,
  toTsv,
  todayLikeFormat,
} from '../src/domain/eodSheetUtils';
import { toDateString } from '../src/domain/redmineUtils';
import { RedmineClient } from '../src/services/redmineClient';
import { SyncEngine } from '../src/services/syncEngine';
import type { EodSheetData, EodSheetRow } from '../src/types';

export default function EodUpdatesScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ task?: string; status?: string; hours?: string }>();
  const { palette, config, isOnline, syncVersion, showToast } = useApp();

  const [sheet, setSheet] = useState<EodSheetData | null>(null);
  const [gid, setGid] = useState<string>('');
  const [monthFilter, setMonthFilter] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [newestFirst, setNewestFirst] = useState(true);
  const [rowLimit, setRowLimit] = useState<number>(INITIAL_DISPLAY_LIMIT);
  const [syncing, setSyncing] = useState(false);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<EodSheetRow | null>(null);
  const [draftCells, setDraftCells] = useState<string[]>([]);

  const loadFromSqlite = useCallback(async (targetGid?: string) => {
    const cached = await EodSheetRepo.getCached(targetGid || gid || undefined);
    if (cached) {
      setSheet(cached);
      if (!gid) setGid(cached.tab.gid);
    }
  }, [gid]);

  const syncFromServer = useCallback(
    async (targetGid?: string) => {
      if (!isOnline || !config || !config.serverUrl) return;
      setSyncing(true);
      try {
        const fresh = await RedmineClient.fetchSheetsData(config, targetGid || gid || undefined);
        await EodSheetRepo.saveSheetData(fresh);
        setSheet(fresh);
        setGid(fresh.tab.gid);
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Sheets sync failed');
      } finally {
        setSyncing(false);
      }
    },
    [isOnline, config, gid, showToast]
  );

  useEffect(() => {
    loadFromSqlite().then(() => syncFromServer());
  }, [syncVersion]);

  const header = useMemo(() => sheet?.rows[0]?.cells || [], [sheet]);
  const dateCol = useMemo(() => (sheet ? detectDateCol(sheet.rows) : -1), [sheet]);
  const statusCol = useMemo(() => columnIndexByPattern(header, /status/i), [header]);
  const typeCol = useMemo(() => columnIndexByPattern(header, /^\s*type\s*$/i), [header]);
  const noCol = useMemo(() => columnIndexByPattern(header, /^\s*no\.?\s*$/i), [header]);
  const estCol = useMemo(() => columnIndexByPattern(header, /estimat/i), [header]);
  const taskCol = useMemo(() => columnIndexByPattern(header, /task|desc/i), [header]);

  useEffect(() => {
    if (params.task && sheet && header.length) {
      const prefillDate = todayLikeFormat(sheet.rows, dateCol);
      const nextCells = header.map((_, i) => {
        if (i === dateCol) return prefillDate;
        if (i === noCol) return nextNoForDate(sheet.rows, dateCol, noCol, prefillDate);
        if (i === taskCol) return params.task || '';
        if (i === statusCol) return params.status || '';
        if (i === estCol) return params.hours || '';
        return '';
      });
      setEditingRow(null);
      setDraftCells(nextCells);
      setEditorOpen(true);
    }
  }, [params.task, sheet, header, dateCol, noCol, taskCol, statusCol, estCol]);

  const monthOptions = useMemo(() => {
    if (!sheet || dateCol < 0) return [];
    const set = new Set<string>();
    sheet.rows.slice(1).forEach(r => {
      const m = monthKeyOfCell(r.cells[dateCol] || '');
      if (m) set.add(m);
    });
    return [...set].sort().reverse();
  }, [sheet, dateCol]);

  const visibleRows = useMemo(() => {
    if (!sheet) return [];
    let body = sheet.rows.slice(1).filter(r => r.cells.some(c => String(c).trim()));
    if (dateCol >= 0 && monthFilter !== 'all') {
      body = body.filter(r => {
        const m = monthKeyOfCell(r.cells[dateCol] || '');
        return m === null || m === monthFilter;
      });
    }
    const q = query.trim().toLowerCase();
    if (q) body = body.filter(r => r.cells.some(c => String(c).toLowerCase().includes(q)));
    return newestFirst ? body.slice().reverse() : body;
  }, [sheet, dateCol, monthFilter, query, newestFirst]);

  const openAddModal = (prefill?: { task?: string; status?: string; hours?: string; source?: EodSheetRow }) => {
    if (!sheet) return;
    const prefillDate = todayLikeFormat(sheet.rows, dateCol);
    const cells = header.map((_, i) => {
      if (prefill?.source) {
        if (i === dateCol) return prefillDate;
        if (i === noCol) return nextNoForDate(sheet.rows, dateCol, noCol, prefillDate);
        if (i === taskCol) return '';
        return prefill.source.cells[i] || '';
      }
      if (i === dateCol) return prefillDate;
      if (i === noCol) return nextNoForDate(sheet.rows, dateCol, noCol, prefillDate);
      if (i === taskCol && prefill?.task) return prefill.task;
      if (i === statusCol && prefill?.status) return prefill.status;
      if (i === estCol && prefill?.hours) return prefill.hours;
      return '';
    });
    setEditingRow(null);
    setDraftCells(cells);
    setEditorOpen(true);
  };

  const handleSaveRow = async () => {
    if (!sheet) return;
    if (editingRow) {
      for (let col = 0; col < header.length; col += 1) {
        if ((editingRow.cells[col] ?? '') !== (draftCells[col] ?? '')) {
          await SyncEngine.mutateSheetCell(sheet.tab.gid, editingRow.row, col, draftCells[col] ?? '', isOnline);
        }
      }
      showToast(isOnline ? 'Row updated' : 'Row edits queued offline');
    } else {
      await SyncEngine.appendSheetRow(sheet.tab.gid, draftCells, isOnline);
      showToast(isOnline ? 'Row added to EOD sheet' : 'New row queued offline');
    }
    setEditorOpen(false);
    await loadFromSqlite(sheet.tab.gid);
  };

  const handleDeleteRow = (rowNum: number) => {
    if (!sheet) return;
    Alert.alert('Delete Row', `Delete row ${rowNum} from ${sheet.tab.title}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await SyncEngine.deleteSheetRow(sheet.tab.gid, rowNum, isOnline);
          showToast(isOnline ? 'Row deleted' : 'Delete queued offline');
          await loadFromSqlite(sheet.tab.gid);
        },
      },
    ]);
  };

  const handleCopyDay = async (dateValue: string) => {
    if (!sheet || dateCol < 0) return;
    const want = dateKeyOfCell(dateValue);
    const matching = sheet.rows
      .slice(1)
      .filter(r => dateKeyOfCell(r.cells[dateCol] || '') === want)
      .map(r => r.cells);
    const picked = pickCopyColumns(header, matching);
    await Clipboard.setStringAsync(toTsv([picked.header, ...picked.rows]));
    showToast(`Copied ${matching.length} row(s) for ${dateValue}`);
  };

  const handleCopyTable = async () => {
    if (!sheet) return;
    const picked = pickCopyColumns(header, visibleRows.map(r => r.cells));
    await Clipboard.setStringAsync(toTsv([picked.header, ...picked.rows]));
    showToast(`Copied ${visibleRows.length} visible row(s)`);
  };

  const handleImportToday = async () => {
    const today = toDateString(new Date());
    const [entries, hist] = await Promise.all([
      TimeEntriesRepo.getRange(today, today),
      HistoryRepo.list(10),
    ]);
    const firstEntry = entries[0];
    const firstPr = hist.find(h => (h.created_at || '').slice(0, 10) === today);
    if (firstEntry) {
      openAddModal({
        task: `#${firstEntry.issue_id || ''} ${firstEntry.issue_subject}${firstEntry.comments ? ` — ${firstEntry.comments}` : ''}`,
        status: 'Done',
        hours: String(firstEntry.hours),
      });
    } else if (firstPr) {
      openAddModal({ task: `#${firstPr.issue_id} ${firstPr.subject}`, status: 'In Progress', hours: String(firstPr.hours || '') });
    } else {
      showToast('No Redmine entries logged today yet');
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <ScreenHeader title="EOD Updates" subtitle={sheet?.spreadsheetTitle || 'Offline Google Sheet cache'} showBack />

      <ScreenScroll>
        <OfflineBanner />

        {!sheet ? (
          <Card>
            <EmptyState
              title="No cached EOD Sheet"
              message={
                config?.serverUrl
                  ? 'Login to Google Sheets or tap Sync Sheet to pull your EOD table into SQLite.'
                  : 'Set your DevPilot Server URL in Settings first.'
              }
              actionLabel={config?.serverUrl ? (syncing ? 'Syncing…' : 'Sync Sheet') : 'Open Settings'}
              onAction={config?.serverUrl ? () => syncFromServer() : () => router.push('/settings')}
            />
            {config?.serverUrl ? (
              <View style={[styles.body, { paddingTop: 0 }]}>
                <Button
                  label="Login Google Sheets"
                  variant="ghost"
                  onPress={() =>
                    Linking.openURL(
                      RedmineClient.getSheetsConnectUrl(
                        config,
                        Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.href : undefined
                      )
                    )
                  }
                />
              </View>
            ) : null}
          </Card>
        ) : (
          <>
            <Card>
              <View style={styles.body}>
                {sheet.tabs.length > 1 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                    {sheet.tabs.map(t => (
                      <Chip
                        key={t.gid}
                        label={t.title}
                        active={t.gid === sheet.tab.gid}
                        onPress={() => {
                          setGid(t.gid);
                          loadFromSqlite(t.gid);
                          syncFromServer(t.gid);
                        }}
                      />
                    ))}
                  </ScrollView>
                )}

                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  <Chip label="All months" active={monthFilter === 'all'} onPress={() => setMonthFilter('all')} />
                  {monthOptions.map(m => (
                    <Chip key={m} label={m} active={monthFilter === m} onPress={() => setMonthFilter(m)} />
                  ))}
                </ScrollView>

                <FieldInput value={query} onChangeText={setQuery} placeholder="Search EOD rows…" />

                <View style={styles.switchRow}>
                  <Text style={{ color: palette.text2, fontSize: 13 }}>Newest first ({visibleRows.length} rows)</Text>
                  <Switch value={newestFirst} onValueChange={setNewestFirst} />
                </View>

                <View style={styles.rowGap}>
                  <Button label="+ Add Row" size="sm" onPress={() => openAddModal()} style={{ flex: 1 }} />
                  <Button label="Pull Today" size="sm" variant="ghost" onPress={handleImportToday} style={{ flex: 1 }} />
                  <Button label="Copy Table" size="sm" variant="ghost" onPress={handleCopyTable} style={{ flex: 1 }} />
                </View>
              </View>
            </Card>

            {visibleRows.slice(0, rowLimit).map(r => (
              <Card key={r.row}>
                <View style={styles.rowCard}>
                  <View style={styles.rowTop}>
                    <Text style={{ color: palette.textSubtle, fontSize: 11.5 }}>Row {r.row}</Text>
                    {dateCol >= 0 && r.cells[dateCol] ? <Badge label={r.cells[dateCol]} tone="primary" /> : null}
                    {statusCol >= 0 && r.cells[statusCol] ? <Badge label={r.cells[statusCol]} tone="success" /> : null}
                    {r.pending_sync ? <Badge label="Queued" tone="warning" /> : null}
                  </View>

                  {header.map((colName, idx) => {
                    const val = r.cells[idx];
                    if (!val) return null;
                    return (
                      <Text key={idx} style={{ color: idx === taskCol ? palette.text : palette.text2, fontSize: 13 }}>
                        <Text style={{ color: palette.textMuted, fontWeight: '600' }}>{colName}: </Text>
                        {val}
                      </Text>
                    );
                  })}

                  <View style={styles.rowActions}>
                    <Button
                      label="Edit"
                      size="sm"
                      variant="ghost"
                      onPress={() => {
                        setEditingRow(r);
                        setDraftCells([...r.cells]);
                        setEditorOpen(true);
                      }}
                    />
                    <Button label="Dup" size="sm" variant="ghost" onPress={() => openAddModal({ source: r })} />
                    {dateCol >= 0 && r.cells[dateCol] ? (
                      <Button label="Copy Day" size="sm" variant="ghost" onPress={() => handleCopyDay(r.cells[dateCol])} />
                    ) : null}
                    <Button label="Del" size="sm" variant="danger" onPress={() => handleDeleteRow(r.row)} />
                  </View>
                </View>
              </Card>
            ))}
            {visibleRows.length > rowLimit && (
              <Button
                label={`Show more (${visibleRows.length - rowLimit} remaining)`}
                variant="ghost"
                onPress={() => setRowLimit(prev => prev + INITIAL_DISPLAY_LIMIT)}
              />
            )}
          </>
        )}
      </ScreenScroll>

      <Modal visible={editorOpen} transparent animationType="slide" onRequestClose={() => setEditorOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setEditorOpen(false)}>
          <Pressable style={[styles.sheet, { backgroundColor: palette.panel, borderColor: palette.borderStrong }]}>
            <View style={[styles.sheetHead, { borderBottomColor: palette.borderSubtle }]}>
              <Text style={{ color: palette.text, fontSize: 16, fontWeight: '700' }}>
                {editingRow ? `Edit Row ${editingRow.row}` : 'Add EOD Row'}
              </Text>
              <Button label="Close" size="sm" variant="ghost" onPress={() => setEditorOpen(false)} />
            </View>
            <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
              {header.map((colName, i) => (
                <FieldInput
                  key={i}
                  label={colName}
                  value={draftCells[i] || ''}
                  multiline={i === taskCol || i === typeCol}
                  onChangeText={val => {
                    const next = [...draftCells];
                    next[i] = val;
                    setDraftCells(next);
                  }}
                />
              ))}
              <Button label={isOnline ? 'Save to Sheet' : 'Queue Offline'} variant="success" onPress={handleSaveRow} />
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowGap: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  rowCard: {
    padding: SPACING.lg,
    gap: 8,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  rowActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: RADII.xl,
    borderTopRightRadius: RADII.xl,
    borderWidth: 1,
    maxHeight: '88%',
  },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.lg,
    borderBottomWidth: 1,
  },
});

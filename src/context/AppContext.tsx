import NetInfo from '@react-native-community/netinfo';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, InteractionManager } from 'react-native';
import {
  FOREGROUND_SYNC_MIN_GAP_MS,
  SPLASH_MIN_DURATION_MS,
  TRACKER_POLL_INTERVAL_MS,
} from '../constants/config';
import { DARK_PALETTE, LIGHT_PALETTE, ThemeMode, ThemePalette } from '../constants/theme';
import { MetaRepo, SyncQueueRepo } from '../db/repositories';
import { getDb } from '../db/schema';
import { loadAppConfig } from '../services/configService';
import { SyncEngine, subscribeSyncUpdates } from '../services/syncEngine';
import type { AppConfig } from '../types';

const TOAST_DURATION_MS = 2800;

interface AppContextValue {
  dbReady: boolean;
  isOnline: boolean;
  isSyncing: boolean;
  pendingQueueCount: number;
  lastSyncedAt: string | null;
  config: AppConfig | null;
  themeMode: ThemeMode;
  palette: ThemePalette;
  syncVersion: number;
  commandPaletteOpen: boolean;
  toastText: string | null;
  setCommandPaletteOpen: (open: boolean) => void;
  toggleTheme: () => Promise<void>;
  reloadConfig: () => Promise<void>;
  syncNow: (projectId?: number) => Promise<void>;
  flushOutbox: () => Promise<void>;
  showToast: (text: string) => void;
}

interface ThemeContextValue {
  themeMode: ThemeMode;
  palette: ThemePalette;
  toggleTheme: () => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);
const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [dbReady, setDbReady] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingQueueCount, setPendingQueueCount] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [themeMode, setThemeMode] = useState<ThemeMode>('dark');
  const [syncVersion, setSyncVersion] = useState(0);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [toastText, setToastText] = useState<string | null>(null);

  const wasOnlineRef = useRef(true);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastBgSyncRef = useRef(0);

  const showToast = useCallback((text: string) => {
    setToastText(text);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastText(null), TOAST_DURATION_MS);
  }, []);

  const refreshQueueMeta = useCallback(async () => {
    const [count, synced] = await Promise.all([
      SyncQueueRepo.pendingCount(),
      MetaRepo.get('last_synced_at'),
    ]);
    setPendingQueueCount(count);
    setLastSyncedAt(synced);
    setSyncVersion(v => v + 1);
  }, []);

  const reloadConfig = useCallback(async () => {
    const cfg = await loadAppConfig();
    setConfig(cfg);
  }, []);

  const flushOutbox = useCallback(async () => {
    if (!isOnline) {
      showToast('Offline — queued items will sync when back online');
      return;
    }
    setIsSyncing(true);
    try {
      const res = await SyncEngine.flushQueue();
      await refreshQueueMeta();
      if (res.processed > 0) {
        showToast(`Synced ${res.processed} queued change${res.processed === 1 ? '' : 's'}`);
      } else if (res.failed > 0) {
        showToast(`${res.failed} queued item(s) need attention`);
      }
    } finally {
      setIsSyncing(false);
    }
  }, [isOnline, refreshQueueMeta, showToast]);

  const syncNow = useCallback(
    async (projectId?: number) => {
      if (!isOnline) {
        showToast('Offline — showing cached SQLite data');
        return;
      }
      setIsSyncing(true);
      try {
        await SyncEngine.flushQueue();
        const res = await SyncEngine.syncAll(projectId, true);
        await refreshQueueMeta();
        if (res.changesCount > 0) {
          showToast(`Synced · ${res.changesCount} change${res.changesCount === 1 ? '' : 's'} detected`);
        }
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Sync failed');
      } finally {
        setIsSyncing(false);
      }
    },
    [isOnline, refreshQueueMeta, showToast]
  );

  useEffect(() => {
    let mounted = true;
    const minSplash = new Promise<void>(resolve => setTimeout(resolve, SPLASH_MIN_DURATION_MS));
    (async () => {
      try {
        await getDb();
        const [cfg, savedTheme] = await Promise.all([loadAppConfig(), MetaRepo.get('theme')]);
        if (!mounted) return;
        setConfig(cfg);
        if (savedTheme === 'light' || savedTheme === 'dark') setThemeMode(savedTheme);
        await refreshQueueMeta();
        await minSplash;
        if (cfg.redmineApiKey || cfg.mode === 'server') {
          InteractionManager.runAfterInteractions(() => {
            lastBgSyncRef.current = Date.now();
            SyncEngine.flushQueue()
              .then(() => SyncEngine.syncAll())
              .catch(() => {});
          });
        }
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Local storage initialization error');
      } finally {
        if (mounted) setDbReady(true);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [refreshQueueMeta, showToast]);

  useEffect(() => {
    const unsub = subscribeSyncUpdates(() => {
      refreshQueueMeta().catch(() => {});
    });
    return unsub;
  }, [refreshQueueMeta]);

  useEffect(() => {
    const unsub = NetInfo.addEventListener(state => {
      const connected = Boolean(state.isConnected && state.isInternetReachable !== false);
      setIsOnline(connected);
      if (connected && !wasOnlineRef.current && dbReady) {
        SyncEngine.flushQueue()
          .then(res => {
            if (res.processed > 0) showToast(`Back online — synced ${res.processed} queued item(s)`);
            return SyncEngine.syncAll();
          })
          .then(() => refreshQueueMeta())
          .catch(() => {});
      }
      wasOnlineRef.current = connected;
    });
    return () => unsub();
  }, [dbReady, refreshQueueMeta, showToast]);

  useEffect(() => {
    if (!dbReady || !isOnline) return;
    const poll = () => {
      const now = Date.now();
      if (now - lastBgSyncRef.current < FOREGROUND_SYNC_MIN_GAP_MS) return;
      if (AppState.currentState === 'active' && (config?.redmineApiKey || config?.mode === 'server')) {
        lastBgSyncRef.current = now;
        InteractionManager.runAfterInteractions(() => {
          SyncEngine.flushQueue()
            .then(() => SyncEngine.syncAll())
            .catch(() => {});
        });
      }
    };
    const timer = setInterval(poll, TRACKER_POLL_INTERVAL_MS);
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') poll();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [dbReady, isOnline, config]);

  const toggleTheme = useCallback(async () => {
    const next: ThemeMode = themeMode === 'dark' ? 'light' : 'dark';
    setThemeMode(next);
    await MetaRepo.set('theme', next);
  }, [themeMode]);

  const palette = useMemo(() => (themeMode === 'light' ? LIGHT_PALETTE : DARK_PALETTE), [themeMode]);

  const themeValue = useMemo<ThemeContextValue>(
    () => ({
      themeMode,
      palette,
      toggleTheme,
    }),
    [themeMode, palette, toggleTheme]
  );

  const value = useMemo<AppContextValue>(
    () => ({
      dbReady,
      isOnline,
      isSyncing,
      pendingQueueCount,
      lastSyncedAt,
      config,
      themeMode,
      palette,
      syncVersion,
      commandPaletteOpen,
      toastText,
      setCommandPaletteOpen,
      toggleTheme,
      reloadConfig,
      syncNow,
      flushOutbox,
      showToast,
    }),
    [
      dbReady,
      isOnline,
      isSyncing,
      pendingQueueCount,
      lastSyncedAt,
      config,
      themeMode,
      palette,
      syncVersion,
      commandPaletteOpen,
      toastText,
      toggleTheme,
      reloadConfig,
      syncNow,
      flushOutbox,
      showToast,
    ]
  );

  return (
    <ThemeContext.Provider value={themeValue}>
      <AppContext.Provider value={value}>{children}</AppContext.Provider>
    </ThemeContext.Provider>
  );
}

export function useThemePalette(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useThemePalette must be used inside AppProvider');
  return ctx;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}

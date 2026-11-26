import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Platform, StyleSheet, Text, View } from 'react-native';
import { ScreenHeader } from '../src/components/ScreenHeader';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  FieldInput,
  ScreenScroll,
  SegmentedControl,
} from '../src/components/ui';
import { DEFAULT_REDMINE_URL, DEFAULT_SERVER_URL } from '../src/constants/config';
import { RADII, SPACING } from '../src/constants/theme';
import { useApp } from '../src/context/AppContext';
import { SyncQueueRepo, clearCachedData } from '../src/db/repositories';
import { detectDefaultServerUrl, saveAppConfig } from '../src/services/configService';
import { RedmineClient } from '../src/services/redmineClient';
import type { ConnectionMode, GoogleIntegrationsStatus, SyncQueueItem } from '../src/types';

export default function SettingsScreen() {
  const {
    palette,
    config,
    themeMode,
    toggleTheme,
    reloadConfig,
    syncNow,
    flushOutbox,
    syncVersion,
    showToast,
  } = useApp();

  const [mode, setMode] = useState<ConnectionMode>('direct');
  const [redmineUrl, setRedmineUrl] = useState(DEFAULT_REDMINE_URL);
  const [redmineApiKey, setRedmineApiKey] = useState('');
  const [githubToken, setGithubToken] = useState('');
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [groqApiKey, setGroqApiKey] = useState('');
  const [serverUrl, setServerUrl] = useState(DEFAULT_SERVER_URL);
  const [googleClientId, setGoogleClientId] = useState('');
  const [googleClientSecret, setGoogleClientSecret] = useState('');
  const [eodSheetId, setEodSheetId] = useState('');
  const [googleStatus, setGoogleStatus] = useState<GoogleIntegrationsStatus | null>(null);
  const [savingGoogle, setSavingGoogle] = useState(false);
  const [queueItems, setQueueItems] = useState<SyncQueueItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [connInfo, setConnInfo] = useState('');
  const [connError, setConnError] = useState('');

  const loadQueue = useCallback(async () => {
    setQueueItems(await SyncQueueRepo.list());
  }, []);

  const refreshGoogleStatus = useCallback(
    async (targetServerUrl?: string) => {
      if (!config && !targetServerUrl) return;
      const effectiveCfg = {
        ...(config || {
          mode,
          redmineUrl,
          redmineApiKey,
          githubToken,
          geminiApiKey,
          groqApiKey,
          serverUrl,
        }),
        serverUrl: (targetServerUrl || serverUrl).trim().replace(/\/+$/, ''),
      };
      if (!effectiveCfg.serverUrl) return;
      const status = await RedmineClient.fetchIntegrationsStatus(effectiveCfg).catch(() => null);
      if (status) {
        setGoogleStatus(status);
        if (status.googleConfig?.eod_sheet_id && !eodSheetId) {
          setEodSheetId(status.googleConfig.eod_sheet_id);
        }
      }
    },
    [config, mode, redmineUrl, redmineApiKey, githubToken, geminiApiKey, groqApiKey, serverUrl, eodSheetId]
  );

  useEffect(() => {
    if (!config) return;
    setMode(config.mode);
    setRedmineUrl(config.redmineUrl);
    setRedmineApiKey(config.redmineApiKey);
    setGithubToken(config.githubToken);
    setGeminiApiKey(config.geminiApiKey);
    setGroqApiKey(config.groqApiKey);
    setServerUrl(config.serverUrl);
    setGoogleClientId(config.googleClientId || '');
    setGoogleClientSecret(config.googleClientSecret || '');
    setEodSheetId(config.eodSheetId || '');
    refreshGoogleStatus(config.serverUrl);
  }, [config]);

  useEffect(() => {
    loadQueue();
  }, [loadQueue, syncVersion]);

  const handleSave = async () => {
    setSaving(true);
    setConnInfo('');
    setConnError('');
    try {
      const nextCfg = {
        mode,
        redmineUrl,
        redmineApiKey,
        githubToken,
        geminiApiKey,
        groqApiKey,
        serverUrl,
        googleClientId,
        googleClientSecret,
        eodSheetId,
      };
      await saveAppConfig(nextCfg);
      await reloadConfig();

      let meError = '';
      const me = await RedmineClient.fetchMe(nextCfg).catch(err => {
        meError = err instanceof Error ? err.message : 'Connection failed';
        return null;
      });

      const integrations = nextCfg.serverUrl
        ? await RedmineClient.fetchIntegrationsStatus(nextCfg).catch(() => ({ cal: null, sheets: null, googleConfig: null }))
        : { cal: null, sheets: null, googleConfig: null };
      setGoogleStatus(integrations);

      const calText =
        integrations.cal === null
          ? 'Calendar: server unreachable'
          : integrations.cal.connected
            ? `Calendar: ${integrations.cal.email || 'Connected'}`
            : 'Calendar: not connected in Web app';
      const sheetsText =
        integrations.sheets === null
          ? 'Sheets: server unreachable'
          : integrations.sheets.connected
            ? `Sheets: ${integrations.sheets.email || 'Connected'}`
            : 'Sheets: not connected in Web app';

      if (me) {
        setConnInfo(`Signed in as ${me.name} · ${calText} · ${sheetsText}`);
        showToast(`Connected as ${me.name}`);
        await syncNow();
      } else {
        const hint =
          Platform.OS === 'web' && mode === 'direct'
            ? 'Browser CORS blocks direct Redmine calls. Switch to "DevPilot Server Proxy" and ensure "npm start" is running in pr-to-tracker/.'
            : mode === 'server'
              ? `Cannot reach DevPilot Server at ${nextCfg.serverUrl} (${meError}). Ensure "npm start" is running in pr-to-tracker/ (restart it if already open).`
              : `Connection failed: ${meError}`;
        setConnError(hint);
        showToast('Saved locally — connection check failed');
      }
    } finally {
      setSaving(false);
    }
  };

  const returnToUrl =
    Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.href : undefined;

  const currentCfgForGoogle = {
    mode,
    redmineUrl,
    redmineApiKey,
    githubToken,
    geminiApiKey,
    groqApiKey,
    serverUrl: serverUrl.trim().replace(/\/+$/, ''),
    googleClientId,
    googleClientSecret,
    eodSheetId,
  };

  const handleSaveGoogleApp = async () => {
    if (!currentCfgForGoogle.serverUrl) {
      showToast('Enter DevPilot Server URL first');
      return;
    }
    setSavingGoogle(true);
    try {
      await saveAppConfig(currentCfgForGoogle);
      await reloadConfig();
      await RedmineClient.saveGoogleConfig(currentCfgForGoogle, {
        client_id: googleClientId.trim() || undefined,
        client_secret: googleClientSecret.trim() || undefined,
        eod_sheet_id: eodSheetId.trim() || undefined,
      });
      await refreshGoogleStatus(currentCfgForGoogle.serverUrl);
      showToast('Saved Google OAuth & Sheet configuration');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not save Google config');
    } finally {
      setSavingGoogle(false);
    }
  };

  const handleDisconnectCal = async () => {
    await RedmineClient.disconnectCalendar(currentCfgForGoogle).catch(() => {});
    await refreshGoogleStatus(currentCfgForGoogle.serverUrl);
    showToast('Disconnected Google Calendar');
  };

  const handleDisconnectSheets = async () => {
    await RedmineClient.disconnectSheets(currentCfgForGoogle).catch(() => {});
    await refreshGoogleStatus(currentCfgForGoogle.serverUrl);
    showToast('Disconnected Google Sheets');
  };

  const handleRemoveQueueItem = async (id: number) => {
    await SyncQueueRepo.remove(id);
    await loadQueue();
    showToast('Removed queued item');
  };

  const handleClearCache = () => {
    Alert.alert('Clear SQLite Cache', 'Delete cached issues, PRs, and time entries? Pending outbox items stay intact.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear Cache',
        style: 'destructive',
        onPress: async () => {
          await clearCachedData();
          showToast('SQLite cache cleared');
        },
      },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <ScreenHeader title="Settings & Sync Queue" subtitle="Encrypted keys + SQLite outbox" showBack />

      <ScreenScroll>
        <Card>
          <CardHeader title="Connection & Credentials" subtitle="Stored in SecureStore; works offline after initial sync" />
          <View style={styles.body}>
            <SegmentedControl
              value={mode}
              onChange={setMode}
              options={[
                { value: 'direct', label: 'Direct REST APIs' },
                { value: 'server', label: 'DevPilot Server Proxy' },
              ]}
            />

            <FieldInput
              label="DevPilot Server URL (Web: http://localhost:3333 · Phone: http://<laptop-ip>:3333)"
              value={serverUrl}
              onChangeText={setServerUrl}
              placeholder={detectDefaultServerUrl()}
              autoCapitalize="none"
            />
            <Button
              label={`Auto-detect URL (${detectDefaultServerUrl()})`}
              size="sm"
              variant="ghost"
              onPress={() => setServerUrl(detectDefaultServerUrl())}
            />

            {connInfo ? (
              <Text style={{ color: palette.success, fontSize: 12.5 }}>{connInfo}</Text>
            ) : null}
            {connError ? (
              <Text style={{ color: palette.danger, fontSize: 12.5 }}>{connError}</Text>
            ) : null}

            {mode === 'server' ? (
              <Text style={{ color: palette.textMuted, fontSize: 12 }}>
                In Server Proxy mode, Redmine, GitHub, AI keys, Google Calendar, and Google Sheets are read directly from your DevPilot server (.env + OAuth tokens).
              </Text>
            ) : null}

            <FieldInput
              label="Redmine URL (Direct mode)"
              value={redmineUrl}
              onChangeText={setRedmineUrl}
              autoCapitalize="none"
            />
            <FieldInput
              label="Redmine API Key"
              value={redmineApiKey}
              onChangeText={setRedmineApiKey}
              secureTextEntry
              autoCapitalize="none"
              placeholder="From Redmine My Account"
            />
            <FieldInput
              label="GitHub Token (optional for private repos)"
              value={githubToken}
              onChangeText={setGithubToken}
              secureTextEntry
              autoCapitalize="none"
            />
            <FieldInput
              label="Gemini API Key (optional)"
              value={geminiApiKey}
              onChangeText={setGeminiApiKey}
              secureTextEntry
              autoCapitalize="none"
            />
            <FieldInput
              label="Groq API Key (optional fallback)"
              value={groqApiKey}
              onChangeText={setGroqApiKey}
              secureTextEntry
              autoCapitalize="none"
            />

            <Button label={saving ? 'Saving…' : 'Save & Test Connection'} loading={saving} onPress={handleSave} />
          </View>
        </Card>

        <Card>
          <CardHeader
            title="Google Calendar & Sheets Login"
            subtitle="OAuth login & Google Client ID / Sheet ID"
            right={
              <Button
                label="Refresh"
                size="sm"
                variant="ghost"
                onPress={() => refreshGoogleStatus()}
              />
            }
          />
          <View style={styles.body}>
            <View style={[styles.queueRow, { backgroundColor: palette.surface2, borderColor: palette.borderSubtle }]}>
              <View style={styles.queueTop}>
                <Text style={{ color: palette.text, fontWeight: '700', fontSize: 13.5 }}>Google Calendar</Text>
                <Badge
                  label={
                    googleStatus?.cal?.connected
                      ? `Connected · ${googleStatus.cal.email || 'Active'}`
                      : googleStatus?.cal?.configured
                        ? 'Not logged in'
                        : googleStatus?.cal
                          ? 'Needs Client ID'
                          : 'Server unreachable'
                  }
                  tone={googleStatus?.cal?.connected ? 'success' : 'warning'}
                />
              </View>
              <View style={styles.row2}>
                <Button
                  label={googleStatus?.cal?.connected ? 'Reconnect Google Calendar' : 'Login Google Calendar'}
                  size="sm"
                  onPress={() => Linking.openURL(RedmineClient.getCalendarConnectUrl(currentCfgForGoogle, returnToUrl))}
                  style={{ flex: 1 }}
                />
                {googleStatus?.cal?.connected ? (
                  <Button label="Disconnect" size="sm" variant="ghost" onPress={handleDisconnectCal} />
                ) : null}
              </View>
            </View>

            <View style={[styles.queueRow, { backgroundColor: palette.surface2, borderColor: palette.borderSubtle }]}>
              <View style={styles.queueTop}>
                <Text style={{ color: palette.text, fontWeight: '700', fontSize: 13.5 }}>Google Sheets (EOD)</Text>
                <Badge
                  label={
                    googleStatus?.sheets?.connected
                      ? `Connected · ${googleStatus.sheets.email || 'Active'}`
                      : googleStatus?.sheets?.configured
                        ? 'Not logged in'
                        : googleStatus?.sheets
                          ? 'Needs Client ID'
                          : 'Server unreachable'
                  }
                  tone={googleStatus?.sheets?.connected ? 'success' : 'warning'}
                />
              </View>
              <View style={styles.row2}>
                <Button
                  label={googleStatus?.sheets?.connected ? 'Reconnect Google Sheets' : 'Login Google Sheets'}
                  size="sm"
                  onPress={() => Linking.openURL(RedmineClient.getSheetsConnectUrl(currentCfgForGoogle, returnToUrl))}
                  style={{ flex: 1 }}
                />
                {googleStatus?.sheets?.sheet_url ? (
                  <Button
                    label="Open Sheet"
                    size="sm"
                    variant="ghost"
                    onPress={() => Linking.openURL(googleStatus.sheets!.sheet_url!)}
                  />
                ) : null}
                {googleStatus?.sheets?.connected ? (
                  <Button label="Disconnect" size="sm" variant="ghost" onPress={handleDisconnectSheets} />
                ) : null}
              </View>
            </View>

            {googleStatus?.googleConfig ? (
              <Text style={{ color: palette.textMuted, fontSize: 12 }}>
                Server OAuth Client: {googleStatus.googleConfig.client_id_masked || 'not set'} · Redirect: {googleStatus.googleConfig.redirect_uri}
              </Text>
            ) : null}

            <FieldInput
              label="Google Client ID (leave blank to keep server .env value)"
              value={googleClientId}
              onChangeText={setGoogleClientId}
              placeholder="xxxxxxxxxx.apps.googleusercontent.com"
              autoCapitalize="none"
            />
            <FieldInput
              label="Google Client Secret (leave blank to keep server .env value)"
              value={googleClientSecret}
              onChangeText={setGoogleClientSecret}
              secureTextEntry
              autoCapitalize="none"
            />
            <FieldInput
              label="EOD Google Sheet ID"
              value={eodSheetId}
              onChangeText={setEodSheetId}
              placeholder="158i8m41ERcB4vFLhYqmQ_ph0MMmvVq_tLTkov5bZZWM"
              autoCapitalize="none"
            />
            <Button
              label={savingGoogle ? 'Saving…' : 'Save Google App Config'}
              variant="ghost"
              loading={savingGoogle}
              onPress={handleSaveGoogleApp}
            />
          </View>
        </Card>

        <Card>
          <CardHeader
            title="Offline Sync Queue (SQLite Outbox)"
            subtitle={`${queueItems.length} pending or failed operation(s)`}
            right={<Button label="Retry All" size="sm" variant="ghost" onPress={flushOutbox} />}
          />
          <View style={styles.body}>
            {!queueItems.length ? (
              <Text style={{ color: palette.textMuted, fontSize: 13 }}>All changes are synced with Redmine.</Text>
            ) : (
              queueItems.map(item => (
                <View
                  key={item.id}
                  style={[styles.queueRow, { backgroundColor: palette.surface2, borderColor: palette.borderSubtle }]}
                >
                  <View style={styles.queueTop}>
                    <Text style={{ color: palette.text, fontWeight: '700', fontSize: 13 }}>{item.op_type}</Text>
                    <Badge
                      label={item.status}
                      tone={item.status === 'failed' ? 'danger' : item.status === 'syncing' ? 'primary' : 'warning'}
                    />
                  </View>
                  {item.last_error ? (
                    <Text style={{ color: palette.danger, fontSize: 12 }}>{item.last_error}</Text>
                  ) : null}
                  <Text style={{ color: palette.textMuted, fontSize: 11.5 }} numberOfLines={2}>
                    {item.payload_json}
                  </Text>
                  <Button
                    label="Discard"
                    size="sm"
                    variant="danger"
                    onPress={() => handleRemoveQueueItem(item.id)}
                  />
                </View>
              ))
            )}
          </View>
        </Card>

        <Card>
          <CardHeader title="Appearance & Storage" />
          <View style={styles.body}>
            <Button
              label={`Switch to ${themeMode === 'dark' ? 'Light' : 'Dark'} Theme`}
              variant="ghost"
              onPress={toggleTheme}
            />
            <Button label="Clear Cached SQLite Data" variant="danger" onPress={handleClearCache} />
          </View>
        </Card>
      </ScreenScroll>
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  queueRow: {
    padding: SPACING.md,
    borderRadius: RADII.sm,
    borderWidth: 1,
    gap: 6,
  },
  queueTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    flexWrap: 'wrap',
  },
  row2: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
});

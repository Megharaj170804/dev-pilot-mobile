import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import {
  DEFAULT_REDMINE_URL,
  DEFAULT_SERVER_URL,
  SECURE_KEYS,
} from '../constants/config';
import type { AppConfig, ConnectionMode } from '../types';

export function detectDefaultServerUrl(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.hostname) {
    return `http://${window.location.hostname}:3333`;
  }
  const hostUri =
    Constants.expoConfig?.hostUri ||
    (Constants.manifest2 as { extra?: { expoGo?: { debuggerHost?: string } } } | null)?.extra?.expoGo?.debuggerHost;
  if (hostUri) {
    const host = hostUri.split(':')[0];
    if (host && host !== 'localhost' && host !== '127.0.0.1') {
      return `http://${host}:3333`;
    }
  }
  return DEFAULT_SERVER_URL;
}

async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      return typeof window !== 'undefined' && window.localStorage
        ? window.localStorage.getItem(key)
        : null;
    } catch {
      return null;
    }
  }
  return SecureStore.getItemAsync(key);
}

async function setItem(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, value);
      }
    } catch {
      // ignore storage quota errors
    }
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

export async function loadAppConfig(): Promise<AppConfig> {
  const [
    modeRaw,
    redmineUrl,
    redmineApiKey,
    githubToken,
    geminiApiKey,
    groqApiKey,
    serverUrl,
    googleClientId,
    googleClientSecret,
    eodSheetId,
  ] = await Promise.all([
    getItem(SECURE_KEYS.CONNECTION_MODE),
    getItem(SECURE_KEYS.REDMINE_URL),
    getItem(SECURE_KEYS.REDMINE_API_KEY),
    getItem(SECURE_KEYS.GITHUB_TOKEN),
    getItem(SECURE_KEYS.GEMINI_API_KEY),
    getItem(SECURE_KEYS.GROQ_API_KEY),
    getItem(SECURE_KEYS.SERVER_URL),
    getItem(SECURE_KEYS.GOOGLE_CLIENT_ID),
    getItem(SECURE_KEYS.GOOGLE_CLIENT_SECRET),
    getItem(SECURE_KEYS.EOD_SHEET_ID),
  ]);

  const defaultServer = detectDefaultServerUrl();
  const mode: ConnectionMode =
    modeRaw === 'direct' || modeRaw === 'server'
      ? modeRaw
      : Platform.OS === 'web' || !redmineApiKey
        ? 'server'
        : 'direct';

  return {
    mode,
    redmineUrl: (redmineUrl || DEFAULT_REDMINE_URL).replace(/\/+$/, ''),
    redmineApiKey: redmineApiKey || '',
    githubToken: githubToken || '',
    geminiApiKey: geminiApiKey || '',
    groqApiKey: groqApiKey || '',
    serverUrl: (serverUrl || defaultServer).replace(/\/+$/, ''),
    googleClientId: googleClientId || '',
    googleClientSecret: googleClientSecret || '',
    eodSheetId: eodSheetId || '',
  };
}

export async function saveAppConfig(config: AppConfig): Promise<void> {
  await Promise.all([
    setItem(SECURE_KEYS.CONNECTION_MODE, config.mode),
    setItem(SECURE_KEYS.REDMINE_URL, config.redmineUrl.trim().replace(/\/+$/, '') || DEFAULT_REDMINE_URL),
    setItem(SECURE_KEYS.REDMINE_API_KEY, config.redmineApiKey.trim()),
    setItem(SECURE_KEYS.GITHUB_TOKEN, config.githubToken.trim()),
    setItem(SECURE_KEYS.GEMINI_API_KEY, config.geminiApiKey.trim()),
    setItem(SECURE_KEYS.GROQ_API_KEY, config.groqApiKey.trim()),
    setItem(SECURE_KEYS.SERVER_URL, config.serverUrl.trim().replace(/\/+$/, '') || DEFAULT_SERVER_URL),
    setItem(SECURE_KEYS.GOOGLE_CLIENT_ID, (config.googleClientId || '').trim()),
    setItem(SECURE_KEYS.GOOGLE_CLIENT_SECRET, (config.googleClientSecret || '').trim()),
    setItem(SECURE_KEYS.EOD_SHEET_ID, (config.eodSheetId || '').trim()),
  ]);
}

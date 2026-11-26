# DevPilot Mobile — Offline-First Developer Workflow App

React Native (Expo Router + TypeScript + `expo-sqlite`) mobile and web companion for **DevPilot**, engineered for full feature parity with the web platform and complete offline operation.

## Features (100% Parity + Offline-First SQLite)

1. **Daily Workspace (`app/(tabs)/index.tsx`)**
   - In-Progress / Pinned / All Open Redmine task queue with star pins and inline status updates
   - Today's time breakdown against an 8h daily target + 30-day weekday 8h audit with 1-tap catch-up logging
   - Today's Google Calendar meetings + Standup & EOD Composer (AI + offline formatter)
2. **PR → Redmine Sync (`app/(tabs)/sync-pr.tsx`)**
   - 3-step PR import wizard (Paste PR URL → AI / Smart Template Generation → Preview & Create)
   - Redmine Textile Edit & Preview tabs, duplicate PR guard, and Sync History
3. **Quick Task (`app/(tabs)/quick-task.tsx`)**
   - Presets & Google Calendar meeting prefill, AI/template drafting, parent feature & target version pickers, and 1-tap issue creation + time logging
4. **Work Hierarchy (`app/(tabs)/hierarchy.tsx`)**
   - Collapsible Epic → Feature → Task/Bug Outline, Kanban Board, Live Activity Feed, 6 KPI tiles, SVG Today ring + 7-day bar chart, and Issue Detail drawer
5. **PR Comments (`app/pr-comments.tsx`)**
   - Fetches conversation, inline review, and review summary comments, filters by author / latest round, and builds Claude Code / Antigravity / generic agent fix prompts
6. **KPI Comments (`app/kpi-comments.tsx`)**
   - Monthly (21st → 20th) Redmine KPI generator with DIR (`3.1`) and Standards (`1.1`) calculators, filtered Redmine links, and 1-line AI/local note drafting
7. **EOD Updates Sheet (`app/eod-updates.tsx`)**
   - Offline-cached Google Sheet viewer and editor with multi-tab switching, month filter, Pull Today from Redmine, Add / Edit / Duplicate / Delete row, and TSV export
8. **Settings, Outbox & About (`app/settings.tsx`, `app/about.tsx`)**
   - **DevPilot Server Proxy** mode (shares identical Redmine, History, AI, Google Calendar, and Google Sheets data with the web app) and **Direct REST** mode
   - Google Calendar & Google Sheets OAuth login/disconnect + Google Client ID / EOD Sheet ID configuration
   - Durable `sync_queue` SQLite outbox inspector, Apple Pro Dark / Studio Light themes, and About DevPilot guide

## Offline Architecture

- **Native (iOS / Android):** Uses `expo-sqlite` in WAL mode (`src/db/schema.ts`, `src/db/repositories.ts`) with a serialized transaction mutex (`runInTransaction`) and `expo-secure-store` for credentials.
- **Web:** Uses `localStorage` adapters (`src/db/schema.web.ts`, `src/db/repositories.web.ts`) resolved automatically by Metro.
- **Outbox Sync (`src/services/syncEngine.ts`):** Status changes, time entries, PR tasks, Quick Tasks, and EOD sheet edits made offline apply optimistically and replay sequentially when `@react-native-community/netinfo` detects reconnection.

## Quick Start

```bash
npm install
npm run typecheck
npx expo start
```

- Press `w` for Web (`http://localhost:8081`) or scan the QR code in **Expo Go** on Android/iOS.
- To share live data, Google Calendar, and Google Sheets with the DevPilot web server (`pr-to-tracker`), run `npm start` in the web repo and select **DevPilot Server Proxy** in **Settings**.

## Building Android `.aab` & `.apk`

See [BUILD_AND_RELEASE.md](./BUILD_AND_RELEASE.md) for both **EAS Cloud Build** (`eas build --platform android --profile production` for `.aab`) and **Local Gradle Build** (`npx expo prebuild --platform android && ./gradlew bundleRelease`).

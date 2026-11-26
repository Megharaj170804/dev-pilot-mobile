# DevPilot Mobile — Architecture Overview

DevPilot Mobile is an **offline-first React Native + Expo Router application** built with TypeScript, `expo-sqlite`, `expo-secure-store`, and `@react-native-community/netinfo`. It provides full feature parity with the [DevPilot (`PR-TO-Tracker`)](https://github.com/Megharaj170804/PR-TO-Tracker) web platform while continuing to work seamlessly when offline.

---

## Navigation & Screen Layout

Expo Router (`expo-router ~4.0.0`) powers a dual-tier navigation structure inside `app/`:

- **`app/_layout.tsx` (Root Stack)**  
  Initializes SQLite/storage on launch, renders `AppSplashScreen`, mounts global context providers (Theme, Network, Sync status), and registers stack modal/utility routes:
  - `(tabs)` — Primary bottom tab navigator
  - `pr-comments` — PR Review Comments generator
  - `kpi-comments` — KPI Reflection generator
  - `eod-updates` — Connected Google Sheets EOD tracker
  - `settings` — Connection mode, API keys, Google OAuth setup, Offline Sync Queue inspector
  - `about` — Platform overview & feature guide
- **`app/(tabs)/_layout.tsx` (Bottom Tab Bar — Lazy Mounted)**  
  Uses `lazy: true` for smooth tab performance across:
  - `index` — **Today** (`Daily Workspace`)
  - `sync-pr` — **PR Sync** (`PR -> Redmine`)
  - `quick-task` — **Quick Task** (`Quick Task & Log Time`)
  - `hierarchy` — **Hierarchy** (`Work Hierarchy`)
  - `more` — **Tools** (Hub for EOD Updates, PR Comments, KPI Reflection, Settings, and About)

---

## Directory Structure

```text
devpilot-mobile/
├── app/                      # Expo Router screens
│   ├── _layout.tsx           # Root stack + splash + providers
│   ├── (tabs)/               # 5 main tabs (Today, PR Sync, Quick Task, Hierarchy, Tools)
│   ├── about.tsx             # App overview & documentation inside the app
│   ├── eod-updates.tsx       # Bidirectional Google Sheets EOD editor
│   ├── kpi-comments.tsx      # Periodic KPI reflection builder
│   ├── pr-comments.tsx       # GitHub PR review -> Redmine comment formatter
│   └── settings.tsx          # Direct/Proxy config, Google OAuth, Sync Queue & Theme
├── assets/                   # Custom PNG icon, adaptive-icon, splash-icon, favicon
├── docs/                     # Mobile architecture, features, offline sync & build docs
├── src/
│   ├── components/           # Shared UI components (AppSplashScreen, cards, badges)
│   ├── constants/config.ts   # Tuned limits, Redmine IDs, timeouts, SecureStore keys
│   ├── context/              # React contexts for config, theme, network & sync state
│   ├── db/
│   │   ├── schema.ts         # Native SQLite WAL schema + runInTransaction mutex
│   │   ├── repositories.ts   # Native SQLite data access layer
│   │   ├── schema.web.ts     # Web storage schema adapter
│   │   └── repositories.web.ts # Web localStorage data access layer
│   ├── domain/               # Pure business logic shared cleanly with web workflows
│   │   ├── eodSheetUtils.ts
│   │   ├── kpiData.ts
│   │   ├── prCommentsBuilder.ts
│   │   ├── redmineUtils.ts
│   │   └── standupFormatter.ts
│   ├── services/
│   │   ├── aiClient.ts       # Gemini 2.5 Flash (+ fallbacks) & Groq LLM client
│   │   ├── configService.ts  # SecureStore (native) / localStorage (web) credential store
│   │   ├── githubClient.ts   # GitHub PR fetcher & diff summarizer
│   │   ├── redmineClient.ts  # Unified Direct REST + DevPilot Server Proxy client
│   │   └── syncEngine.ts     # Sync orchestrator + outbox queue processor
│   └── types/                # Shared TypeScript interfaces
├── app.json                  # Expo manifest (package: net.tekdi.devpilot)
└── eas.json                  # EAS production (.aab) & preview (.apk) build profiles
```

---

## Dual Connection Modes (`Direct REST` vs. `Server Proxy`)

| Capability | DevPilot Server Proxy (`http://<host>:3333`) | Direct REST APIs |
| --- | --- | --- |
| **Redmine Issues & Time** | Proxied through `server.js` using `.env` keys | Direct HTTPS calls from device using keys in `SecureStore` |
| **GitHub PR & AI (Gemini/Groq)** | Shared server tokens & AI pipeline | Direct API calls from device |
| **Google Calendar & Meet** | Live synced automatically via shared `.google-token.json` | Requires Server URL for Calendar OAuth endpoints |
| **Google Sheets EOD** | Live synced automatically via shared `.google-sheets-token.json` | Requires Server URL for Sheets OAuth endpoints |
| **Expo Web (`localhost:8081`)** | Recommended (avoids Redmine browser CORS blocks) | Blocked by external Redmine CORS headers in browsers |

---

## Performance & Concurrency Design

1. **Serialized SQLite Transactions (`runInTransaction`):** All SQLite multi-statement writes pass through a promise-chain mutex in `src/db/schema.ts`, preventing `cannot start a transaction within a transaction` errors under concurrent foreground + background syncs.
2. **Throttled Syncing:** Background polling uses `TRACKER_POLL_INTERVAL_MS` (`60000` ms) and foreground resume guards (`FOREGROUND_SYNC_MIN_GAP_MS = 30000` ms).
3. **Incremental Rendering:** `Hierarchy` defaults epics collapsed on open, lazy tabs defer offscreen mounts, and long lists cap initial render at `INITIAL_DISPLAY_LIMIT` (`25`).

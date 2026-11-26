---
name: expo-offline-app-generator
description: >-
  Generate an offline-first React Native Expo + SQLite mobile application workspace
  with full feature parity from an existing full-stack web application. Use when
  converting a web app into a cross-platform mobile app (iOS/Android) that persists
  data locally in SQLite, queues mutations offline, and syncs cleanly on reconnect.
---

# Expo Offline-First App Generator

Convert an existing web application into a standalone React Native (Expo Router + TypeScript + `expo-sqlite`) mobile workspace with 100% feature parity and offline-first persistence.

## Workflow

### Phase 1: Web App Feature & API Audit
1. Inventory every page, modal, keyboard/shortcut flow, and background job in the source web app.
2. List every backend endpoint and external integration (REST APIs, OAuth services, AI providers, real-time streams).
3. Extract pure domain logic (validation, formatters, parsers, calculators, prompt builders) so it can be shared or ported 1:1 into `src/domain/` with zero DOM dependencies.
4. Capture the web design system tokens (dark/light palettes, semantic colors, radii, typography) into `src/constants/theme.ts`.

### Phase 2: Workspace & Architecture Setup
1. Create a self-contained Expo workspace (`package.json`, `app.json`, `tsconfig.json`, `babel.config.js`, `.gitignore`).
2. Design normalized SQLite tables plus a persistent `sync_queue` outbox table.
3. Implement versioned schema migrations (`PRAGMA journal_mode = WAL`, `PRAGMA foreign_keys = ON`), `expo-secure-store` credentials, optimistic SQLite writes, and automatic queue replay on reconnect (`@react-native-community/netinfo`).

### Phase 3: Domain Port & Shared UI Primitives
1. Port pure domain modules into `src/domain/` and add Node-runnable unit tests.
2. Build a reusable component library (`src/components/`) — `Card`, `Badge`, `Button`, `SegmentedControl`, `Chip`, `ModalSheet`, `OfflineBanner`, `EmptyState` — avoiding duplicated markup across screens.
3. Keep all business constants (limits, status IDs, timeouts, defaults) in `src/constants/` (no magic numbers).

### Phase 4: Feature Screens & Navigation
1. Configure Expo Router tabs for primary daily workflows and stack routes for secondary tools, settings, and offline outbox inspection.
2. Implement every screen so it reads from SQLite first (instant render even in Airplane Mode), refreshes from network when available, and gracefully degrades AI/network actions to local templates or queued mutations when offline.
3. Add a global Quick Jump / Command Palette modal for fast cross-screen navigation and URL/action triggers.

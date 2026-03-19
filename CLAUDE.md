# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Development mode with hot reload via Raycast
npm run build    # Production build
npm run lint     # Lint
npm run fix-lint # Auto-fix lint issues
```

## Architecture

Single Raycast command (`src/index.tsx`) that cross-searches Chrome tabs, history, and bookmarks using Fuse.js fuzzy search.

**Data loading:**
- `src/chrome-tabs.ts` — Reads open Chrome tabs via JXA (`osascript -l JavaScript`). Script is written to tmpdir once at module load time (constant, never changes). Uses `spawnSync` with args array (no shell interpolation). Tab switching uses AppleScript via `spawnSync`. Requires macOS Automation permission for Chrome.
- `src/chrome-history.ts` — Copies Chrome's locked SQLite DB to tmpdir (skipped if source mtime is unchanged), then queries via `executeSQL` from `@raycast/utils`. Filters out `chrome-*` and Google search URLs. Chrome timestamp = microseconds since 1601-01-01 (Windows FILETIME). After loading, deduplicates by title (keeps most recently visited URL per title) to match RexiOry behavior.
- `src/chrome-bookmarks.ts` — Reads Chrome's JSON Bookmarks file synchronously, flattens the tree recursively, deduplicates by URL.

**Search flow in `index.tsx`:**
- All three data sources loaded with `useCachedPromise`
- Fuse.js index is pre-built via `useMemo` when data loads (not on every keystroke). Multi-word queries are AND-chained using the pre-built index for the first word.
- `<List filtering={false}>` is required — Raycast's built-in filtering must be disabled when using custom search
- Empty query → shows first 100 results of each type; with query → full fuzzy search
- Results are rendered as a flat list (no sections) in fixed order: Tab → Suggest → Bookmark → History
- Search Suggest: Google Suggest API fetched with 200ms debounce via `useSuggestions()` hook; up to 3 suggestions shown
- Fallback: when no results, `List.EmptyView` with action to search configured engine in Chrome
- Opening a URL calls `closeMainWindow()` then `popToRoot()` before `open()` — ensures Raycast returns to root on next launch
- Tab switching calls `switchToTabScript()` (AppleScript) then `closeMainWindow()` + `popToRoot()`

**`ItemActions` component:**
- Shared action panel used by `BookmarkItem`, `HistoryItem`, and `TabItem`
- Accepts optional `primaryAction?: React.JSX.Element` — rendered as the first (default) action
- `TabItem` passes "Switch to Tab" as `primaryAction`; others use "Open in Chrome" as default

**Icon:**
- File must be at `assets/icon.png`
- `package.json` must use `"icon": "icon.png"` (without `assets/` prefix — Raycast auto-prepends `assets/`)

**Key constraints:**
- Multi-profile supported; profile selector dropdown shown when multiple profiles exist
- Must use `@types/react@19` (not 18) — `@raycast/api` bundles React 19 internally
- `executeSQL` from `@raycast/utils` must be used for SQLite (not `better-sqlite3`, which fails in Raycast runtime)
- Use `React.JSX.Element` (not `JSX.Element` or `React.ReactNode`) for JSX prop types — avoids type conflict between project React and `@raycast/api`'s bundled React
- Tab JXA script must use `spawnSync` with args array, not shell string interpolation

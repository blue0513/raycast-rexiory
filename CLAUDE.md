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

Single Raycast command (`src/index.tsx`) that cross-searches Chrome history and bookmarks using Fuse.js fuzzy search.

**Data loading:**
- `src/chrome-history.ts` — Copies Chrome's locked SQLite DB to tmpdir (skipped if source mtime is unchanged), then queries via `executeSQL` from `@raycast/utils`. Filters out `chrome-*` and Google search URLs. Chrome timestamp = microseconds since 1601-01-01 (Windows FILETIME). After loading, deduplicates by title (keeps most recently visited URL per title) to match RexiOry behavior.
- `src/chrome-bookmarks.ts` — Reads Chrome's JSON Bookmarks file synchronously, flattens the tree recursively, deduplicates by URL.

**Search flow in `index.tsx`:**
- Both data sources loaded with `useCachedPromise` (async for history, sync-wrapped for bookmarks)
- Fuse.js index is pre-built via `useMemo` when data loads (not on every keystroke). Multi-word queries are AND-chained using the pre-built index for the first word.
- `<List filtering={false}>` is required — Raycast's built-in filtering must be disabled when using custom search
- Empty query → shows first 100 results of each type; with query → full fuzzy search
- Results are rendered as a flat list (no sections) in fixed order: Suggest → Bookmark → History
- Search Suggest: Google Suggest API fetched with 200ms debounce via `useSuggestions()` hook; up to 6 suggestions shown
- Fallback: when no results, `List.EmptyView` with action to search configured engine in Chrome
- Opening a URL calls `closeMainWindow()` then `popToRoot()` before `open()` — ensures Raycast returns to root on next launch

**Icon:**
- File must be at `assets/icon.png`
- `package.json` must use `"icon": "icon.png"` (without `assets/` prefix — Raycast auto-prepends `assets/`)

**Key constraints:**
- Multi-profile supported; profile selector dropdown shown when multiple profiles exist
- Must use `@types/react@19` (not 18) — `@raycast/api` bundles React 19 internally
- `executeSQL` from `@raycast/utils` must be used for SQLite (not `better-sqlite3`, which fails in Raycast runtime)

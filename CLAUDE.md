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
- `src/chrome-history.ts` — Copies Chrome's locked SQLite DB to tmpdir, then queries via `executeSQL` from `@raycast/utils`. Filters out `chrome-*` and Google search URLs. Chrome timestamp = microseconds since 1601-01-01 (Windows FILETIME).
- `src/chrome-bookmarks.ts` — Reads Chrome's JSON Bookmarks file synchronously, flattens the tree recursively, deduplicates by URL.

**Search flow in `index.tsx`:**
- Both data sources loaded with `useCachedPromise` (async for history, sync-wrapped for bookmarks)
- Fuse.js runs client-side on each keystroke via `useMemo` (threshold: 0.3, keys: `title` + `url`)
- `<List filtering={false}>` is required — Raycast's built-in filtering must be disabled when using custom search
- Empty query → shows first 100 results of each type; with query → full fuzzy search
- Fallback: when no results, `List.EmptyView` with action to search configured engine in Chrome

**Key constraints:**
- Only `Default` Chrome profile is supported (no multi-profile)
- Must use `@types/react@19` (not 18) — `@raycast/api` bundles React 19 internally
- `executeSQL` from `@raycast/utils` must be used for SQLite (not `better-sqlite3`, which fails in Raycast runtime)

import {
  Action,
  ActionPanel,
  Clipboard,
  closeMainWindow,
  Color,
  getPreferenceValues,
  Icon,
  Image,
  List,
  open,
  popToRoot,
  showToast,
  Toast,
} from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import Fuse from "fuse.js";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookmarkEntry, loadChromeBookmarks } from "./chrome-bookmarks";
import { HistoryEntry, loadChromeHistory } from "./chrome-history";
import { listChromeProfiles } from "./chrome-profile";
import { closeTabScript, loadChromeTabs, switchToTabScript, TabEntry } from "./chrome-tabs";

interface Preferences {
  fallbackSearchEngine: "google" | "duckduckgo" | "bing";
  maxHistoryResults: string;
}

const SEARCH_URLS: Record<string, string> = {
  google: "https://www.google.com/search?q=",
  duckduckgo: "https://duckduckgo.com/?q=",
  bing: "https://www.bing.com/search?q=",
};

const FUSE_OPTIONS = {
  keys: ["title", "url"],
  shouldSort: false,
  threshold: 0.3,
  ignoreLocation: false,
};

// Space-separated words are treated as AND: each word further narrows results
// Uses a pre-built Fuse index for the first word to avoid rebuilding on every keystroke
function fuseSearch<T>(fuse: Fuse<T>, items: T[], query: string): T[] {
  const words = query.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return items;
  let results = fuse.search(words[0]).map((r) => r.item);
  for (const word of words.slice(1)) {
    const f = new Fuse(results, FUSE_OPTIONS);
    results = f.search(word).map((r) => r.item);
  }
  return results;
}

const CHROME_BUNDLE_ID = "com.google.Chrome";
const SUGGEST_DEBOUNCE_MS = 200;
const MAX_SUGGESTIONS = 3;

async function fetchSearchSuggestions(query: string): Promise<string[]> {
  if (!query.trim()) return [];
  const url = `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(query)}`;
  const res = await fetch(url);
  const json = (await res.json()) as [string, string[]];
  return json[1].slice(0, MAX_SUGGESTIONS);
}

function useSuggestions(query: string): {
  suggestions: string[];
  isLoading: boolean;
} {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!query.trim()) {
      setSuggestions([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      fetchSearchSuggestions(query)
        .then((results) => {
          setSuggestions(results);
          setIsLoading(false);
        })
        .catch(() => {
          setSuggestions([]);
          setIsLoading(false);
        });
    }, SUGGEST_DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query]);

  return { suggestions, isLoading };
}

function getFallbackUrl(query: string, engine: string): string {
  const base = SEARCH_URLS[engine] ?? SEARCH_URLS.google;
  return base + encodeURIComponent(query);
}

function formatDate(date: Date): string {
  const now = new Date();
  const days = Math.floor(
    (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
}

function truncate(text: string, max = 40): string {
  return text.length <= max ? text : text.slice(0, max) + "…";
}

function formatEngineLabel(engine: string): string {
  return engine.charAt(0).toUpperCase() + engine.slice(1);
}

function favicon(url: string, fallback: Icon): Image.ImageLike {
  try {
    const hostname = new URL(url).hostname;
    return {
      source: `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`,
      fallback,
    };
  } catch {
    return fallback;
  }
}

async function openInChrome(url: string) {
  await closeMainWindow();
  await popToRoot();
  open(url, CHROME_BUNDLE_ID);
}

async function switchToTab(windowIndex: number, tabIndex: number) {
  await switchToTabScript(windowIndex, tabIndex);
  await closeMainWindow();
  await popToRoot();
}

async function closeTab(windowIndex: number, tabIndex: number, title: string) {
  try {
    await closeTabScript(windowIndex, tabIndex);
    await showToast({ style: Toast.Style.Success, title: "Tab closed", message: title });
  } catch (e) {
    await showToast({ style: Toast.Style.Failure, title: "Failed to close tab", message: String(e) });
  }
}

function ItemActions({
  url,
  title,
  searchQuery,
  engine,
  primaryAction,
  destructiveAction,
}: {
  url: string;
  title: string;
  searchQuery: string;
  engine: string;
  primaryAction?: React.JSX.Element;
  destructiveAction?: React.JSX.Element;
}) {
  const label = formatEngineLabel(engine);
  return (
    <ActionPanel>
      {primaryAction}
      <Action
        title="Open in Chrome"
        icon={Icon.Globe}
        onAction={() => openInChrome(url)}
      />
      <Action
        title="Copy URL"
        icon={Icon.Clipboard}
        shortcut={{ modifiers: ["cmd"], key: "c" }}
        onAction={async () => {
          await Clipboard.copy(url);
          await showToast({ style: Toast.Style.Success, title: "Copied URL" });
        }}
      />
      <Action
        title="Copy Title"
        icon={Icon.Clipboard}
        shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
        onAction={async () => {
          await Clipboard.copy(title);
          await showToast({ style: Toast.Style.Success, title: "Copied Title" });
        }}
      />
      <Action
        title="Copy Markdown Link"
        icon={Icon.Clipboard}
        shortcut={{ modifiers: ["cmd", "opt"], key: "c" }}
        onAction={async () => {
          await Clipboard.copy(`[${title}](${url})`);
          await showToast({ style: Toast.Style.Success, title: "Copied Markdown Link" });
        }}
      />
      {searchQuery && (
        <Action
          title={`Search on ${label}`}
          icon={Icon.MagnifyingGlass}
          shortcut={{ modifiers: ["opt"], key: "return" }}
          onAction={() => openInChrome(getFallbackUrl(searchQuery, engine))}
        />
      )}
      {destructiveAction}
    </ActionPanel>
  );
}

function TabItem({
  entry,
  searchQuery,
  engine,
  onClose,
}: {
  entry: TabEntry;
  searchQuery: string;
  engine: string;
  onClose: (id: string) => void;
}) {
  return (
    <List.Item
      title={truncate(entry.title)}
      icon={favicon(entry.url, Icon.Window)}
      accessories={[{ tag: { value: "Tab", color: Color.Orange } }]}
      actions={
        <ItemActions
          url={entry.url}
          title={entry.title}
          searchQuery={searchQuery}
          engine={engine}
          primaryAction={
            <Action
              title="Switch to Tab"
              icon={Icon.Window}
              onAction={() => switchToTab(entry.windowIndex, entry.tabIndex)}
            />
          }
          destructiveAction={
            <Action
              title="Close Tab"
              icon={Icon.XMarkCircle}
              style={Action.Style.Destructive}
              shortcut={{ modifiers: ["ctrl"], key: "k" }}
              onAction={async () => {
                await closeTab(entry.windowIndex, entry.tabIndex, entry.title);
                onClose(entry.id);
              }}
            />
          }
        />
      }
    />
  );
}

function SuggestItem({
  suggestion,
  engine,
}: {
  suggestion: string;
  engine: string;
}) {
  const url = `https://www.google.com/search?q=${encodeURIComponent(suggestion)}`;
  const label = formatEngineLabel(engine);
  return (
    <List.Item
      title={suggestion}
      icon={Icon.MagnifyingGlass}
      accessories={[{ tag: { value: "Suggest", color: Color.Green } }]}
      actions={
        <ActionPanel>
          <Action
            title="Search in Chrome"
            icon={Icon.Globe}
            onAction={() => openInChrome(url)}
          />
          <Action
            title={`Search on ${label}`}
            icon={Icon.MagnifyingGlass}
            shortcut={{ modifiers: ["opt"], key: "return" }}
            onAction={() => openInChrome(getFallbackUrl(suggestion, engine))}
          />
        </ActionPanel>
      }
    />
  );
}

function BookmarkItem({
  entry,
  searchQuery,
  engine,
}: {
  entry: BookmarkEntry;
  searchQuery: string;
  engine: string;
}) {
  return (
    <List.Item
      title={truncate(entry.title)}
      icon={favicon(entry.url, Icon.Star)}
      accessories={[{ tag: { value: "Bookmark", color: Color.Blue } }]}
      actions={
        <ItemActions
          url={entry.url}
          title={entry.title}
          searchQuery={searchQuery}
          engine={engine}
        />
      }
    />
  );
}

function HistoryItem({
  entry,
  searchQuery,
  engine,
}: {
  entry: HistoryEntry;
  searchQuery: string;
  engine: string;
}) {
  return (
    <List.Item
      title={truncate(entry.title)}
      icon={favicon(entry.url, Icon.Clock)}
      accessories={[
        { tag: { value: "History", color: Color.SecondaryText } },
        {
          text: formatDate(entry.lastVisitTime),
          tooltip: entry.lastVisitTime.toLocaleString(),
        },
        {
          text: `${entry.visitCount} visits`,
          tooltip: `Visited ${entry.visitCount} times`,
        },
      ]}
      actions={
        <ItemActions
          url={entry.url}
          title={entry.title}
          searchQuery={searchQuery}
          engine={engine}
        />
      }
    />
  );
}

export default function Command() {
  const prefs = getPreferenceValues<Preferences>();
  const parsedMax = parseInt(prefs.maxHistoryResults, 10);
  const maxHistory = isNaN(parsedMax) ? 10000 : parsedMax;

  const profiles = useMemo(() => listChromeProfiles(), []);
  const defaultProfile =
    profiles.find((p) => p.isLastUsed)?.dirName ??
    profiles[0]?.dirName ??
    "Default";
  const [profileDir, setProfileDir] = useState(defaultProfile);
  const [closedTabIds, setClosedTabIds] = useState<Set<string>>(new Set());
  const handleTabClose = useCallback(
    (id: string) => setClosedTabIds((prev) => new Set(prev).add(id)),
    [],
  );

  const [searchQuery, setSearchQuery] = useState("");
  const { suggestions, isLoading: suggestionsLoading } =
    useSuggestions(searchQuery);

  const { data: tabs = [], isLoading: tabsLoading } = useCachedPromise(
    () => loadChromeTabs(),
    [],
  );

  const { data: history = [], isLoading: historyLoading } = useCachedPromise(
    (dir: string, limit: number) => loadChromeHistory(dir, limit),
    [profileDir, maxHistory],
    { keepPreviousData: true },
  );

  const { data: bookmarks = [], isLoading: bookmarksLoading } =
    useCachedPromise(
      (dir: string) => Promise.resolve(loadChromeBookmarks(dir)),
      [profileDir],
      { keepPreviousData: true },
    );

  const tabsFuse = useMemo(() => new Fuse(tabs, FUSE_OPTIONS), [tabs]);

  const filteredTabs = useMemo<TabEntry[]>(() => {
    const visible = tabs.filter((t) => !closedTabIds.has(t.id));
    if (!searchQuery.trim()) return visible.slice(0, 100);
    return fuseSearch(tabsFuse, visible, searchQuery);
  }, [tabsFuse, tabs, searchQuery, closedTabIds]);

  const bookmarksFuse = useMemo(
    () => new Fuse(bookmarks, FUSE_OPTIONS),
    [bookmarks],
  );
  const historyFuse = useMemo(() => new Fuse(history, FUSE_OPTIONS), [history]);

  const filteredBookmarks = useMemo<BookmarkEntry[]>(() => {
    if (!searchQuery.trim()) return bookmarks.slice(0, 100);
    return fuseSearch(bookmarksFuse, bookmarks, searchQuery);
  }, [bookmarksFuse, bookmarks, searchQuery]);

  const filteredHistory = useMemo<HistoryEntry[]>(() => {
    if (!searchQuery.trim()) return history.slice(0, 100);
    return fuseSearch(historyFuse, history, searchQuery);
  }, [historyFuse, history, searchQuery]);

  const isLoading = historyLoading || bookmarksLoading || tabsLoading;
  const hasResults =
    filteredTabs.length > 0 ||
    filteredBookmarks.length > 0 ||
    filteredHistory.length > 0 ||
    suggestions.length > 0 ||
    (!!searchQuery.trim() && suggestionsLoading);
  const fallbackUrl = getFallbackUrl(searchQuery, prefs.fallbackSearchEngine);
  const searchEngineName = formatEngineLabel(prefs.fallbackSearchEngine);

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Search Chrome history and bookmarks..."
      onSearchTextChange={setSearchQuery}
      filtering={false}
      throttle
      searchBarAccessory={
        profiles.length > 1 ? (
          <List.Dropdown
            tooltip="Chrome Profile"
            value={profileDir}
            onChange={setProfileDir}
          >
            {profiles.map((p) => (
              <List.Dropdown.Item
                key={p.dirName}
                title={p.displayName}
                value={p.dirName}
              />
            ))}
          </List.Dropdown>
        ) : undefined
      }
    >
      {!hasResults && searchQuery ? (
        <List.EmptyView
          title="No results found"
          description={`Search "${searchQuery}" on ${searchEngineName}`}
          icon={Icon.MagnifyingGlass}
          actions={
            <ActionPanel>
              <Action
                title={`Search on ${searchEngineName}`}
                icon={Icon.MagnifyingGlass}
                onAction={() => openInChrome(fallbackUrl)}
              />
            </ActionPanel>
          }
        />
      ) : searchQuery.trim() ? (
        <>
          {filteredTabs.map((entry) => (
            <TabItem
              key={`tab-${entry.id}`}
              entry={entry}
              searchQuery={searchQuery}
              engine={prefs.fallbackSearchEngine}
              onClose={handleTabClose}
            />
          ))}
          {suggestionsLoading
            ? Array.from({ length: MAX_SUGGESTIONS }, (_, i) => (
                <List.Item
                  key={`skeleton-${i}`}
                  title="..."
                  icon={Icon.MagnifyingGlass}
                  accessories={[
                    { tag: { value: "Suggest", color: Color.Green } },
                  ]}
                />
              ))
            : suggestions.map((s) => (
                <SuggestItem
                  key={`suggest-${s}`}
                  suggestion={s}
                  engine={prefs.fallbackSearchEngine}
                />
              ))}
          {filteredBookmarks.map((entry) => (
            <BookmarkItem
              key={`bookmark-${entry.id}`}
              entry={entry}
              searchQuery={searchQuery}
              engine={prefs.fallbackSearchEngine}
            />
          ))}
          {filteredHistory.map((entry) => (
            <HistoryItem
              key={`history-${entry.id}`}
              entry={entry}
              searchQuery={searchQuery}
              engine={prefs.fallbackSearchEngine}
            />
          ))}
        </>
      ) : (
        <>
          {filteredTabs.map((entry) => (
            <TabItem
              key={`tab-${entry.id}`}
              entry={entry}
              searchQuery={searchQuery}
              engine={prefs.fallbackSearchEngine}
              onClose={handleTabClose}
            />
          ))}
          {filteredHistory.map((entry) => (
            <HistoryItem
              key={`history-${entry.id}`}
              entry={entry}
              searchQuery={searchQuery}
              engine={prefs.fallbackSearchEngine}
            />
          ))}
          {filteredBookmarks.map((entry) => (
            <BookmarkItem
              key={`bookmark-${entry.id}`}
              entry={entry}
              searchQuery={searchQuery}
              engine={prefs.fallbackSearchEngine}
            />
          ))}
        </>
      )}
    </List>
  );
}

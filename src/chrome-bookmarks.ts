import * as fs from "fs";
import * as os from "os";
import * as path from "path";

export interface BookmarkEntry {
  type: "bookmark";
  id: string;
  url: string;
  title: string;
  folderPath: string;
}

const CHROME_BOOKMARKS_PATH = path.join(
  os.homedir(),
  "Library/Application Support/Google/Chrome/Default/Bookmarks",
);

interface RawBookmark {
  id: string;
  type: "url" | "folder";
  name: string;
  url?: string;
  children?: RawBookmark[];
}

interface BookmarksFile {
  roots: Record<string, RawBookmark>;
}

function flattenBookmarks(node: RawBookmark, folderPath: string): BookmarkEntry[] {
  const results: BookmarkEntry[] = [];

  if (node.type === "url" && node.url) {
    results.push({
      type: "bookmark",
      id: `bookmark-${node.id}`,
      url: node.url,
      title: node.name || node.url,
      folderPath,
    });
  }

  if (node.children) {
    const childPath = node.name ? `${folderPath}/${node.name}`.replace(/^\//, "") : folderPath;
    for (const child of node.children) {
      results.push(...flattenBookmarks(child, childPath));
    }
  }

  return results;
}

export function loadChromeBookmarks(): BookmarkEntry[] {
  if (!fs.existsSync(CHROME_BOOKMARKS_PATH)) return [];

  const content = fs.readFileSync(CHROME_BOOKMARKS_PATH, "utf-8");
  const data: BookmarksFile = JSON.parse(content);
  const entries: BookmarkEntry[] = [];

  for (const [rootName, rootNode] of Object.entries(data.roots)) {
    if (rootNode && typeof rootNode === "object") {
      entries.push(...flattenBookmarks(rootNode, rootName));
    }
  }

  // Dedup by URL
  const seen = new Set<string>();
  return entries.filter((entry) => {
    if (seen.has(entry.url)) return false;
    seen.add(entry.url);
    return true;
  });
}

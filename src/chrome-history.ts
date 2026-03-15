import { executeSQL } from "@raycast/utils";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { chromeProfilePath } from "./chrome-profile";

export interface HistoryEntry {
  type: "history";
  id: string;
  url: string;
  title: string;
  visitCount: number;
  lastVisitTime: Date;
}

interface HistoryRow {
  id: number;
  url: string;
  title: string;
  visit_count: number;
  last_visit_time: number;
}

// Chrome's timestamp: microseconds since Jan 1, 1601
function chromeTimeToDate(chromeTime: number): Date {
  return new Date(chromeTime / 1000 - 11644473600000);
}

// Unique copy path per source to avoid conflicts between real and demo profiles
function historyCopyPath(historySource: string): string {
  const tag = historySource.replace(/[^a-zA-Z0-9]/g, "_").slice(-40);
  return path.join(os.tmpdir(), `raycast-chrome-history-${tag}.db`);
}

export async function loadChromeHistory(
  profileDir: string,
  limit = 200,
): Promise<HistoryEntry[]> {
  const historySource = chromeProfilePath(profileDir, "History");
  if (!fs.existsSync(historySource)) return [];

  // Copy the DB since Chrome locks it while running (skip if copy is already up-to-date)
  const historyCopy = historyCopyPath(historySource);
  const sourceMtime = fs.statSync(historySource).mtimeMs;
  const copyExists = fs.existsSync(historyCopy);
  const copyMtime = copyExists ? fs.statSync(historyCopy).mtimeMs : 0;
  if (!copyExists || sourceMtime > copyMtime) {
    fs.copyFileSync(historySource, historyCopy);
  }

  const rows = await executeSQL<HistoryRow>(
    historyCopy,
    `SELECT id, url, title, visit_count, last_visit_time
     FROM urls
     WHERE hidden = 0
       AND url NOT LIKE 'chrome-%'
       AND url NOT LIKE 'https://www.google.com/search%'
     ORDER BY last_visit_time DESC
     LIMIT ${limit}`,
  );

  const entries = rows.map((row) => ({
    type: "history" as const,
    id: `history-${row.id}`,
    url: row.url,
    title: row.title || row.url,
    visitCount: row.visit_count,
    lastVisitTime: chromeTimeToDate(row.last_visit_time),
  }));

  // Deduplicate by title: keep only the most recently visited entry per title
  const grouped = entries.reduce<Record<string, HistoryEntry[]>>((acc, entry) => {
    const key = entry.title;
    if (acc[key]) {
      acc[key].push(entry);
    } else {
      acc[key] = [entry];
    }
    return acc;
  }, {});

  return Object.values(grouped).map((group) =>
    group.sort((a, b) => b.lastVisitTime.getTime() - a.lastVisitTime.getTime())[0],
  );
}

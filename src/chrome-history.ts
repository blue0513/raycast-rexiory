import { executeSQL } from "@raycast/utils";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

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

const CHROME_HISTORY_SOURCE = path.join(
  os.homedir(),
  "Library/Application Support/Google/Chrome/Default/History",
);
const CHROME_HISTORY_COPY = path.join(os.tmpdir(), "raycast-chrome-history.db");

// Chrome's timestamp: microseconds since Jan 1, 1601
function chromeTimeToDate(chromeTime: number): Date {
  return new Date(chromeTime / 1000 - 11644473600000);
}

export async function loadChromeHistory(limit = 200): Promise<HistoryEntry[]> {
  if (!fs.existsSync(CHROME_HISTORY_SOURCE)) return [];

  // Copy the DB since Chrome locks it while running
  fs.copyFileSync(CHROME_HISTORY_SOURCE, CHROME_HISTORY_COPY);

  const rows = await executeSQL<HistoryRow>(
    CHROME_HISTORY_COPY,
    `SELECT id, url, title, visit_count, last_visit_time
     FROM urls
     WHERE hidden = 0
       AND url NOT LIKE 'chrome-%'
       AND url NOT LIKE 'https://www.google.com/search%'
     ORDER BY last_visit_time DESC
     LIMIT ${limit}`,
  );

  return rows.map((row) => ({
    type: "history" as const,
    id: `history-${row.id}`,
    url: row.url,
    title: row.title || row.url,
    visitCount: row.visit_count,
    lastVisitTime: chromeTimeToDate(row.last_visit_time),
  }));
}

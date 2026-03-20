import { spawnSync } from "child_process";
import { writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

export interface TabEntry {
  id: string;
  title: string;
  url: string;
  windowIndex: number;
  tabIndex: number;
}

const JXA_SCRIPT = `
const chrome = Application("Google Chrome");
const result = [];
const windows = chrome.windows();
for (let wi = 0; wi < windows.length; wi++) {
  const tabs = windows[wi].tabs();
  for (let ti = 0; ti < tabs.length; ti++) {
    const tab = tabs[ti];
    result.push({
      windowIndex: wi + 1,
      tabIndex: ti + 1,
      title: tab.title() || "",
      url: tab.url() || "",
    });
  }
}
JSON.stringify(result);
`;

// Write once at module load; JXA_SCRIPT is a constant so no need to rewrite.
const SCRIPT_PATH = join(tmpdir(), "raycast-rexiory-tabs.js");
writeFileSync(SCRIPT_PATH, JXA_SCRIPT, "utf8");

export async function loadChromeTabs(): Promise<TabEntry[]> {
  const result = spawnSync("osascript", ["-l", "JavaScript", SCRIPT_PATH], {
    timeout: 5000,
    encoding: "utf8",
  });

  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(result.stderr || `osascript exited with ${result.status}`);

  const raw = JSON.parse(result.stdout.trim()) as Array<{
    windowIndex: number;
    tabIndex: number;
    title: string;
    url: string;
  }>;
  return raw.map((t) => ({
    id: `window-${t.windowIndex}-tab-${t.tabIndex}`,
    title: t.title,
    url: t.url,
    windowIndex: t.windowIndex,
    tabIndex: t.tabIndex,
  }));
}

export async function closeTabScript(
  windowIndex: number,
  tabIndex: number,
): Promise<void> {
  const result = spawnSync(
    "osascript",
    [
      "-e",
      `tell application "Google Chrome"
  close tab ${tabIndex} of window ${windowIndex}
end tell`,
    ],
    { encoding: "utf8" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || `osascript exited with ${result.status}`);
}

export async function switchToTabScript(
  windowIndex: number,
  tabIndex: number,
): Promise<void> {
  const result = spawnSync(
    "osascript",
    [
      "-e",
      `tell application "Google Chrome"
  activate
  set index of window ${windowIndex} to 1
  set active tab index of window ${windowIndex} to ${tabIndex}
end tell`,
    ],
    { encoding: "utf8" },
  );
  if (result.error) throw result.error;
}

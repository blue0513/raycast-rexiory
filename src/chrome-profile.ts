import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const CHROME_BASE = path.join(
  os.homedir(),
  "Library/Application Support/Google/Chrome",
);
const LOCAL_STATE_PATH = path.join(CHROME_BASE, "Local State");

export interface ChromeProfile {
  dirName: string;
  displayName: string;
  isLastUsed: boolean;
}

/** Read Local State and return all profiles with display names. */
export function listChromeProfiles(): ChromeProfile[] {
  try {
    const raw = fs.readFileSync(LOCAL_STATE_PATH, "utf-8");
    const state = JSON.parse(raw);
    const infoCache: Record<string, { name?: string }> =
      state?.profile?.info_cache ?? {};
    const lastUsed: string = state?.profile?.last_used ?? "Default";

    return Object.entries(infoCache).map(([dirName, info]) => ({
      dirName,
      displayName: info?.name || dirName,
      isLastUsed: dirName === lastUsed,
    }));
  } catch {
    return [{ dirName: "Default", displayName: "Default", isLastUsed: true }];
  }
}

export function chromeProfilePath(
  profileDir: string,
  ...segments: string[]
): string {
  return path.join(CHROME_BASE, profileDir, ...segments);
}

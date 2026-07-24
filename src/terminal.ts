import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { getPreferenceValues, open } from "@raycast/api";
import type { Application } from "@raycast/api";

const run = promisify(execFile);

/**
 * Finds the app bundle hosting the running herdr client by walking its
 * process ancestry, e.g. herdr < zsh < login < Ghostty.app. The detached
 * server daemon has no app ancestor and is skipped naturally.
 */
async function detect(): Promise<string | undefined> {
  try {
    const { stdout } = await run("ps", ["-axo", "pid=,ppid=,comm="]);
    const rows = new Map<number, { ppid: number; comm: string }>();
    for (const line of stdout.split("\n")) {
      const m = line.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/);
      if (m) rows.set(+m[1], { ppid: +m[2], comm: m[3] });
    }
    for (const [pid, row] of rows) {
      if (row.comm !== "herdr" && !row.comm.endsWith("/herdr")) continue;
      let cursor: number | undefined = pid;
      for (let hop = 0; cursor && cursor > 1 && hop < 15; hop++) {
        const step = rows.get(cursor);
        if (!step) break;
        const at = step.comm.indexOf(".app/Contents/MacOS");
        if (at >= 0) return step.comm.slice(0, at + 4);
        cursor = step.ppid;
      }
    }
  } catch {
    // ps unavailable or unparsable; skip activation.
  }
  return undefined;
}

/** Activates the terminal app: the preference when set, otherwise the detected host of herdr. */
export async function activate(): Promise<void> {
  const { terminal } = getPreferenceValues<{ terminal?: Application }>();
  const path = terminal?.path || (await detect());
  if (path) await open(path);
}

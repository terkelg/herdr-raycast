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
    const { stdout } = await run("ps", ["-axo", "uid=,pid=,ppid=,comm="]);
    const uid = process.getuid?.();
    const rows = new Map<number, { uid: number; ppid: number; comm: string }>();
    for (const line of stdout.split("\n")) {
      const m = line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/);
      // macOS login can run as root between the user's shell and terminal app.
      if (m && (+m[1] === uid || +m[1] === 0)) rows.set(+m[2], { uid: +m[1], ppid: +m[3], comm: m[4] });
    }
    for (const [pid, row] of rows) {
      if (row.uid !== uid || (row.comm !== "herdr" && !row.comm.endsWith("/herdr"))) continue;
      let cursor: number | undefined = pid;
      for (let hop = 0; cursor && cursor > 1 && hop < 15; hop++) {
        const step = rows.get(cursor);
        if (!step) break;
        const at = step.comm.indexOf(".app/Contents/MacOS");
        if (at >= 0 && step.uid === uid) return step.comm.slice(0, at + 4);
        cursor = step.ppid;
      }
    }
  } catch {
    // ps unavailable or unparsable; skip activation.
  }
  return undefined;
}

export async function activate(): Promise<void> {
  const { terminal } = getPreferenceValues<{ terminal?: Application }>();
  const path = terminal?.path || (await detect());
  if (path) await open(path);
}

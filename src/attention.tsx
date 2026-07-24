import { showHUD } from "@raycast/api";

import { focus, overview } from "./client";
import { activate } from "./terminal";
import { flat, name } from "./ui";

/**
 * Command: jump straight to the agent that needs you. Blocked agents win over
 * done ones; within a state the first by workspace order is picked.
 */
export default async function Command(): Promise<void> {
  try {
    const snaps = await overview();
    const entries = flat(snaps);
    const pick = entries.find((e) => e.state === "blocked") || entries.find((e) => e.state === "done");
    if (!pick) {
      await showHUD(snaps.length ? "No agent needs attention" : "Herdr isn't running");
      return;
    }
    await focus(pick.server, pick.agent);
    await activate();
    await showHUD(`Focused ${name(pick.agent)} · ${pick.state}`);
  } catch (fail) {
    await showHUD(fail instanceof Error ? fail.message : "Herdr isn't running");
  }
}

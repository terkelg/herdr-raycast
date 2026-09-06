import { environment, LaunchType, showHUD, updateCommandMetadata } from "@raycast/api";

import { Offline, focus, overview } from "./client";
import type { Snapshot } from "./client";
import { activate } from "./terminal";
import { flat, name } from "./ui";

/**
 * Command: jump straight to the agent that needs you. Blocked agents win over
 * done ones; within a state the first by workspace order is picked.
 */
export default async function Command(): Promise<void> {
  const background = environment.launchType === LaunchType.Background;
  let snaps: Snapshot[];
  try {
    snaps = await overview();
  } catch (fail) {
    await updateCommandMetadata({ subtitle: fail instanceof Offline ? fail.message : "Status unavailable" });
    if (!background) await showHUD(fail instanceof Error ? fail.message : "Herdr isn't running");
    return;
  }

  const entries = flat(snaps);
  const count = entries.filter((entry) => entry.state === "blocked" || entry.state === "done").length;
  const total = entries.length;
  await updateCommandMetadata({
    subtitle: !snaps.length
      ? "Herdr isn't running"
      : !total
        ? "No agents"
        : `${count} need${count === 1 ? "s" : ""} attention · ${total} agent${total === 1 ? "" : "s"}`,
  });
  // Scheduled runs update root search without focusing an agent or showing feedback.
  if (background) return;

  try {
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

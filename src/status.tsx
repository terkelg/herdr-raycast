import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { Cache, Color, Icon, LaunchType, MenuBarExtra, launchCommand, showHUD } from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { useEffect } from "react";

import { Offline, focus, overview, target } from "./client";
import { activate } from "./terminal";
import { flat, logo, name } from "./ui";
import type { Entry } from "./ui";

const store = new Cache();
const run = promisify(execFile);

/** Shows a macOS notification. */
function notify(subtitle: string, message: string): Promise<unknown> {
  const script = `display notification ${JSON.stringify(message)} with title "Herdr" subtitle ${JSON.stringify(subtitle)}`;
  return run("osascript", ["-e", script]).catch(() => undefined);
}

/** Notifies once per agent that newly turned blocked or done since the last refresh. */
async function alert(entries: Entry[]): Promise<void> {
  const now = entries.filter((e) => e.state === "blocked" || e.state === "done");
  const keys = now.map((e) => `${e.server.session}:${target(e.agent)}:${e.state}`);
  let seen: string[] = [];
  try {
    seen = JSON.parse(store.get("seen") || "[]");
  } catch {
    // Corrupt cache; treat everything as new.
  }
  store.set("seen", JSON.stringify(keys));
  for (const [i, e] of now.entries()) {
    if (seen.includes(keys[i])) continue;
    await notify(`${name(e.agent)} ${e.state === "blocked" ? "needs attention" : "finished"}`, e.where);
  }
}

/** Focuses the agent inside Herdr, then activates the terminal app. */
async function jump(entry: Entry): Promise<void> {
  try {
    await focus(entry.server, entry.agent);
    await activate();
  } catch {
    await showHUD(`Couldn't focus ${name(entry.agent)}`);
  }
}

/** Opens the Browse Agents command. */
async function browse(): Promise<void> {
  try {
    await launchCommand({ name: "agents", type: LaunchType.UserInitiated });
  } catch {
    await showHUD("Couldn't open Browse Agents");
  }
}

/** Menu section for one status bucket, omitted when empty. `full` appends the state to subtitles. */
function Group({ title, entries, full }: { title: string; entries: Entry[]; full?: boolean }) {
  if (!entries.length) return null;
  return (
    <MenuBarExtra.Section title={title}>
      {entries.map((entry, i) => (
        <MenuBarExtra.Item
          key={`${entry.server.session}:${target(entry.agent) || i}`}
          icon={logo(entry.agent)}
          title={name(entry.agent)}
          subtitle={[entry.where, full ? entry.state : ""].filter(Boolean).join(" · ") || undefined}
          tooltip={entry.agent.title || undefined}
          onAction={() => jump(entry)}
        />
      ))}
    </MenuBarExtra.Section>
  );
}

/** Menu bar command surfacing blocked and finished Herdr agents. */
export default function Command() {
  const { data, error, isLoading } = useCachedPromise(overview, [], { keepPreviousData: true });

  useEffect(() => {
    if (data) void alert(flat(data));
  }, [data]);

  if (error instanceof Offline || (data && !data.length)) {
    return (
      <MenuBarExtra icon={Icon.Terminal} isLoading={isLoading}>
        <MenuBarExtra.Item title={(error instanceof Offline && error.message) || "Herdr isn't running"} />
      </MenuBarExtra>
    );
  }

  const entries = flat(data || []);
  const blocked = entries.filter((e) => e.state === "blocked");
  const done = entries.filter((e) => e.state === "done");
  const rest = entries.filter((e) => e.state !== "blocked" && e.state !== "done");
  const count = blocked.length + done.length;

  return (
    <MenuBarExtra
      icon={blocked.length ? { source: Icon.Terminal, tintColor: Color.Red } : Icon.Terminal}
      title={count ? `${count}` : undefined}
      isLoading={isLoading}
    >
      <Group title="Blocked" entries={blocked} />
      <Group title="Done" entries={done} />
      <Group title="Agents" entries={rest} full />
      <MenuBarExtra.Section>
        <MenuBarExtra.Item icon={Icon.List} title="Browse Agents" onAction={browse} />
      </MenuBarExtra.Section>
    </MenuBarExtra>
  );
}

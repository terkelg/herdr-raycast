import { Color, Icon } from "@raycast/api";
import type { Image } from "@raycast/api";

import type { Server, Snapshot } from "./client";
import { STATUSES } from "./types";
import type { Agent, Status } from "./types";

export interface Entry {
  server: Server;
  agent: Agent;
  state: Status;
  where: string;
  tab?: string;
}

/**
 * Flattens snapshots into entries, resolving each agent's location to its
 * workspace and tab labels plus the session name when not the default one.
 */
export function flat(snaps: Snapshot[]): Entry[] {
  // Cached snapshots persisted by older extension versions may lack newer fields.
  return snaps.flatMap((snap) =>
    (snap.agents || []).map((agent) => {
      const label =
        (snap.workspaces || []).find((w) => w.workspace_id === agent.workspace_id)?.label || agent.workspace_id || "";
      const tab = (snap.tabs || []).find((t) => t.tab_id === agent.tab_id)?.label;
      const { session } = snap.server;
      const where = session === "default" ? label : [label, session].filter(Boolean).join(" · ");
      return { server: snap.server, agent, state: status(agent), where, tab };
    }),
  );
}

const BADGES: Record<Status, { source: string; tintColor: Color }> = {
  working: { source: Icon.CircleProgress, tintColor: Color.Blue },
  blocked: { source: Icon.ExclamationMark, tintColor: Color.Red },
  done: { source: Icon.CheckCircle, tintColor: Color.Green },
  idle: { source: "idle.svg", tintColor: Color.SecondaryText },
  unknown: { source: Icon.QuestionMarkCircle, tintColor: Color.SecondaryText },
};

const LOGOS: Record<string, Image.ImageLike> = {
  claude: { source: "agents/claude.svg", tintColor: "#D97757" },
  codex: { source: "agents/openai.svg", tintColor: Color.PrimaryText },
  copilot: { source: "agents/githubcopilot.svg", tintColor: Color.PrimaryText },
  cursor: { source: "agents/cursor.svg", tintColor: Color.PrimaryText },
  kimi: { source: "agents/kimi.svg", tintColor: Color.PrimaryText },
  opencode: { source: "agents/opencode.svg", tintColor: Color.PrimaryText },
};

export function logo(agent: Agent): Image.ImageLike {
  return LOGOS[agent.agent || ""] || Icon.Terminal;
}

export function status(agent: Agent): Status {
  const raw = agent.agent_status as Status;
  return STATUSES.includes(raw) ? raw : "unknown";
}

export function badge(value: Status): { source: string; tintColor: Color } {
  return BADGES[value];
}

export function name(agent: Agent): string {
  return agent.name || agent.display_agent || agent.agent || agent.pane_id || agent.terminal_id || "agent";
}

export function tokens(agent: Agent): string | undefined {
  const parts = Object.entries(agent.tokens || {}).map(([key, value]) => `${key} ${value}`);
  return parts.length ? parts.join(" · ") : undefined;
}

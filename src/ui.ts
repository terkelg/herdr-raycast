import { Color, Icon } from "@raycast/api";
import type { Image } from "@raycast/api";

import type { Server, Snapshot } from "./client";
import { STATUSES } from "./types";
import type { Agent, Status } from "./types";

/** One agent paired with the server that reported it and its rendered location. */
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

const BADGES: Record<Status, { source: Icon; tintColor: Color }> = {
  working: { source: Icon.CircleProgress, tintColor: Color.Blue },
  blocked: { source: Icon.ExclamationMark, tintColor: Color.Red },
  done: { source: Icon.CheckCircle, tintColor: Color.Green },
  idle: { source: Icon.Circle, tintColor: Color.SecondaryText },
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

/** Brand icon for an agent's kind, falling back to a terminal glyph. */
export function logo(agent: Agent): Image.ImageLike {
  return LOGOS[agent.agent || ""] || Icon.Terminal;
}

/** Narrows an agent's wire status to a known Status, defaulting to unknown. */
export function status(agent: Agent): Status {
  const raw = agent.agent_status as Status;
  return STATUSES.includes(raw) ? raw : "unknown";
}

/** Icon and tint representing a status. */
export function badge(value: Status): { source: Icon; tintColor: Color } {
  return BADGES[value];
}

/** Small tinted dot for a rollup status, e.g. a workspace's agent activity. */
export function dot(raw: string | undefined): Image.ImageLike {
  const value = raw as Status;
  return { source: Icon.Dot, tintColor: BADGES[STATUSES.includes(value) ? value : "unknown"].tintColor };
}

/** Display name for an agent: a user-given name wins, then reported and detected identity. */
export function name(agent: Agent): string {
  return agent.name || agent.display_agent || agent.agent || agent.pane_id || agent.terminal_id || "agent";
}

/** Reported state description: title, state label, or the pane's terminal title. */
export function brief(agent: Agent): string | undefined {
  return (
    agent.title ||
    agent.state_labels?.[status(agent)] ||
    agent.terminal_title_stripped ||
    agent.terminal_title ||
    undefined
  );
}

/** Formats the reported tokens map, e.g. "in 12.4k · out 2.1k". */
export function tokens(agent: Agent): string | undefined {
  const parts = Object.entries(agent.tokens || {}).map(([key, value]) => `${key} ${value}`);
  return parts.length ? parts.join(" · ") : undefined;
}

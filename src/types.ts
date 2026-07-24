/**
 * Wire shapes for the Herdr socket API, protocol 17 (herdr 0.7.5), taken from
 * `herdr api schema --json` and live responses.
 *
 * Non-required fields are optional because the protocol is versioned and
 * servers may add or drop fields. Consumers must tolerate missing and unknown
 * fields.
 */

/** Protocol generation this extension was built against. */
export const PROTOCOL = 17;

/** Semantic agent states surfaced by the server. */
export type Status = "idle" | "working" | "blocked" | "done" | "unknown";

/** All known statuses, used to narrow arbitrary wire strings. */
export const STATUSES: readonly Status[] = ["idle", "working", "blocked", "done", "unknown"];

/** Result of `ping`. */
export interface Pong {
  type?: string;
  version?: string;
  protocol?: number;
  capabilities?: Record<string, unknown>;
}

/** Error payload attached to a response envelope. */
export interface Failure {
  code?: string;
  message?: string;
}

/** Resumable agent session reference reported by integrations. */
export interface Resume {
  source?: string;
  agent?: string;
  kind?: string;
  value?: string;
}

/**
 * One agent record from `session.snapshot` / `agent.list` / `agent.get`.
 *
 * `name` comes from agent.rename; `title`, `display_agent`, `state_labels`
 * and `tokens` are integration-reported metadata; `terminal_title` is the
 * pane's OSC title. `launch_pending` and a false `interactive_ready` mark
 * agents whose pane hasn't materialized yet.
 */
export interface Agent {
  terminal_id?: string;
  agent?: string;
  agent_status?: string;
  agent_session?: Resume;
  workspace_id?: string;
  tab_id?: string;
  pane_id?: string;
  focused?: boolean;
  cwd?: string;
  foreground_cwd?: string;
  revision?: number;
  name?: string;
  title?: string;
  display_agent?: string;
  state_labels?: Record<string, string>;
  tokens?: Record<string, string>;
  terminal_title?: string;
  terminal_title_stripped?: string;
  interactive_ready?: boolean;
  launch_pending?: boolean;
}

/** One workspace record from `session.snapshot` / `workspace.list`. */
export interface Workspace {
  workspace_id?: string;
  number?: number;
  label?: string;
  focused?: boolean;
  pane_count?: number;
  tab_count?: number;
  active_tab_id?: string;
  agent_status?: string;
  tokens?: Record<string, string>;
}

/** One tab record from `session.snapshot` / `tab.list`. */
export interface Tab {
  tab_id?: string;
  workspace_id?: string;
  number?: number;
  label?: string;
  focused?: boolean;
  pane_count?: number;
  agent_status?: string;
}

/** One pane record from `session.snapshot` / `pane.list`. */
export interface Pane {
  pane_id?: string;
  terminal_id?: string;
  workspace_id?: string;
  tab_id?: string;
  focused?: boolean;
  cwd?: string;
  foreground_cwd?: string;
  agent?: string;
  agent_status?: string;
  revision?: number;
}

/** One installed agent kind from `server.agent_manifests`. */
export interface Manifest {
  agent?: string;
  source_kind?: string;
  active_version?: string;
}

/** Result of `pane.read`: pane text plus provenance. */
export interface Read {
  pane_id?: string;
  workspace_id?: string;
  tab_id?: string;
  source?: string;
  format?: string;
  text?: string;
  revision?: number;
  truncated?: boolean;
}

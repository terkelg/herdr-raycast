/**
 * Wire shapes for the Herdr socket API, protocol 17 (herdr 0.7.5), taken from
 * `herdr api schema --json` and live responses.
 *
 * Non-required fields are optional because the protocol is versioned and
 * servers may add or drop fields. Consumers must tolerate missing and unknown
 * fields.
 */

export const PROTOCOL = 17;

export type Status = "idle" | "working" | "blocked" | "done" | "unknown";

export const STATUSES: readonly Status[] = ["idle", "working", "blocked", "done", "unknown"];

export interface Failure {
  code?: string;
  message?: string;
}

/** User-assigned names take precedence over integration-reported display names. */
export interface Agent {
  terminal_id?: string;
  agent?: string;
  agent_status?: string;
  workspace_id?: string;
  tab_id?: string;
  pane_id?: string;
  focused?: boolean;
  cwd?: string;
  foreground_cwd?: string;
  name?: string;
  title?: string;
  terminal_title_stripped?: string;
  display_agent?: string;
  tokens?: Record<string, string>;
}

export interface Workspace {
  workspace_id?: string;
  label?: string;
  focused?: boolean;
  pane_count?: number;
  tab_count?: number;
  agent_status?: string;
  tokens?: Record<string, string>;
}

export interface Tab {
  tab_id?: string;
  workspace_id?: string;
  label?: string;
  focused?: boolean;
  pane_count?: number;
  agent_status?: string;
}

export interface Pane {
  pane_id?: string;
  label?: string;
  title?: string;
  terminal_title_stripped?: string;
  display_agent?: string;
  workspace_id?: string;
  tab_id?: string;
  focused?: boolean;
  cwd?: string;
  foreground_cwd?: string;
  agent?: string;
  agent_status?: string;
  tokens?: Record<string, string>;
}

export interface Manifest {
  agent?: string;
}

export interface Read {
  text?: string;
}

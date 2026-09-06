import type { Server, Snapshot } from "./client";
import type { Agent, Pane } from "./types";

export interface Branch {
  server: Server;
  kind: "workspace" | "tab" | "pane";
  id: string;
  label: string;
  state?: string;
  focused?: boolean;
  count?: number;
  inline?: boolean;
  agent?: Agent;
  keywords: string[];
  children: Branch[];
}

/** Keeps each agent in its pane, in the same workspace and tab order as Herdr. */
export function tree(snaps: Snapshot[]): Branch[] {
  return snaps.flatMap(({ server, workspaces = [], tabs = [], panes = [], agents = [] }) => {
    const registry = new Map(agents.filter((agent) => agent.pane_id).map((agent) => [agent.pane_id, agent]));
    const ids = new Set(panes.map((pane) => pane.pane_id));
    // Restored agents can appear before their panes materialize.
    const leaves: Pane[] = [...panes, ...agents.filter((agent) => agent.pane_id && !ids.has(agent.pane_id))];
    return workspaces.map((space): Branch => {
      const id = space.workspace_id || "";
      const label = space.label || id;
      const keywords = [label, id, server.session];
      const children = tabs
        .filter((tab) => tab.workspace_id === id)
        .map((tab): Branch => {
          const id = tab.tab_id || "";
          const label = tab.label || id;
          const words = [...keywords, label, id];
          const children = leaves
            .filter((pane) => pane.tab_id === id)
            .map((pane): Branch => {
              const agent: Agent | undefined = registry.get(pane.pane_id) || (pane.agent ? pane : undefined);
              const label = pane.label || agent?.name || agent?.display_agent || agent?.agent || caption(pane);
              const state = agent?.agent_status || pane.agent_status;
              return {
                server,
                kind: "pane",
                id: pane.pane_id || "",
                label,
                state,
                focused: pane.focused ?? agent?.focused,
                agent,
                keywords: [
                  ...words,
                  label,
                  pane.pane_id,
                  pane.cwd,
                  pane.foreground_cwd,
                  agent?.name,
                  agent?.display_agent,
                  agent?.cwd,
                  agent?.foreground_cwd,
                  agent?.agent,
                  agent ? state : "shell",
                ].filter((word): word is string => !!word),
                children: [],
              };
            });
          return {
            server,
            kind: "tab",
            id,
            label,
            state: tab.agent_status,
            focused: tab.focused,
            count: tab.pane_count ?? children.length,
            keywords: words,
            children,
          };
        });
      return {
        server,
        kind: "workspace",
        id,
        label,
        state: space.agent_status,
        focused: space.focused,
        count: space.pane_count ?? children.reduce((count, tab) => count + (tab.count || 0), 0),
        inline: children.length === 1,
        keywords,
        children,
      };
    });
  });
}

function caption(pane: Pane): string {
  const suffix = pane.pane_id?.split(":p")[1];
  return suffix ? `pane ${suffix}` : pane.pane_id || "pane";
}

/** Filters the tree without losing the parents of a matching pane. */
export function prune(branches: Branch[], query: string, filter: string): Branch[] {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return branches.flatMap((branch) => {
    const children = prune(branch.children, query, filter);
    const matches =
      filter === "all" ||
      filter === `${branch.kind}s` ||
      (branch.kind === "pane" &&
        !!branch.agent &&
        (filter === "agents" ||
          filter === branch.state ||
          (filter === "attention" && (branch.state === "blocked" || branch.state === "done"))));
    const text = branch.keywords.join(" ").toLowerCase();
    if (!children.length && !(matches && words.every((word) => text.includes(word)))) return [];
    return [{ ...branch, children }];
  });
}

export function key(branch: Branch): string {
  return `${branch.server.path}:${branch.kind}:${branch.id}`;
}

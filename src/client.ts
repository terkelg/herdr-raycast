import { createConnection } from "node:net";
import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import { PROTOCOL } from "./types";
import type { Agent, Failure, Manifest, Pane, Read, Tab, Workspace } from "./types";

const BASE = join(homedir(), ".config", "herdr");
const TIMEOUT = 2500;

let seq = 0;

export class Offline extends Error {
  constructor(message = "Herdr isn't running") {
    super(message);
    this.name = "Offline";
  }
}

export class Fault extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "Fault";
    this.code = code;
  }
}

export interface Server {
  session: string;
  path: string;
}

export interface Snapshot {
  server: Server;
  workspaces: Workspace[];
  tabs: Tab[];
  panes: Pane[];
  agents: Agent[];
}

interface Spot {
  workspace?: string;
  cwd?: string;
}

/**
 * Sends one newline-delimited JSON request over the socket at `path` and
 * resolves the response correlated by request id.
 */
export function call<T>(path: string, method: string, params: object = {}): Promise<T> {
  const id = `ray_${++seq}`;
  return new Promise((resolve, reject) => {
    const socket = createConnection(path);
    socket.setEncoding("utf8");
    let buf = "";
    const finish = (act: () => void) => {
      clearTimeout(timer);
      socket.destroy();
      act();
    };
    const timer = setTimeout(() => finish(() => reject(new Offline("Herdr didn't respond"))), TIMEOUT);
    socket.on("connect", () => socket.write(JSON.stringify({ id, method, params }) + "\n"));
    socket.on("error", () => finish(() => reject(new Offline())));
    socket.on("data", (chunk) => {
      buf += chunk;
      let cut;
      while ((cut = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, cut);
        buf = buf.slice(cut + 1);
        let json: { id?: string; result?: T; error?: Failure };
        try {
          json = JSON.parse(line);
        } catch {
          continue;
        }
        // The server echoes an empty id when it rejects an unparseable request.
        if (json.id !== id && json.id) continue;
        const fail = json.error;
        if (fail) return finish(() => reject(new Fault(fail.code || "error", fail.message || "Herdr request failed")));
        return finish(() => resolve((json.result || {}) as T));
      }
    });
  });
}

/**
 * Discovers server sockets (the default one plus `sessions/<name>/herdr.sock`),
 * pings each, and returns the live ones speaking a compatible protocol.
 */
async function servers(): Promise<Server[]> {
  const found = [{ session: "default", path: join(BASE, "herdr.sock") }];
  try {
    for (const entry of await readdir(join(BASE, "sessions"), { withFileTypes: true })) {
      if (entry.isDirectory())
        found.push({ session: entry.name, path: join(BASE, "sessions", entry.name, "herdr.sock") });
    }
  } catch {
    // No named sessions directory yet.
  }
  const pings = await Promise.allSettled(found.map((s) => call<{ protocol?: number }>(s.path, "ping")));
  const live: Server[] = [];
  let stale = 0;
  pings.forEach((res, i) => {
    if (res.status !== "fulfilled") return;
    if ((res.value.protocol || 0) < PROTOCOL) {
      stale++;
      return;
    }
    live.push(found[i]);
  });
  if (!live.length && stale) throw new Offline("Herdr speaks an older protocol. Update Herdr to use this extension.");
  return live;
}

async function snapshot(server: Server): Promise<Snapshot> {
  const res = await call<{
    snapshot?: { workspaces?: Workspace[]; tabs?: Tab[]; panes?: Pane[]; agents?: Agent[] };
  }>(server.path, "session.snapshot");
  const snap = res.snapshot || {};
  return {
    server,
    workspaces: snap.workspaces || [],
    tabs: snap.tabs || [],
    panes: snap.panes || [],
    agents: snap.agents || [],
  };
}

/** Snapshots every reachable server. Empty when Herdr isn't running. */
export async function overview(): Promise<Snapshot[]> {
  return Promise.all((await servers()).map(snapshot));
}

/**
 * Picks the API target for an agent. Pane ids are the reliable choice: they
 * are stable across agent relaunches, and herdr 0.7.5 resolves them to the
 * pane's current live agent while terminal ids fail to resolve at all.
 */
export function target(agent: Agent): string {
  return agent.pane_id || agent.terminal_id || agent.agent || "";
}

export function miss(fail: unknown): boolean {
  return fail instanceof Fault && fail.code.includes("not_found");
}

/**
 * Focuses an agent's pane inside Herdr. Agents restored from a previous run
 * aren't in the live registry until their pane materializes, so agent.focus
 * falls back to pane focus, then workspace and tab focus, which is what
 * materializes them.
 */
export async function focus(server: Server, agent: Agent): Promise<void> {
  try {
    await call(server.path, "agent.focus", { target: target(agent) });
    return;
  } catch (fail) {
    if (!miss(fail)) throw fail;
  }
  if (agent.pane_id) {
    try {
      await call(server.path, "pane.focus", { pane_id: agent.pane_id });
      return;
    } catch (fail) {
      if (!miss(fail)) throw fail;
    }
  }
  if (!agent.workspace_id) throw new Fault("agent_not_found", `${target(agent)} isn't available`);
  await call(server.path, "workspace.focus", { workspace_id: agent.workspace_id });
  if (agent.tab_id) await call(server.path, "tab.focus", { tab_id: agent.tab_id });
}

export function prompt(server: Server, agent: Agent, text: string): Promise<{ type?: string }> {
  return call(server.path, "agent.prompt", { target: target(agent), text });
}

/** Renames an agent inside Herdr; an empty name clears it. */
export function rename(server: Server, agent: Agent, name: string): Promise<{ type?: string }> {
  return call(server.path, "agent.rename", { target: target(agent), name: name || null });
}

export function explain(server: Server, agent: Agent): Promise<Record<string, unknown>> {
  return call(server.path, "agent.explain", { target: target(agent) });
}

export async function read(server: Server, pane: string, lines: number): Promise<Read> {
  const res = await call<{ read?: Read }>(server.path, "pane.read", { pane_id: pane, source: "recent", lines });
  return res.read || {};
}

export async function manifests(server: Server): Promise<Manifest[]> {
  const res = await call<{ manifests?: Manifest[] }>(server.path, "server.agent_manifests");
  return res.manifests || [];
}

export async function start(server: Server, kind: string, spot: Spot): Promise<void> {
  let pane: string | undefined;
  if (spot.workspace) {
    const res = await call<{ root_pane?: Pane }>(server.path, "tab.create", {
      workspace_id: spot.workspace,
      cwd: spot.cwd || null,
      focus: true,
    });
    pane = res.root_pane?.pane_id;
  }
  if (!pane) {
    const res = await call<{ root_pane?: Pane }>(server.path, "workspace.create", {
      cwd: spot.cwd || null,
      focus: true,
    });
    pane = res.root_pane?.pane_id;
  }
  if (!pane) throw new Fault("start_failed", "Couldn't create a pane for the agent");
  await call(server.path, "agent.start", { name: kind, kind, pane_id: pane });
}

export function close(server: Server, kind: "workspace" | "tab" | "pane", id: string): Promise<{ type?: string }> {
  return call(server.path, `${kind}.close`, { [`${kind}_id`]: id });
}

export function relabel(
  server: Server,
  kind: "workspace" | "tab" | "pane",
  id: string,
  label: string,
): Promise<{ type?: string }> {
  return call(server.path, `${kind}.rename`, { [`${kind}_id`]: id, label });
}

export function reveal(server: Server, kind: "workspace" | "tab" | "pane", id: string): Promise<{ type?: string }> {
  return call(server.path, `${kind}.focus`, { [`${kind}_id`]: id });
}

import { basename } from "node:path";

import {
  Action,
  ActionPanel,
  Alert,
  Form,
  Icon,
  Keyboard,
  List,
  Toast,
  closeMainWindow,
  confirmAlert,
  openExtensionPreferences,
  showToast,
  useNavigation,
} from "@raycast/api";
import type { Image } from "@raycast/api";
import { showFailureToast, useForm } from "@raycast/utils";
import { useState } from "react";

import { close, focus, relabel, reveal } from "./client";
import type { Server, Snapshot } from "./client";
import { useSnaps } from "./hooks";
import { activate } from "./terminal";
import { badge, dot, flat, logo, name } from "./ui";
import type { Agent } from "./types";

/** Target kinds the socket API can focus, rename, and close. */
type Kind = "workspace" | "tab" | "pane";

/** Display noun for a row; Agent rows act on their pane and skip rename and close. */
type Noun = "Workspace" | "Tab" | "Pane" | "Agent";

/** One dashboard row: list chrome plus the server target its actions control. */
interface Row {
  server: Server;
  kind: Kind;
  noun: Noun;
  id: string;
  agent?: Agent;
  label: string;
  icon: Image.ImageLike;
  title: string;
  subtitle?: string;
  accessories: List.Item.Accessory[];
  keywords: string[];
}

/** Close-confirmation warning per kind. */
const WARNINGS: Record<Kind, string> = {
  workspace: "All its tabs and panes will be closed.",
  tab: "All its panes will be closed, terminating whatever runs inside them.",
  pane: "Whatever runs inside it will be terminated.",
};

/** Dashboard command: browse workspaces, tabs, panes, and agents across every Herdr server. */
export default function Command() {
  const { snaps, down, empty, isLoading, revalidate } = useSnaps(3000);
  const [show, setShow] = useState("everything");
  /** True when the dropdown filter keeps a section visible. */
  const on = (key: string) => show === "everything" || show === key;
  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Search workspaces, tabs, panes, agents, paths…"
      searchBarAccessory={
        <List.Dropdown tooltip="Show" storeValue onChange={setShow}>
          <List.Dropdown.Item title="Everything" value="everything" />
          <List.Dropdown.Item title="Workspaces" value="workspaces" />
          <List.Dropdown.Item title="Tabs" value="tabs" />
          <List.Dropdown.Item title="Panes" value="panes" />
          <List.Dropdown.Item title="Agents" value="agents" />
        </List.Dropdown>
      }
    >
      {empty ? (
        <List.EmptyView
          icon={Icon.Terminal}
          title={down?.message || "Herdr isn't running"}
          description="Start herdr in a terminal to see your session."
        />
      ) : (
        <>
          {on("workspaces") && <Block title="Workspaces" rows={spaces(snaps)} revalidate={revalidate} />}
          {on("tabs") && <Block title="Tabs" rows={tabs(snaps)} revalidate={revalidate} />}
          {on("panes") && <Block title="Panes" rows={panes(snaps)} revalidate={revalidate} />}
          {on("agents") && <Block title="Agents" rows={agents(snaps)} revalidate={revalidate} />}
        </>
      )}
    </List>
  );
}

/** Workspace rows across all servers, tagging non-default sessions in the title. */
function spaces(snaps: Snapshot[]): Row[] {
  // Cached snapshots persisted by older extension versions may lack newer fields.
  return snaps.flatMap(({ server, workspaces }) =>
    (workspaces || []).map((space): Row => {
      const id = space.workspace_id || "";
      const label = space.label || id;
      const { session } = server;
      return {
        server,
        kind: "workspace",
        noun: "Workspace",
        id,
        label,
        icon: Icon.Folder,
        title: session === "default" ? label : `${label} · ${session}`,
        accessories: [
          { text: `${tally(space.tab_count || 0, "tab")} · ${tally(space.pane_count || 0, "pane")}` },
          ...marks(space.agent_status, space.focused),
        ],
        keywords: [label, id, session].filter(Boolean),
      };
    }),
  );
}

/** Tab rows resolving each tab's workspace label for the subtitle. */
function tabs(snaps: Snapshot[]): Row[] {
  return snaps.flatMap(({ server, workspaces, tabs }) =>
    (tabs || []).map((tab): Row => {
      const id = tab.tab_id || "";
      const label = tab.label || id;
      const space =
        (workspaces || []).find((w) => w.workspace_id === tab.workspace_id)?.label || tab.workspace_id || "";
      return {
        server,
        kind: "tab",
        noun: "Tab",
        id,
        label,
        icon: Icon.AppWindowGrid3x3,
        title: label,
        subtitle: [space, id].filter(Boolean).join(" · "),
        accessories: [{ text: tally(tab.pane_count || 0, "pane") }, ...marks(tab.agent_status, tab.focused)],
        keywords: [label, id, space].filter(Boolean),
      };
    }),
  );
}

/** Pane rows titled by agent kind or working directory, placed by workspace and tab. */
function panes(snaps: Snapshot[]): Row[] {
  return snaps.flatMap(({ server, workspaces, tabs, panes }) =>
    (panes || []).map((pane): Row => {
      const { agent } = pane;
      const id = pane.pane_id || "";
      const path = pane.foreground_cwd || pane.cwd || "";
      const space =
        (workspaces || []).find((w) => w.workspace_id === pane.workspace_id)?.label || pane.workspace_id || "";
      const tab = (tabs || []).find((t) => t.tab_id === pane.tab_id)?.label || pane.tab_id || "";
      const title = agent || (path && basename(path)) || id;
      const extra: List.Item.Accessory[] = agent ? [{ icon: logo({ agent }) }] : [];
      return {
        server,
        kind: "pane",
        noun: "Pane",
        id,
        label: title,
        icon: Icon.Terminal,
        title,
        subtitle: [space, tab].filter(Boolean).join(" › "),
        accessories: [...extra, ...marks(pane.agent_status, pane.focused)],
        keywords: [id, pane.cwd, agent, space, tab].filter((w): w is string => !!w),
      };
    }),
  );
}

/** Agent rows from every server, focusable through their pane. */
function agents(snaps: Snapshot[]): Row[] {
  return flat(snaps).map(({ server, agent, state, where, tab }): Row => {
    const title = name(agent);
    const extra: List.Item.Accessory[] = [{ tag: { value: state, color: badge(state).tintColor } }];
    if (agent.focused) extra.push({ tag: "Focused" });
    return {
      server,
      kind: "pane",
      noun: "Agent",
      id: agent.pane_id || "",
      agent,
      label: title,
      icon: logo(agent),
      title,
      subtitle: [where, tab].filter(Boolean).join(" › "),
      accessories: extra,
      keywords: [title, agent.agent, where, agent.cwd].filter((w): w is string => !!w),
    };
  });
}

/** Pluralizes a count, e.g. "1 tab", "3 tabs". */
function tally(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/** Trailing accessories for workspace, tab, and pane rows: status dot plus a Focused tag. */
function marks(state: string | undefined, focused: boolean | undefined): List.Item.Accessory[] {
  const out: List.Item.Accessory[] = [{ icon: dot(state), tooltip: state }];
  if (focused) out.push({ tag: "Focused" });
  return out;
}

/** One dashboard section, hidden entirely when it has no rows. */
function Block({ title, rows, revalidate }: { title: string; rows: Row[]; revalidate: () => void }) {
  if (!rows.length) return null;
  return (
    <List.Section title={title} subtitle={`${rows.length}`}>
      {rows.map((row, i) => (
        <List.Item
          key={`${row.server.path}:${row.kind}:${row.id || i}`}
          icon={row.icon}
          title={row.title}
          subtitle={row.subtitle}
          accessories={row.accessories}
          keywords={row.keywords}
          actions={<Panel row={row} revalidate={revalidate} />}
        />
      ))}
    </List.Section>
  );
}

/** Shared actions for one row: focus, rename, copy, close, refresh, and preferences. */
function Panel({ row, revalidate }: { row: Row; revalidate: () => void }) {
  const { server, kind, noun, id, label } = row;
  const full = noun !== "Agent";

  /** Focuses the target inside Herdr, activates the terminal app, and closes Raycast. */
  async function act(): Promise<void> {
    try {
      if (row.agent) await focus(server, row.agent);
      else await reveal(server, kind, id);
      await activate();
      await closeMainWindow();
    } catch (fail) {
      await showFailureToast(fail, { title: `Couldn't focus ${noun.toLowerCase()}` });
    }
  }

  /** Asks for confirmation, closes the target, and refreshes the list. */
  async function shut(): Promise<void> {
    const ok = await confirmAlert({
      title: `Close ${kind} ${label}?`,
      message: WARNINGS[kind],
      primaryAction: { title: `Close ${noun}`, style: Alert.ActionStyle.Destructive },
    });
    if (!ok) return;
    try {
      await close(server, kind, id);
      await showToast({ style: Toast.Style.Success, title: `${noun} closed` });
      revalidate();
    } catch (fail) {
      await showFailureToast(fail, { title: `Couldn't close ${noun.toLowerCase()}` });
    }
  }

  return (
    <ActionPanel>
      <Action title={`Focus ${noun}`} icon={Icon.Window} onAction={act} />
      {full && (
        <Action.Push
          title={`Rename ${noun}`}
          icon={Icon.Pencil}
          shortcut={{ modifiers: ["cmd", "shift"], key: "r" }}
          target={<RenameForm row={row} />}
        />
      )}
      {!!id && <Action.CopyToClipboard title="Copy ID" content={id} shortcut={Keyboard.Shortcut.Common.Copy} />}
      {full && (
        <Action
          title={`Close ${noun}`}
          icon={Icon.XMarkCircle}
          style={Action.Style.Destructive}
          shortcut={{ modifiers: ["ctrl"], key: "x" }}
          onAction={shut}
        />
      )}
      <Action
        title="Refresh"
        icon={Icon.ArrowClockwise}
        shortcut={Keyboard.Shortcut.Common.Refresh}
        onAction={revalidate}
      />
      <Action title="Open Extension Preferences" icon={Icon.Gear} onAction={openExtensionPreferences} />
    </ActionPanel>
  );
}

/** Form that renames the row's workspace, tab, or pane label and pops back. */
function RenameForm({ row }: { row: Row }) {
  const { server, kind, noun, id, label } = row;
  const { pop } = useNavigation();
  const { handleSubmit, itemProps } = useForm<{ label: string }>({
    initialValues: { label },
    async onSubmit(values) {
      try {
        await relabel(server, kind, id, values.label.trim());
        await showToast({ style: Toast.Style.Success, title: `${noun} renamed` });
        pop();
      } catch (fail) {
        await showFailureToast(fail, { title: `Couldn't rename ${noun.toLowerCase()}` });
      }
    },
  });
  return (
    <Form
      navigationTitle={`Rename ${noun}`}
      actions={
        <ActionPanel>
          <Action.SubmitForm title={`Rename ${noun}`} icon={Icon.Pencil} onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.TextField title="Label" placeholder={`${noun} label`} {...itemProps.label} />
    </Form>
  );
}

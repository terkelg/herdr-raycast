import {
  Action,
  ActionPanel,
  Alert,
  Color,
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
import { useSnaps } from "./hooks";
import { activate } from "./terminal";
import { key, prune, tree } from "./tree";
import type { Branch } from "./tree";
import { badge, status } from "./ui";

type Kind = Branch["kind"];

type Noun = "Workspace" | "Tab" | "Pane" | "Agent";

const NOUNS: Record<Kind, Noun> = { workspace: "Workspace", tab: "Tab", pane: "Pane" };
const ICONS: Record<Kind, Image.ImageLike> = {
  workspace: { source: "workspace.svg", tintColor: Color.PrimaryText },
  tab: { source: "workspace.svg", tintColor: Color.PrimaryText },
  pane: { source: "terminal.svg", tintColor: Color.PrimaryText },
};

interface Row extends Branch {
  noun: Noun;
}

const WARNINGS: Record<Kind, string> = {
  workspace: "All its tabs and panes will be closed.",
  tab: "All its panes will be closed, terminating whatever runs inside them.",
  pane: "Whatever runs inside it will be terminated.",
};

export default function Command() {
  const { snaps, down, empty, isLoading, revalidate } = useSnaps(3000);
  const [show, setShow] = useState("all");
  const [query, setQuery] = useState("");
  const branches = prune(tree(snaps), query, show);
  const searching = !!query.trim() || show !== "all";

  return (
    <List
      isLoading={isLoading}
      filtering={false}
      searchText={query}
      onSearchTextChange={setQuery}
      searchBarPlaceholder="Search panes…"
      searchBarAccessory={
        <List.Dropdown tooltip="Filter panes" storeValue onChange={setShow}>
          <List.Dropdown.Item title="Everything" value="all" />
          <List.Dropdown.Section title="State">
            <List.Dropdown.Item title="Needs Attention" value="attention" />
            <List.Dropdown.Item title="Blocked" value="blocked" />
            <List.Dropdown.Item title="Working" value="working" />
            <List.Dropdown.Item title="Idle" value="idle" />
            <List.Dropdown.Item title="Done" value="done" />
          </List.Dropdown.Section>
          <List.Dropdown.Section title="Show">
            <List.Dropdown.Item title="Workspaces" value="workspaces" />
            <List.Dropdown.Item title="Tabs" value="tabs" />
            <List.Dropdown.Item title="Panes" value="panes" />
            <List.Dropdown.Item title="Agents" value="agents" />
          </List.Dropdown.Section>
        </List.Dropdown>
      }
    >
      {empty ? (
        <List.EmptyView
          icon={ICONS.pane}
          title={down?.message || "Herdr isn't running"}
          description="Start herdr in a terminal to see your session."
        />
      ) : branches.length ? (
        branches.map((branch) => (
          <Block key={key(branch)} branch={branch} searching={searching} show={show} revalidate={revalidate} />
        ))
      ) : (
        <List.EmptyView
          icon={Icon.MagnifyingGlass}
          title="No matching panes"
          description="Try another search or state."
        />
      )}
    </List>
  );
}

/** Native workspace sections; searching opens the groups to show matching panes. */
function Block({
  branch,
  searching,
  show,
  revalidate,
}: {
  branch: Branch;
  searching: boolean;
  show: string;
  revalidate: () => void;
}) {
  if (show === "workspaces" || !branch.children.length) return <Item branch={branch} revalidate={revalidate} />;

  const session = branch.server.session === "default" ? "" : branch.server.session;
  const title = [branch.label, session].filter(Boolean).join(" · ");
  if (show === "tabs" || (!searching && !branch.inline))
    return (
      <List.Section title={title} subtitle={tally(branch.count)}>
        {branch.children.map((tab) => (
          <Item key={key(tab)} branch={tab} revalidate={revalidate} />
        ))}
      </List.Section>
    );

  return (
    <>
      {branch.children.map((tab) => (
        <List.Section
          key={key(tab)}
          title={title}
          subtitle={[!branch.inline && tab.label, tally(tab.children.length)].filter(Boolean).join(" · ")}
        >
          {tab.children.length ? (
            tab.children.map((pane) => <Item key={key(pane)} branch={pane} revalidate={revalidate} />)
          ) : (
            <Item branch={tab} revalidate={revalidate} />
          )}
        </List.Section>
      ))}
    </>
  );
}

/** Raycast's navigation stack provides the next level of the hierarchy. */
function Browse({ branch }: { branch: Branch }) {
  const { snaps, down, empty, isLoading, revalidate } = useSnaps(3000);
  const workspaces = tree(empty ? [] : snaps);
  const candidates = branch.kind === "workspace" ? workspaces : workspaces.flatMap((space) => space.children);
  const current = candidates.find((item) => key(item) === key(branch));
  const tabs = current?.kind === "workspace" ? current.children : current ? [current] : [];
  return (
    <List
      navigationTitle={branch.label}
      isLoading={isLoading}
      searchBarPlaceholder="Search panes…"
      filtering={{ keepSectionOrder: true }}
    >
      <List.EmptyView icon={ICONS.pane} title={down?.message || "No panes to show"} />
      {tabs.map((tab) => (
        <List.Section key={key(tab)} title={tab.label} subtitle={tally(tab.count)}>
          {tab.children.map((pane) => (
            <Item key={key(pane)} branch={pane} revalidate={revalidate} />
          ))}
        </List.Section>
      ))}
    </List>
  );
}

function tally(count = 0): string {
  return `${count} pane${count === 1 ? "" : "s"}`;
}

function Item({ branch, revalidate }: { branch: Branch; revalidate: () => void }) {
  const { kind, label, count, state, agent, focused, server } = branch;
  const noun = agent ? "Agent" : NOUNS[kind];
  const value = status({ agent_status: state });
  const marker =
    value === "unknown"
      ? { source: Icon.Dot, tintColor: Color.SecondaryText }
      : { ...badge(value), tintColor: value === "idle" ? Color.Green : badge(value).tintColor };
  const accessories: List.Item.Accessory[] = [];
  if (kind !== "pane") accessories.push({ text: tally(count) });
  if (agent)
    accessories.push(
      { text: agent.agent || "agent" },
      { tag: { value: value[0].toUpperCase() + value.slice(1), color: marker.tintColor } },
    );
  else if (kind === "pane") accessories.push({ text: "shell" });
  if (focused) accessories.push({ tag: { value: "Focused", color: Color.Blue }, tooltip: "Focused in Herdr" });
  return (
    <List.Item
      id={key(branch)}
      icon={agent ? { value: marker, tooltip: value } : ICONS[kind]}
      title={label}
      subtitle={kind === "workspace" && server.session !== "default" ? server.session : undefined}
      accessories={accessories}
      keywords={branch.keywords}
      actions={<Panel row={{ ...branch, noun }} revalidate={revalidate} />}
    />
  );
}

function Panel({ row, revalidate }: { row: Row; revalidate: () => void }) {
  const { server, kind, noun, id, label } = row;
  const full = noun !== "Agent";

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
      {kind !== "pane" && (
        <Action.Push title={`Open ${noun}`} icon={Icon.ChevronRight} target={<Browse branch={row} />} />
      )}
      <Action
        title={`Focus ${noun}`}
        icon={Icon.Window}
        shortcut={{ modifiers: ["cmd"], key: "return" }}
        onAction={act}
      />
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

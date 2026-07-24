import {
  Action,
  ActionPanel,
  Alert,
  Clipboard,
  Detail,
  Form,
  Icon,
  Keyboard,
  List,
  LocalStorage,
  Toast,
  closeMainWindow,
  confirmAlert,
  getPreferenceValues,
  showToast,
  useNavigation,
} from "@raycast/api";
import type { Application } from "@raycast/api";
import { FormValidation, showFailureToast, useCachedPromise, useForm, usePromise } from "@raycast/utils";
import { useState } from "react";

import { Offline, close, explain, focus, manifests, miss, prompt, read, rename, start, target } from "./client";
import type { Server, Snapshot } from "./client";
import { usePoll, useSnaps } from "./hooks";
import { activate } from "./terminal";
import { badge, flat, logo, name, status, tokens } from "./ui";
import type { Entry } from "./ui";
import type { Agent, Read, Status } from "./types";

/** Sort weight per status, most urgent first. */
const URGENCY: Record<Status, number> = { blocked: 0, done: 1, working: 2, idle: 3, unknown: 4 };

/** Dropdown value prefix marking a kind filter rather than a status bucket. */
const KIND = "kind:";

/** Manage command: every Herdr agent in one flat list, refreshed every few seconds. */
export default function Command() {
  const { snaps, down, empty, isLoading, revalidate } = useSnaps(3000);
  const [filter, setFilter] = useState("all");

  if (empty)
    return (
      <List isLoading={isLoading}>
        <List.EmptyView
          icon={Icon.Terminal}
          title={down?.message || "Herdr isn't running"}
          description="Start herdr in a terminal to see your agents here."
        />
      </List>
    );

  const entries = flat(snaps).sort(rank);
  const shown = sift(entries, filter);
  const bare = entries.length && !shown.length;
  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Search agents, names, projects, paths…"
      searchBarAccessory={<Filter entries={entries} pick={setFilter} />}
    >
      {bare ? (
        <List.EmptyView title="No matching agents" />
      ) : (
        <>
          {shown.map((entry, i) => (
            <Item key={entry.server.path + (target(entry.agent) || i)} entry={entry} revalidate={revalidate} />
          ))}
          {!!snaps.length && (
            <List.Section title="Actions">
              <List.Item
                icon={Icon.Play}
                title="Start Another Agent"
                actions={
                  <ActionPanel>
                    <Action.Push title="Start Agent" icon={Icon.Play} target={<StartForm snaps={snaps} />} />
                  </ActionPanel>
                }
              />
            </List.Section>
          )}
        </>
      )}
    </List>
  );
}

/** Orders entries by status urgency, then display name. */
function rank(a: Entry, b: Entry): number {
  return URGENCY[a.state] - URGENCY[b.state] || name(a.agent).localeCompare(name(b.agent));
}

/** Applies the dropdown filter: everything, a status bucket, or an agent kind. */
function sift(entries: Entry[], filter: string): Entry[] {
  if (filter === "all") return entries;
  if (filter === "attention") return entries.filter((e) => e.state === "blocked" || e.state === "done");
  if (filter.startsWith(KIND)) return entries.filter((e) => e.agent.agent === filter.slice(KIND.length));
  return entries.filter((e) => e.state === filter);
}

/** Search bar dropdown filtering by status bucket or by the agent kinds present. */
function Filter({ entries, pick }: { entries: Entry[]; pick: (value: string) => void }) {
  const kinds = [...new Set(entries.map((e) => e.agent.agent).filter((k): k is string => !!k))].sort();
  return (
    <List.Dropdown tooltip="Filter" storeValue onChange={pick}>
      <List.Dropdown.Item title="All Agents" value="all" />
      <List.Dropdown.Section title="Status">
        <List.Dropdown.Item title="Needs Attention" value="attention" />
        <List.Dropdown.Item title="Blocked" value="blocked" />
        <List.Dropdown.Item title="Done" value="done" />
        <List.Dropdown.Item title="Working" value="working" />
        <List.Dropdown.Item title="Idle" value="idle" />
      </List.Dropdown.Section>
      <List.Dropdown.Section title="Kind">
        {kinds.map((kind) => (
          <List.Dropdown.Item key={kind} icon={logo({ agent: kind })} title={kind} value={KIND + kind} />
        ))}
      </List.Dropdown.Section>
    </List.Dropdown>
  );
}

/** One agent row with its location breadcrumb, status accessories, and actions. */
function Item({ entry, revalidate }: { entry: Entry; revalidate: () => void }) {
  const { agent, state, where, tab } = entry;
  const crumb = [where, tab].filter(Boolean).join(" › ");
  const count = tokens(agent);
  const extra: List.Item.Accessory[] = [];
  if (count) extra.push({ text: count, tooltip: "Tokens" });
  extra.push({ tag: { value: state, color: badge(state).tintColor } });
  if (agent.focused) extra.push({ tag: "Focused" });
  const words = [agent.agent, name(agent), where, tab, agent.cwd, state, agent.pane_id].filter((w): w is string => !!w);
  return (
    <List.Item
      icon={{ value: logo(agent), tooltip: agent.agent || "agent" }}
      title={{ value: name(agent), tooltip: agent.cwd || null }}
      subtitle={crumb || undefined}
      accessories={extra}
      keywords={words}
      actions={
        <ActionPanel>
          <Jump entry={entry} />
          <More entry={entry} revalidate={revalidate} />
        </ActionPanel>
      }
    />
  );
}

/** Primary action: focus the agent's pane in Herdr and switch to the terminal app. */
function Jump({ entry }: { entry: Entry }) {
  const { terminal } = getPreferenceValues<{ terminal?: Application }>();
  return (
    <Action
      title={terminal ? `Open in ${terminal.name}` : "Open in Terminal"}
      icon={terminal ? { fileIcon: terminal.path } : Icon.Window}
      onAction={() => jump(entry.server, entry.agent)}
    />
  );
}

/** Secondary actions shared by agent rows and the output detail. */
function More({ entry, revalidate }: { entry: Entry; revalidate: () => void }) {
  const { server, agent } = entry;
  const pane = agent.pane_id;
  return (
    <>
      <Action.Push
        title="Send Prompt"
        icon={Icon.Message}
        shortcut={{ modifiers: ["cmd", "shift"], key: "p" }}
        target={<PromptForm server={server} agent={agent} />}
      />
      <Action.Push
        title="View Live Output"
        icon={Icon.Eye}
        shortcut={Keyboard.Shortcut.Common.Open}
        target={<OutputDetail entry={entry} />}
      />
      <Action.Push
        title="Rename Agent"
        icon={Icon.Pencil}
        shortcut={{ modifiers: ["cmd", "shift"], key: "r" }}
        target={<RenameForm server={server} agent={agent} />}
      />
      <Action.Push
        title="Explain State"
        icon={Icon.Info}
        shortcut={Keyboard.Shortcut.Common.Edit}
        target={<ExplainDetail server={server} agent={agent} />}
      />
      {pane && <Action.CopyToClipboard title="Copy Pane ID" content={pane} shortcut={Keyboard.Shortcut.Common.Copy} />}
      <Action
        title="Refresh"
        icon={Icon.ArrowClockwise}
        shortcut={Keyboard.Shortcut.Common.Refresh}
        onAction={revalidate}
      />
      {pane && (
        <ActionPanel.Section title="Control">
          <Action
            title="Close Pane"
            icon={Icon.XMarkCircle}
            style={Action.Style.Destructive}
            shortcut={{ modifiers: ["ctrl"], key: "x" }}
            onAction={() => shut(server, pane).then(revalidate)}
          />
        </ActionPanel.Section>
      )}
    </>
  );
}

/** Focuses the agent inside Herdr, activates the terminal app, and closes Raycast. */
async function jump(server: Server, agent: Agent): Promise<void> {
  try {
    await focus(server, agent);
    await activate();
    await closeMainWindow();
  } catch (fail) {
    await showFailureToast(fail, { title: "Couldn't focus agent" });
  }
}

/** Confirms and closes a pane, terminating the agent running in it. */
async function shut(server: Server, pane: string): Promise<void> {
  const ok = await confirmAlert({
    title: `Close pane ${pane}?`,
    message: "The agent running in it will be terminated.",
    primaryAction: { title: "Close Pane", style: Alert.ActionStyle.Destructive },
  });
  if (!ok) return;
  try {
    await close(server, "pane", pane);
    await showToast({ style: Toast.Style.Success, title: "Pane closed" });
  } catch (fail) {
    await showFailureToast(fail, { title: "Couldn't close pane" });
  }
}

/** Live pane output for one agent, refreshed every couple of seconds. */
function OutputDetail({ entry }: { entry: Entry }) {
  const { server, agent, state, where, tab } = entry;
  const pane = agent.pane_id;
  const count = tokens(agent);
  const { isLoading, data, error, revalidate } = usePoll(
    () => (pane ? read(server, pane, 100) : Promise.resolve(undefined)),
    2000,
    [server.path, pane || ""],
  );
  return (
    <Detail
      isLoading={isLoading}
      navigationTitle={name(agent)}
      markdown={body(pane, data, error)}
      metadata={
        <Detail.Metadata>
          <Detail.Metadata.TagList title="Status">
            <Detail.Metadata.TagList.Item text={state} color={badge(state).tintColor} />
          </Detail.Metadata.TagList>
          {agent.agent && <Detail.Metadata.Label title="Kind" text={agent.agent} />}
          {where && <Detail.Metadata.Label title="Workspace" text={where} />}
          {tab && <Detail.Metadata.Label title="Tab" text={tab} />}
          <Detail.Metadata.Label title="Session" text={server.session} />
          {pane && <Detail.Metadata.Label title="Pane" text={pane} />}
          {agent.cwd && <Detail.Metadata.Label title="Directory" text={agent.cwd} />}
          {count && <Detail.Metadata.Label title="Tokens" text={count} />}
        </Detail.Metadata>
      }
      actions={
        <ActionPanel>
          <Jump entry={entry} />
          <More entry={entry} revalidate={revalidate} />
        </ActionPanel>
      }
    />
  );
}

/** Renders the freshest pane text as markdown, or a friendly notice. */
function body(pane: string | undefined, data: Read | undefined, error: Error | undefined): string {
  if (!pane) return "This agent has no pane to read.";
  if (error instanceof Offline) return "Herdr isn't running.";
  if (error) return "No output available. The pane isn't live right now.";
  const text = (data?.text || "").trimEnd();
  return text ? fence(text) : "No output yet.";
}

/** Wraps text in a fenced code block whose fence outruns any backtick run inside. */
function fence(text: string): string {
  const runs = text.match(/`+/g) || [];
  const longest = runs.reduce((n, run) => Math.max(n, run.length), 0);
  const ticks = "`".repeat(Math.max(4, longest + 1));
  return `${ticks}text\n${text}\n${ticks}`;
}

/** LocalStorage key holding sent prompts as a JSON array, newest first. */
const HISTORY = "history";

/** One remembered prompt. */
interface Past {
  text: string;
  agent: string;
  at: number;
}

/** Loads the stored prompt history, newest first; a corrupt store reads as empty. */
async function past(): Promise<Past[]> {
  try {
    return JSON.parse((await LocalStorage.getItem<string>(HISTORY)) || "[]");
  } catch {
    return [];
  }
}

/** Records a sent prompt, dropping consecutive duplicates and capping at 50 entries. */
async function record(text: string, agent: string): Promise<void> {
  const list = [{ text, agent, at: Date.now() }, ...(await past())]
    .filter((e, i, all) => !i || e.text !== all[i - 1].text)
    .slice(0, 50);
  await LocalStorage.setItem(HISTORY, JSON.stringify(list));
}

/** Form that sends one prompt to the agent, with clipboard paste and history recall. */
function PromptForm({ server, agent }: { server: Server; agent: Agent }) {
  const { pop } = useNavigation();
  const { handleSubmit, itemProps, setValue, values } = useForm<{ text: string }>({
    validation: { text: FormValidation.Required },
    async onSubmit({ text }) {
      try {
        await prompt(server, agent, text);
        await record(text, name(agent));
        await showToast({ style: Toast.Style.Success, title: "Prompt sent" });
        pop();
      } catch (fail) {
        await showFailureToast(miss(fail) ? new Error("The agent isn't live in Herdr right now") : fail, {
          title: "Couldn't send prompt",
        });
      }
    },
  });

  /** Appends the clipboard text to the prompt, on a new line when text is already present. */
  async function paste(): Promise<void> {
    const clip = await Clipboard.readText();
    if (clip) setValue("text", values.text ? `${values.text}\n${clip}` : clip);
  }

  return (
    <Form
      navigationTitle={`Prompt ${name(agent)}`}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Send Prompt" icon={Icon.Message} onSubmit={handleSubmit} />
          <Action
            title="Paste Clipboard"
            icon={Icon.Clipboard}
            shortcut={{ modifiers: ["cmd", "shift"], key: "v" }}
            onAction={paste}
          />
          <Action.Push
            title="History"
            icon={Icon.Clock}
            shortcut={{ modifiers: ["cmd", "shift"], key: "p" }}
            target={<History pick={(text) => setValue("text", text)} />}
          />
        </ActionPanel>
      }
    >
      <Form.TextArea title="Prompt" placeholder="What should the agent do next?" {...itemProps.text} />
      <Form.Description text="⌘⏎ sends · ⌘⇧P opens history · ⌘⇧V pastes the clipboard" />
    </Form>
  );
}

/** Recently sent prompts; selecting one hands its text back to the prompt form. */
function History({ pick }: { pick: (text: string) => void }) {
  const { pop } = useNavigation();
  const { isLoading, data } = usePromise(past);
  return (
    <List isLoading={isLoading} navigationTitle="Prompt History">
      <List.EmptyView icon={Icon.Clock} title="No prompts sent yet." />
      {(data || []).map((item, i) => (
        <List.Item
          key={i}
          title={item.text.split("\n")[0].slice(0, 80)}
          subtitle={item.agent}
          accessories={[{ text: new Date(item.at).toLocaleString() }]}
          actions={
            <ActionPanel>
              <Action
                title="Use Prompt"
                icon={Icon.ArrowLeftCircle}
                onAction={() => {
                  pick(item.text);
                  pop();
                }}
              />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}

/** Form that renames the agent inside Herdr; an empty name clears it. */
function RenameForm({ server, agent }: { server: Server; agent: Agent }) {
  const { pop } = useNavigation();
  const { handleSubmit, itemProps } = useForm<{ name: string }>({
    initialValues: { name: agent.name || "" },
    async onSubmit(values) {
      const text = values.name.trim();
      try {
        await rename(server, agent, text);
        await showToast({ style: Toast.Style.Success, title: text ? "Agent renamed" : "Name cleared" });
        pop();
      } catch (fail) {
        await showFailureToast(miss(fail) ? new Error("The agent isn't live in Herdr right now") : fail, {
          title: "Couldn't rename agent",
        });
      }
    },
  });
  return (
    <Form
      navigationTitle={`Rename ${name(agent)}`}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Rename Agent" icon={Icon.Pencil} onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.TextField title="Name" placeholder="Leave empty to clear" {...itemProps.name} />
    </Form>
  );
}

/** Server diagnostics explaining how the agent's state was detected. */
function ExplainDetail({ server, agent }: { server: Server; agent: Agent }) {
  const { isLoading, data, error } = usePromise(explain, [server, agent]);
  let md = `${name(agent)} is **${status(agent)}**.`;
  if (error instanceof Offline) md = "Herdr isn't running.";
  else if (error) md = "Herdr couldn't explain this agent right now.";
  else if (data) md += "\n\n```json\n" + JSON.stringify(data, null, 2) + "\n```";
  return <Detail isLoading={isLoading} navigationTitle={`Explain ${name(agent)}`} markdown={md} />;
}

/** Form that starts a new agent in a fresh workspace or as a new tab in an existing one. */
function StartForm({ snaps }: { snaps: Snapshot[] }) {
  const { pop } = useNavigation();
  const first = snaps[0].server;
  const { isLoading, data } = useCachedPromise(manifests, [first]);
  const kinds = (data || []).map((m) => m.agent).filter((k): k is string => !!k);

  const spots = new Map<string, { server: Server; workspace: string; label: string }>();
  snaps.forEach((snap, i) => {
    for (const space of snap.workspaces) {
      if (!space.workspace_id) continue;
      spots.set(`${i}:${space.workspace_id}`, {
        server: snap.server,
        workspace: space.workspace_id,
        label: space.label || space.workspace_id,
      });
    }
  });

  /** Starts the chosen kind at the chosen spot, then pops back. */
  async function submit(values: { kind: string; dir: string[]; where: string }): Promise<void> {
    const dest = spots.get(values.where);
    try {
      await start(dest?.server || first, values.kind, { workspace: dest?.workspace, cwd: values.dir[0] });
      await showToast({ style: Toast.Style.Success, title: `Starting ${values.kind}` });
      pop();
    } catch (fail) {
      await showFailureToast(fail, { title: "Couldn't start agent" });
    }
  }

  return (
    <Form
      isLoading={isLoading}
      navigationTitle="Start Agent"
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Start Agent" icon={Icon.Play} onSubmit={submit} />
        </ActionPanel>
      }
    >
      <Form.Dropdown id="kind" title="Agent">
        {kinds.map((kind) => (
          <Form.Dropdown.Item key={kind} value={kind} title={kind} icon={logo({ agent: kind })} />
        ))}
      </Form.Dropdown>
      <Form.FilePicker
        id="dir"
        title="Directory"
        canChooseDirectories
        canChooseFiles={false}
        allowMultipleSelection={false}
      />
      <Form.Dropdown id="where" title="Where">
        <Form.Dropdown.Item value="new" title="New Workspace" />
        {[...spots.entries()].map(([key, dest]) => (
          <Form.Dropdown.Item key={key} value={key} title={`New tab in ${dest.label}`} />
        ))}
      </Form.Dropdown>
    </Form>
  );
}

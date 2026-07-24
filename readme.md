# Herdr for Raycast

Browse and control [Herdr](https://herdr.dev) agent sessions from Raycast.

## Commands

- **Manage Agents**: a flat, searchable list of every agent across your Herdr sessions, with brand icons, `Workspace › Tab` breadcrumbs, tokens, and colored status tags (blocked red, done green, working blue). A filter dropdown narrows to needs-attention, a single status, or an agent kind. Selecting an agent focuses its pane in Herdr and activates your terminal. More actions: send a prompt (with prompt history and paste-from-clipboard), view live pane output, rename the agent, copy the pane id, explain how Herdr detected its state, and close the pane. A Start Another Agent item launches any installed agent kind into a new workspace or a new tab.
- **Dashboard**: workspaces, tabs, panes, and agents in one browser with counts, activity dots, and focused markers. Focus any of them and copy ids; workspaces, tabs, and panes can also be renamed and closed (agents are renamed and closed through Manage Agents).
- **Focus Attention Agent**: a no-view command that jumps straight to the agent that needs you, blocked first, then done. Give it a global hotkey.
- **Agent Status**: menu bar count of agents needing attention, blocked plus done (done means finished and unseen, so it works like an unread badge). Click an agent to focus it. The background refresh also fires a macOS notification whenever an agent newly turns blocked or done.

## How it talks to Herdr

Newline-delimited JSON over the local socket at `~/.config/herdr/herdr.sock`, plus any named sessions discovered under `~/.config/herdr/sessions/*/herdr.sock`. The client pings every socket first and checks the protocol version before using it. When no server responds, every command shows a friendly "Herdr isn't running" state.

Built against socket protocol 17 (herdr 0.7.5), with shapes taken from `herdr api schema --json`. Bootstrap uses `session.snapshot` and prompting uses `agent.prompt`. Agents restored from a previous run aren't in the live registry until their pane materializes, so focusing falls back from `agent.focus` to `pane.focus`, then workspace plus tab focus. Starting an agent composes `workspace.create` or `tab.create` with `agent.start`.

## Preferences

- **Terminal App**: optional override. By default the extension detects the app hosting your running herdr client (by walking its process ancestry) and activates that, so it follows you between terminals. Set this only to force a specific app.

## Development

```
npm install
npm run dev
```

# Herdr for Raycast

> Browse and control [Herdr](https://herdr.dev) agent sessions from Raycast.

Requires macOS, Raycast 2.2 or newer, and Herdr 0.7.5 or newer. Install Node.js 22.22.2 or newer for setup.

## Setup

```sh
git clone https://github.com/terkelg/herdr-raycast.git
cd herdr-raycast
npm install
npm run dev
```

Keep Herdr running. The extension finds default and named local sessions automatically.

## Usage

- **Manage Agents** searches, focuses, prompts, inspects, renames, starts, and closes agents.
- **Dashboard** groups tabs and panes into workspace sections. Open a tab to browse its panes; single-tab workspaces show their panes directly. Search or filter by state to find panes across workspaces. Press Enter to open a group or focus a pane, or ⌘↵ to focus any item in Herdr. Rename and close non-agent items from the action menu.
- **Focus Attention Agent** jumps to a blocked agent, then a finished one. Assign it a global hotkey for quick access.
- **Agent Status** shows agents needing attention in the menu bar and notifies you when they become blocked or finish.

Set **Terminal App** in the extension preferences only if you want to override automatic terminal detection.

Raycast stores your last 50 sent prompts and caches recent output and session details locally.

## Contributing

Run `npm run lint` and `npm run build` before submitting changes.

## License

[MIT](LICENSE)

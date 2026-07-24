# Herdr for Raycast

> Browse and control [Herdr](https://herdr.dev) agent sessions from Raycast.

Requires macOS, Raycast, and Herdr 0.7.5 or newer.

## Setup

```sh
npm install
npm run dev
```

Keep Herdr running. The extension finds default and named local sessions automatically.

## Usage

- **Manage Agents** searches, focuses, prompts, inspects, renames, starts, and closes agents.
- **Dashboard** browses workspaces, tabs, panes, and agents. Focus any item, or rename and close non-agent items.
- **Focus Attention Agent** jumps to a blocked agent, then a finished one. Assign it a global hotkey for quick access.
- **Agent Status** shows agents needing attention in the menu bar and notifies you when they become blocked or finish.

Set **Terminal App** in the extension preferences only if you want to override automatic terminal detection.

## Contributing

Run `npm run lint` and `npm run build` before submitting changes.

## License

[MIT](LICENSE)

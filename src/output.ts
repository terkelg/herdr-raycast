import { Offline } from "./client";
import type { Read } from "./types";

export function body(pane: string | undefined, data: Read | undefined, error: Error | undefined): string {
  if (!pane) return "This pane isn't available.";
  if (error instanceof Offline) return "Herdr isn't running.";
  if (error) return "No output available. The pane isn't live right now.";
  const text = (data?.text || "").trimEnd();
  if (!text) return "No output yet.";

  // Terminal output can contain Markdown, including code fences of its own.
  const runs = text.match(/`+/g) || [];
  const longest = runs.reduce((n, run) => Math.max(n, run.length), 0);
  const ticks = "`".repeat(Math.max(4, longest + 1));
  return `${ticks}text\n${text}\n${ticks}`;
}

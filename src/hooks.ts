import { showFailureToast, useCachedPromise } from "@raycast/utils";
import { useEffect, useRef } from "react";

import { Offline, overview } from "./client";
import type { Snapshot } from "./client";

/**
 * useCachedPromise that also revalidates every `ms` milliseconds while
 * mounted, so views stay fresh without event subscriptions.
 *
 * The persisted cache is keyed by function source plus `keys`, so pass keys
 * whenever one call site renders for different targets; instances would
 * otherwise share a slot and bleed each other's cached data. Errors are left
 * entirely to callers instead of the library's per-failure toast.
 * Keep `ms` above the client's socket timeout; revalidation discards earlier
 * requests, so faster polling can prevent timeout errors from reaching the UI.
 */
export function usePoll<T>(fn: () => Promise<T>, ms: number, keys: string[] = []) {
  const state = useCachedPromise(
    async (...deps: string[]) => {
      void deps;
      return fn();
    },
    [fn.toString(), ...keys],
    {
      keepPreviousData: true,
      onError: async () => {},
    },
  );
  const { revalidate } = state;
  useEffect(() => {
    const timer = setInterval(() => {
      void revalidate();
    }, ms);
    return () => clearInterval(timer);
  }, [revalidate, ms]);
  return state;
}

/**
 * Overview poll shared by the browsing commands: snapshots, the Offline error
 * when Herdr is down, a combined friendly-empty flag, and one failure toast
 * per error streak instead of one per poll.
 */
export function useSnaps(ms: number): {
  snaps: Snapshot[];
  down?: Offline;
  empty: boolean;
  isLoading: boolean;
  revalidate: () => void;
} {
  const { isLoading, data, error, revalidate } = usePoll(overview, ms);
  const last = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!error) {
      last.current = undefined;
      return;
    }
    if (error instanceof Offline || error.message === last.current) return;
    last.current = error.message;
    void showFailureToast(error, { title: "Herdr request failed" });
  }, [error]);
  const down = error instanceof Offline ? error : undefined;
  const empty = !!down || (data ? !data.length : !!error);
  return { snaps: data || [], down, empty, isLoading, revalidate };
}

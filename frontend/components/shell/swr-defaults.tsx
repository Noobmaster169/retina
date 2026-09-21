"use client";

import { SWRConfig } from "swr";
import type { ReactNode } from "react";

/**
 * What every poll on every screen does when nothing says otherwise.
 *
 * There was no such thing before, so SWR's own defaults applied everywhere,
 * and two of them cost real requests across the tunnel to the backend.
 *
 * `revalidateOnFocus` refetches every mounted key the moment the window is
 * focused. On a run page that is three requests for coming back to the tab,
 * on the gate three more, and during a demo, where a person moves between a
 * terminal and the browser constantly, it is a burst every time. Nothing here
 * is stale enough for it to matter: the screens that show movement already
 * poll on a timer, and the ones that do not are reads of things that change
 * when somebody edits them, which is a write this session made and already
 * revalidates. Off.
 *
 * `dedupingInterval` is what makes two components asking for one thing cost
 * one request. It defaults to two seconds, which is shorter than anything here
 * polls: `/api/runs` is read by the rail on every page and by the runs table,
 * under one key with two timers, and at two seconds both got through. Five
 * seconds collapses them and is still under every interval that matters.
 *
 * `errorRetryCount` is SWR's exponential retry on a failed read. Five attempts
 * per failing key is how a tunnel that has gone away turns one dead screen
 * into a stream of requests. Two is enough to ride out a restart; the screens
 * that matter are polling anyway, so the next tick is the real retry.
 */
export function SwrDefaults({ children }: { children: ReactNode }) {
  return (
    <SWRConfig
      value={{
        revalidateOnFocus: false,
        dedupingInterval: 5000,
        errorRetryCount: 2,
        // A reconnect is a real reason to doubt what is on screen, unlike a
        // focus, and it happens once rather than every time a window is used.
        revalidateOnReconnect: true,
      }}
    >
      {children}
    </SWRConfig>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";

import { RunQueuesView } from "@/lib/api/queues-schemas";
import { RunSummary } from "@/lib/api/runs-schemas";

/**
 * A run's progress, over one connection.
 *
 * The page used to poll `/api/runs/:id` and `/api/runs/:id/queues` every two
 * seconds each, which is a request a second for as long as a tab was open, and
 * every one of them crossed the tunnel to the box. This holds one stream: the
 * reads still happen on a tick, but on the server's side of that tunnel, and
 * only what changed is sent.
 *
 * `EventSource` would be the obvious way and is the wrong one here: it cannot
 * be aborted cleanly on unmount and it reconnects on its own schedule, which
 * is the behaviour being replaced. A plain fetch gives the body as a stream, an
 * `AbortController` that a navigation can actually cancel, and reconnection
 * this file decides.
 *
 * When the stream cannot be held at all, the page is not left frozen: `stale`
 * goes true and the caller polls slowly instead. That is the fallback and not
 * the design, so it is deliberately slower than the old poll was.
 */

/** After this many failures in a row the stream is judged unavailable and the caller falls back. */
const GIVE_UP_AFTER = 3;

/** A closed stream is reopened after this, backing off with each failure. Cheap, because it is one request. */
const RETRY_MS = 2000;
const RETRY_CAP_MS = 30_000;

export interface RunLive {
  summary: RunSummary | null;
  queues: RunQueuesView | null;
  /** True when no stream could be held, so the caller should poll instead. */
  stale: boolean;
}

export function useRunLive(id: string, watch: boolean): RunLive {
  const [summary, setSummary] = useState<RunSummary | null>(null);
  const [queues, setQueues] = useState<RunQueuesView | null>(null);
  const [stale, setStale] = useState(false);
  // The run that is finished has nothing more to say, and reconnecting to hear
  // it say so again is the poll this replaced.
  const finished = useRef(false);

  useEffect(() => {
    if (!watch) return;
    finished.current = false;
    const control = new AbortController();
    let failures = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;

    async function hold(): Promise<void> {
      const response = await fetch(`/api/runs/${id}/stream`, {
        headers: { accept: "text/event-stream" },
        signal: control.signal,
      });
      if (!response.ok || !response.body) throw new Error(`stream answered ${response.status}`);
      failures = 0;
      setStale(false);
      for await (const frame of frames(response.body)) {
        if (frame.event === "summary") {
          const parsed = RunSummary.safeParse(frame.data);
          if (parsed.success) setSummary(parsed.data);
        } else if (frame.event === "queues") {
          const parsed = RunQueuesView.safeParse(frame.data);
          if (parsed.success) setQueues(parsed.data);
        } else if (frame.event === "done" || frame.event === "gone") {
          finished.current = true;
        }
      }
    }

    function again(): void {
      if (control.signal.aborted || finished.current) return;
      // The platform cuts a long stream, which arrives here as a clean end.
      // That is not a failure and is reconnected from at once.
      const wait = Math.min(RETRY_MS * 2 ** Math.max(0, failures - 1), RETRY_CAP_MS);
      retry = setTimeout(() => void attempt(), wait);
    }

    async function attempt(): Promise<void> {
      try {
        await hold();
        again();
      } catch (error) {
        if (control.signal.aborted) return;
        failures += 1;
        if (failures >= GIVE_UP_AFTER) setStale(true);
        void error;
        again();
      }
    }

    void attempt();
    return () => {
      control.abort();
      if (retry) clearTimeout(retry);
    };
  }, [id, watch]);

  return { summary, queues, stale };
}

interface Frame {
  event: string;
  data: unknown;
}

/**
 * The stream's frames, as they arrive.
 *
 * Server-sent events are blank-line separated blocks of `field: value`. Only
 * the two fields this protocol uses are read; anything else, including the
 * comments a proxy may inject, is skipped rather than guessed at.
 */
async function* frames(body: ReadableStream<Uint8Array>): AsyncGenerator<Frame> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let at = buffer.indexOf("\n\n");
      while (at >= 0) {
        const block = buffer.slice(0, at);
        buffer = buffer.slice(at + 2);
        const frame = parse(block);
        if (frame) yield frame;
        at = buffer.indexOf("\n\n");
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function parse(block: string): Frame | null {
  let event = "";
  let data = "";
  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) data += line.slice(5).trim();
  }
  if (!event || !data) return null;
  try {
    return { event, data: JSON.parse(data) as unknown };
  } catch {
    return null;
  }
}

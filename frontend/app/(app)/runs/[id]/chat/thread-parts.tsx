"use client";

import { PendingBody } from "@/components/chat/pending-body";
import { StatusLine } from "@/components/chat/status-line";
import type { ChatToolCall } from "@/lib/api/chat-agent-schemas";
import type { ChatProgress } from "@/lib/api/chat-thread-schemas";

/**
 * The two pieces of the thread that are not a turn: a turn still in flight,
 * and the page before any conversation has been opened. Here so chat-page.tsx
 * stays under the line rule and reads as the thread it lays out.
 */

/**
 * A turn in flight, in the order it happens: what it is doing, what it has
 * looked at, and the answer as it is written.
 *
 * The calls are open here and folded away once the turn is done, because they
 * are the only thing to read during the wait and the wrong thing to read after
 * it. The skeleton lasts only until the first words do: once the model is
 * writing, the prose is what stands for the wait, and the person can start
 * reading it seconds before it is finished.
 */
export function Pending({ progress, calls, since }: { progress: ChatProgress | null; calls: ChatToolCall[]; since: number }) {
  return (
    <div className="space-y-3">
      <StatusLine progress={progress} since={since} />
      <PendingBody progress={progress} calls={calls} />
    </div>
  );
}

export function Empty({ onNew }: { onNew(): void }) {
  return (
    <div className="mx-auto max-w-[560px] pt-16 text-center">
      <h1 className="font-display text-display font-normal tracking-[-0.01em]">Ask Retina</h1>
      <p className="mt-1 text-body text-ink-tertiary">
        A conversation that reads the whole model and answers from it, with the query it ran shown under every answer.
      </p>
      <button
        type="button"
        onClick={onNew}
        className="mt-5 h-9 rounded-md bg-ink px-4 text-strong font-medium text-ink-inverse"
      >
        Start a conversation
      </button>
    </div>
  );
}

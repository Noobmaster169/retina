"use client";

import type { ChatProgress } from "@/lib/api/chat-thread-schemas";

import { StatusLine } from "./status-line";

/**
 * The dock's pinned wait line.
 *
 * In the narrow harness the thread scrolls away under a long answer, so a
 * status that lives only in the scroll reads as hung: the box says Reading and
 * nothing moves. This sits above the context strip and the composer, where a
 * person is already looking while they wait.
 */
export function PendingFoot({ progress, since }: { progress: ChatProgress | null; since: number }) {
  return (
    <div className="shrink-0 border-t border-hairline bg-surface px-[18px] py-2" aria-live="polite" aria-busy="true">
      <StatusLine progress={progress} since={since} />
    </div>
  );
}

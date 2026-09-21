import type { ChatToolCall } from "@/lib/api/chat-agent-schemas";
import type { ChatProgress } from "@/lib/api/chat-thread-schemas";

import { LiveCalls } from "./live-calls";
import { Markdown } from "./markdown";
import { withoutUnfinishedLink } from "./mention";

/**
 * A turn in flight, without the status line.
 *
 * The dock pins that line in `pending-foot.tsx` so it stays above the composer
 * while the thread scrolls. The wide page keeps both together in `Pending`.
 */
export function PendingBody({ progress, calls }: { progress: ChatProgress | null; calls: ChatToolCall[] }) {
  return (
    <div className="space-y-3">
      <LiveCalls calls={calls} />
      {progress?.answer ? (
        <Markdown text={withoutUnfinishedLink(progress.answer)} />
      ) : (
        <>
          <div className="h-4 w-2/3 animate-pulse rounded-xs bg-sunken" />
          <div className="h-4 w-1/2 animate-pulse rounded-xs bg-sunken" />
        </>
      )}
    </div>
  );
}

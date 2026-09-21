import type { ChatToolCall } from "@/lib/api/chat-agent-schemas";

/**
 * What the turn has looked at so far, while it is still looking.
 *
 * Open, and in the order it happened, because during the wait this is the only
 * thing there is to read and watching it is how a person decides whether the
 * agent understood them. The moment the answer lands it is gone, and the same
 * calls are under the answer inside `Working`, folded away: mid-turn it is the
 * content, afterwards it is the evidence.
 *
 * Each row is a call that actually finished and is already a row in
 * `core.chat_turns`, so nothing here is a guess about what is happening.
 */

/** Enough of a query to recognise it. The whole of it is under the answer once the turn is done. */
const SQL_LINES = 6;

function clamp(sql: string): string {
  const lines = sql.trim().split("\n");
  if (lines.length <= SQL_LINES) return lines.join("\n");
  return [...lines.slice(0, SQL_LINES), `... ${lines.length - SQL_LINES} more lines`].join("\n");
}

export function LiveCalls({ calls }: { calls: ChatToolCall[] }) {
  if (calls.length === 0) return null;

  return (
    <ol className="max-w-[72ch] space-y-2 border-l-2 border-hairline-strong pl-3">
      {calls.map((call, index) => (
        <li key={`${call.tool}-${index}`} className="space-y-1">
          <div className="flex items-baseline gap-2">
            <span
              className={`inline-flex h-[18px] shrink-0 items-center rounded-xs px-1.5 font-mono text-[10px] ${
                call.ok ? "bg-active text-ink-secondary" : "bg-differ-tint text-differ"
              }`}
            >
              {call.tool}
            </span>
            <span className="min-w-0 grow truncate text-caption text-ink-faint">{call.thought || call.preview}</span>
            <span className="shrink-0 font-mono text-mono-xs text-ink-faint">{call.durationMs} ms</span>
          </div>
          {call.sql ? (
            <pre className="overflow-x-auto rounded-xs bg-sunken px-2 py-1.5 font-mono text-[10.5px] leading-4 text-ink-tertiary">
              <code>{clamp(call.sql)}</code>
            </pre>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

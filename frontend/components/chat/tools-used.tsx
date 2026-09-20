import type { ChatToolCall } from "@/lib/api/chat-agent-schemas";

/**
 * Every tool the agent called on this turn, with the sentence it gave for
 * reaching for each one.
 *
 * Collapsed, because the SQL and the rows are already above and this is the
 * working rather than the answer. A call that failed is in here too: an agent
 * that tried a wrong column, read the error and corrected itself is more
 * trustworthy than one that appears to have got it right first time, and
 * hiding the failure would be hiding the part that shows it is reading.
 */

export function ToolsUsed({ calls }: { calls: ChatToolCall[] }) {
  const failed = calls.filter((call) => !call.ok).length;
  return (
    <details className="rounded-lg border border-hairline">
      <summary className="flex h-9 cursor-pointer list-none items-center gap-2 px-3.5 text-small text-ink-tertiary marker:hidden">
        <span>
          Tools used, {calls.length}
          {failed > 0 ? `, ${failed} refused and retried` : ""}
        </span>
        <span className="grow" />
        <span className="font-mono text-mono-xs text-ink-faint">
          {calls.reduce((sum, call) => sum + call.durationMs, 0)} ms
        </span>
      </summary>
      <ol className="border-t border-hairline">
        {calls.map((call, index) => (
          <li key={`${call.tool}-${index}`} className="border-b border-hairline-faint px-3.5 py-2.5 last:border-0">
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex h-[18px] shrink-0 items-center rounded-xs px-1.5 font-mono text-[10px] ${
                  call.ok ? "bg-active text-ink-secondary" : "bg-differ-tint text-differ"
                }`}
              >
                {call.tool}
              </span>
              <span className="min-w-0 truncate text-small text-ink-secondary">{call.preview}</span>
              <span className="grow" />
              <span className="shrink-0 font-mono text-mono-xs text-ink-faint">{call.durationMs} ms</span>
            </div>
            {call.thought ? <p className="mt-1 text-caption leading-[17px] text-ink-faint">{call.thought}</p> : null}
            {call.sql ? (
              <pre className="mt-1.5 overflow-x-auto rounded-xs bg-sunken px-2 py-1.5 font-mono text-[10.5px] leading-4 text-ink-tertiary">
                <code>{call.sql}</code>
              </pre>
            ) : null}
          </li>
        ))}
      </ol>
    </details>
  );
}

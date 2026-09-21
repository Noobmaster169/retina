import type { ChatTurn } from "@/lib/api/chat-agent-schemas";

import { Reading } from "./reading";
import { SqlBlock } from "./sql-block";
import { ToolsUsed } from "./tools-used";

/**
 * How the answer was arrived at, folded away.
 *
 * All of it is kept, because an answer nobody can check is worth less than one
 * they can, and the queries are the check. What changed is that it is no longer
 * in the way: a result set printed under every answer reads as a dump, and the
 * reader has to find the sentence again among its own evidence.
 *
 * So the prose says the number and this says where it came from, one click
 * away: how the question was read, the queries with the rows they returned, and
 * every call including the ones that failed.
 */

function counted(count: number, one: string, many: string): string | null {
  if (count === 0) return null;
  return `${count} ${count === 1 ? one : many}`;
}

export function Working({ turn }: { turn: ChatTurn }) {
  const queries = turn.toolCalls.filter((call) => call.sql !== null);
  const read = turn.reading !== "" || turn.skillsUsed.length > 0 || turn.semantic.length > 0;
  if (!read && turn.toolCalls.length === 0) return null;

  const summary = [counted(queries.length, "query", "queries"), counted(turn.toolCalls.length, "call", "calls")]
    .filter((part): part is string => part !== null)
    .join(", ");
  const earlier = turn.sqlUsed.length - queries.length;

  return (
    <details className="max-w-[72ch] rounded-lg border border-hairline">
      <summary className="flex h-9 cursor-pointer list-none items-center gap-2 px-3.5 text-small text-ink-tertiary marker:hidden">
        <span>Working{summary ? `: ${summary}` : ""}</span>
      </summary>
      <div className="space-y-3 border-t border-hairline px-3.5 py-3">
        <Reading turn={turn} />
        {queries.map((call, index) => (
          <SqlBlock key={`${call.sql}-${index}`} sql={call.sql as string} result={call.result} />
        ))}
        {earlier > 0 ? (
          <p className="text-caption text-ink-faint">
            {earlier} earlier {earlier === 1 ? "query is" : "queries are"} under Tools used.
          </p>
        ) : null}
        {turn.toolCalls.length > 0 ? <ToolsUsed calls={turn.toolCalls} /> : null}
      </div>
    </details>
  );
}

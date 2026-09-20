import type { ChatTurn } from "@/lib/api/chat-agent-schemas";

import { ActionCard } from "./action-card";
import { ResultGraph } from "./result-graph";
import { SqlBlock } from "./sql-block";
import { ToolsUsed } from "./tools-used";

/**
 * One turn.
 *
 * An answer is four artefacts in a fixed order: what it touched, what it said,
 * what it ran, and what came back. The prose is the shortest of the four on
 * purpose. A reader can check the other three, and the sentence is only there
 * to say what they mean.
 */

export function Turn({ turn, exhausted = false }: { turn: ChatTurn; exhausted?: boolean }) {
  if (turn.role === "user") {
    return (
      <div className="flex justify-end">
        <p className="max-w-[70%] rounded-lg rounded-tr-xs bg-ink px-3.5 py-2.5 text-strong leading-[21px] text-ink-inverse">
          {turn.content}
        </p>
      </div>
    );
  }

  // The SQL a tool ran is shown with the rows it returned, so the query and
  // its answer are never a scroll apart.
  const queries = turn.toolCalls.filter((call) => call.sql !== null);

  return (
    <div className="space-y-3">
      {turn.graph ? <ResultGraph graph={turn.graph} /> : null}

      <p className="max-w-[72ch] text-body leading-[21px] whitespace-pre-wrap text-ink">{turn.content}</p>

      {exhausted ? (
        <p className="rounded-md border border-differ-line bg-differ-tint px-3 py-2 text-small text-differ-ink">
          The agent ran out of steps before it finished. What it did find is below.
        </p>
      ) : null}

      {queries.map((call, index) => (
        <SqlBlock key={`${call.sql}-${index}`} sql={call.sql as string} result={call.result} />
      ))}

      {turn.sqlUsed.length > queries.length ? (
        <p className="text-caption text-ink-faint">
          {turn.sqlUsed.length - queries.length} earlier{" "}
          {turn.sqlUsed.length - queries.length === 1 ? "query is" : "queries are"} under Tools used.
        </p>
      ) : null}

      {turn.proposal ? <ActionCard proposal={turn.proposal} /> : null}
      {turn.toolCalls.length > 0 ? <ToolsUsed calls={turn.toolCalls} /> : null}
    </div>
  );
}

"use client";

import type { ChatTurn } from "@/lib/api/chat-agent-schemas";

import { ActionCard } from "./action-card";
import { Clarify } from "./clarify";
import { NextMoves } from "./next-moves";
import { OutcomeLine } from "./outcome-line";
import { Markdown } from "./markdown";
import { Reading } from "./reading";
import { ResultGraph } from "./result-graph";
import { SqlBlock } from "./sql-block";
import { ToolsUsed } from "./tools-used";

/**
 * One turn.
 *
 * An answer is artefacts in a fixed order: what it touched, how it read the
 * question, what it said, where it looked, what it ran, what came back, and
 * what to ask next. The prose is the shortest of them on purpose. A reader can
 * check the others, and the sentence is only there to say what they mean.
 */

export function Turn({
  turn,
  exhausted = false,
  onAsk,
  answered = false,
}: {
  turn: ChatTurn;
  exhausted?: boolean;
  /** Sends a chip's question, or a clarifying option, as the next message. */
  onAsk?(question: string): void;
  /** True when a later turn exists, so this turn's question has been overtaken. */
  answered?: boolean;
}) {
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

      <Reading turn={turn} />

      <Markdown text={turn.content} />

      <OutcomeLine turn={turn} />

      {turn.clarify && onAsk ? <Clarify clarify={turn.clarify} onAnswer={onAsk} answered={answered} /> : null}

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

      {onAsk ? <NextMoves moves={turn.next} onAsk={onAsk} disabled={answered} /> : null}
    </div>
  );
}

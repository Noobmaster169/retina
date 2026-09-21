"use client";

import type { ChatTurn } from "@/lib/api/chat-agent-schemas";

import { ActionCard } from "./action-card";
import { Clarify } from "./clarify";
import { EmailDraftCard } from "./email-draft-card";
import { NextMoves } from "./next-moves";
import { OutcomeLine } from "./outcome-line";
import { Markdown } from "./markdown";
import { ResultGraph } from "./result-graph";
import { Working } from "./working";

/**
 * One turn.
 *
 * What is on the page is the answer: the graph of what the question touched,
 * the prose, the reply it drafted from that where one exists, how it ended,
 * and what to ask next. How it got there is real and is kept, one click down,
 * in `Working`.
 *
 * That order is the point. A reader who trusts the answer reads what is above
 * `Working`; a reader who does not can open every query and every call and
 * check it. Putting the evidence above the sentence served neither of them.
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

  return (
    <div className="space-y-3">
      {turn.graph ? <ResultGraph graph={turn.graph} /> : null}

      <Markdown text={turn.content} />

      {turn.emailDraft ? <EmailDraftCard draft={turn.emailDraft} /> : null}

      <OutcomeLine turn={turn} />

      {turn.clarify && onAsk ? <Clarify clarify={turn.clarify} onAnswer={onAsk} answered={answered} /> : null}

      {exhausted ? (
        <p className="rounded-md border border-differ-line bg-differ-tint px-3 py-2 text-small text-differ-ink">
          The agent ran out of steps before it finished. What it did find is below.
        </p>
      ) : null}

      {turn.proposal ? <ActionCard proposal={turn.proposal} /> : null}

      <Working turn={turn} />

      {onAsk ? <NextMoves moves={turn.next} onAsk={onAsk} disabled={answered} /> : null}
    </div>
  );
}

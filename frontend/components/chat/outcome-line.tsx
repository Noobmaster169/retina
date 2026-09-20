import type { ChatTurn } from "@/lib/api/chat-agent-schemas";

/**
 * Where it looked, above an answer that found nothing or found part of it.
 *
 * "None" is a true answer and a nearly useless one on its own: without this
 * line a reader cannot tell "there are none" from "it did not look there". The
 * places are the agent's own words for them, checked as a claim before the
 * turn was stored, so an answer that says `none_found` and lists nowhere never
 * reaches this component.
 *
 * Drawn in the review tone rather than an error one. Nothing has gone wrong.
 */

export function OutcomeLine({ turn }: { turn: ChatTurn }) {
  if (turn.checked.length === 0) return null;
  if (turn.outcome !== "none_found" && turn.outcome !== "partial") return null;

  return (
    <p className="max-w-[72ch] rounded-md border border-review-line bg-review-tint px-3 py-2 text-small leading-[19px] text-ink-secondary">
      <span className="font-medium text-ink">
        {turn.outcome === "none_found" ? "Nothing found." : "Part of it."}
      </span>{" "}
      Looked in: {turn.checked.join(", ")}.
    </p>
  );
}

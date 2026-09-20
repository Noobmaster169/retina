"use client";

import type { ClarifyingQuestion } from "@/lib/api/chat-agent-schemas";

/**
 * The question the agent asked back, and the readings it offered.
 *
 * Each option is a candidate its tools actually returned, so choosing one is
 * choosing between things that exist rather than between guesses. Clicking
 * sends the option's own words as the next message, which is what the
 * conversation's memory then reads as the choice that was made.
 *
 * Disabled once the conversation has moved on: a question already answered is
 * still worth reading, and pressing it again would ask the same thing twice.
 */

export function Clarify({
  clarify,
  onAnswer,
  answered,
}: {
  clarify: ClarifyingQuestion;
  onAnswer(option: string): void;
  answered: boolean;
}) {
  return (
    <div className="max-w-[72ch] rounded-md border border-hairline bg-sunken px-3 py-2.5">
      <p className="text-small leading-[19px] text-ink">{clarify.question}</p>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {clarify.options.map((option) => (
          <li key={option}>
            <button
              type="button"
              disabled={answered}
              onClick={() => onAnswer(option)}
              className="rounded-sm border border-hairline bg-canvas px-2.5 py-1.5 text-left text-caption text-ink-secondary hover:bg-active disabled:cursor-not-allowed disabled:text-ink-faint"
            >
              {option}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

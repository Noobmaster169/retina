"use client";

import type { ChatNextMove } from "@/lib/api/chat-agent-schemas";

/**
 * What to ask next, as chips under the answer.
 *
 * A chip's `prompt` is the whole question, so clicking one is the same as
 * typing it: no route, no new state, and the answer it gets is an ordinary turn
 * with its own working shown. Alternatives come first with the number that was
 * read for them, then follow-ups.
 *
 * The count on a chip was checked against what the tools returned before the
 * turn was stored, so every number here was read on that turn. The `inference`
 * mark says the opposite thing about the choice: that the model's own knowledge
 * picked this one, which is the only part of the answer the database did not
 * supply.
 */

function Mark() {
  return (
    <span
      title="Chosen by the model's own knowledge, not by the data. The number is still read from the database."
      className="shrink-0 rounded-xs border border-hairline px-1 font-mono text-[10px] text-ink-faint"
    >
      inference
    </span>
  );
}

export function NextMoves({ moves, onAsk, disabled = false }: { moves: ChatNextMove[]; onAsk(prompt: string): void; disabled?: boolean }) {
  if (moves.length === 0) return null;
  // Alternatives first: a thing that is there beats another question about what is not.
  const ordered = [...moves].sort((a, b) => Number(a.kind === "follow_up") - Number(b.kind === "follow_up"));

  return (
    <ul className="flex max-w-[72ch] flex-wrap gap-1.5">
      {ordered.map((move) => (
        <li key={move.prompt}>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onAsk(move.prompt)}
            title={move.prompt}
            className="flex items-center gap-1.5 rounded-sm border border-hairline bg-surface px-2.5 py-1.5 text-left text-caption text-ink-secondary hover:bg-active disabled:cursor-not-allowed disabled:text-ink-faint"
          >
            <span className="truncate">{move.label}</span>
            {move.count !== null ? (
              <span className="shrink-0 border-l border-hairline pl-1.5 font-mono text-mono-xs text-ink">{move.count}</span>
            ) : null}
            {move.basis === "general_knowledge" ? <Mark /> : null}
          </button>
        </li>
      ))}
    </ul>
  );
}

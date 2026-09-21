"use client";

/**
 * The starter questions a page offers, for a conversation with nothing in it.
 *
 * Its own component and not part of the composer, because in the dock the
 * `Reading` strip sits between the thread and the question box, and a starter
 * belongs above what it will be sent with: you read what is offered, then what
 * goes with it, then you type. Inside the composer they were the wrong side of
 * that line.
 */
export function Suggestions({
  items,
  onAsk,
  dense = false,
}: {
  items: string[];
  onAsk(question: string): void;
  /** The dock's narrower gutter. */
  dense?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <ul className={`flex flex-wrap gap-1.5 pb-2.5 pt-1 ${dense ? "px-[18px]" : "px-6"}`}>
      {items.map((item) => (
        <li key={item}>
          <button
            type="button"
            onClick={() => onAsk(item)}
            className="rounded-sm bg-sunken px-2.5 py-1.5 text-left text-caption text-ink-secondary hover:bg-active"
          >
            {item}
          </button>
        </li>
      ))}
    </ul>
  );
}

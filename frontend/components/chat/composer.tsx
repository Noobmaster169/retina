"use client";

import { useEffect, useRef, useState } from "react";

import { Icon } from "@/components/ui/icons";

/**
 * The question box, and the elapsed seconds while an answer is coming.
 *
 * No streaming (`docs/01-product.md` section 7 puts it out of scope), so a
 * pending turn has nothing to show but time passing. A counter is better than
 * a spinner here: eight model calls through a proxy that serves half a request
 * a second is a genuinely long wait, and a person who can see it is at 40
 * seconds knows the difference between slow and stuck.
 */

interface ComposerProps {
  onAsk(question: string): void;
  pending: boolean;
  suggestions: string[];
  placeholder: string;
}

export function Composer({ onAsk, pending, suggestions, placeholder }: ComposerProps) {
  const [text, setText] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const field = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!pending) return;
    const started = Date.now();
    const tick = () => setElapsed(Math.round((Date.now() - started) / 1000));
    // The zero-delay timeout is what puts the counter back to 0 for a new
    // wait. Setting it straight from the effect body would be a render
    // cascade; from a callback it is one ordinary update, and it lands before
    // anyone could read the previous wait's number.
    const first = setTimeout(tick, 0);
    const every = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(every);
    };
  }, [pending]);

  function ask(question: string): void {
    const asked = question.trim();
    if (!asked || pending) return;
    setText("");
    onAsk(asked);
    field.current?.focus();
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        ask(text);
      }}
      className="border-t border-hairline px-6 py-3"
    >
      {suggestions.length > 0 && !pending ? (
        <ul className="mb-2.5 flex flex-wrap gap-1.5">
          {suggestions.map((suggestion) => (
            <li key={suggestion}>
              <button
                type="button"
                onClick={() => ask(suggestion)}
                className="rounded-sm bg-sunken px-2.5 py-1.5 text-left text-caption text-ink-secondary hover:bg-active"
              >
                {suggestion}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex items-end gap-2 rounded-lg border border-hairline-strong bg-canvas px-3 py-2.5">
        <label htmlFor="chat-question" className="sr-only">
          Ask a question
        </label>
        <textarea
          id="chat-question"
          ref={field}
          rows={1}
          value={text}
          disabled={pending}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            // Enter asks; shift-enter is a new line, which a question with a
            // pasted id or a list sometimes needs.
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              ask(text);
            }
          }}
          placeholder={pending ? `Reading, ${elapsed} s` : placeholder}
          className="max-h-32 min-h-[22px] grow resize-none bg-transparent text-strong leading-[22px] text-ink outline-none placeholder:text-ink-faint disabled:cursor-wait"
        />
        <button
          type="submit"
          disabled={pending || text.trim().length === 0}
          aria-label="Ask"
          className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-md bg-ink disabled:bg-active"
        >
          <Icon name="send" size={13} className={pending || !text.trim() ? "text-ink-faint" : "text-ink-inverse"} />
        </button>
      </div>
    </form>
  );
}

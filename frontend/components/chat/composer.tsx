"use client";

import { useRef, useState } from "react";

import { Icon } from "@/components/ui/icons";

import { MAX_PICKED, SkillChips, SkillMenu, useSkillCards } from "./skill-picker";
import { slashFilter } from "./slash";
import { useDictation } from "./use-dictation";

/**
 * The question box: what to ask, which skills to ask it with, and how to stop.
 *
 * The elapsed counter that used to live here has moved into the live steps,
 * where the clock sits on the step actually running. What is left here while a
 * turn is in flight is the one control that matters then, which is Stop.
 */

interface ComposerProps {
  onAsk(question: string, skills: string[]): void;
  onStop(): void;
  pending: boolean;
  suggestions: string[];
  placeholder: string;
  /** The dock's narrower gutter. */
  dense?: boolean;
  /**
   * Whether this box is docked against the foot of the page, which is what the
   * rule along its top belongs to. Centred in an empty conversation it is a
   * card floating in the middle, and a rule there would draw a line across
   * nothing. Defaults to docked, which is where it spends most of its life.
   */
  seam?: boolean;
}

export function Composer({ onAsk, onStop, pending, suggestions, placeholder, dense = false, seam = true }: ComposerProps) {
  const [text, setText] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const field = useRef<HTMLTextAreaElement>(null);
  const cards = useSkillCards();

  // Each settled phrase is appended to whatever is already typed, so speaking
  // and typing are the same question and not two. The engine is the browser's
  // own: use-dictation.ts says why there is no service behind it.
  const dictation = useDictation((heard) => {
    setText((was) => (was.trim() ? `${was.replace(/\s+$/, "")} ${heard}` : heard));
    field.current?.focus();
  });

  // The menu opens on a `/` that starts the question, and the word after it
  // filters. Anywhere else a slash is an ordinary character, because a question
  // can contain a date or a path. The rule is in slash.ts, with its edges.
  const slash = slashFilter(text);
  const menuOpen = slash !== null && !pending && picked.length < MAX_PICKED;

  function ask(question: string): void {
    const asked = question.trim();
    if (!asked || pending) return;
    setText("");
    onAsk(asked, picked);
    setPicked([]);
    field.current?.focus();
  }

  function pick(name: string): void {
    setPicked((was) => (was.includes(name) ? was : [...was, name]));
    setText("");
    field.current?.focus();
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        ask(text);
      }}
      className={`py-3 ${seam ? "border-t border-hairline" : "mx-auto w-full max-w-[720px]"} ${dense ? "px-[18px]" : "px-6"}`}
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

      {menuOpen ? <SkillMenu cards={cards} filter={slash} onPick={pick} /> : null}
      <SkillChips picked={picked} onRemove={(name) => setPicked((was) => was.filter((item) => item !== name))} />

      {/* What the engine has heard but not settled on. Faint, because it is
          about to be replaced by the words it becomes, and above the field so
          it never pushes the caret around mid sentence. */}
      {dictation.listening ? (
        <p className="mb-1.5 flex items-center gap-2 text-caption text-ink-tertiary" aria-live="polite">
          <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-signal" />
          <span className="truncate">{dictation.interim || "Listening"}</span>
        </p>
      ) : null}
      {dictation.error ? (
        <p role="alert" className="mb-1.5 text-caption text-fault">
          {dictation.error}
        </p>
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
              if (menuOpen) return;
              ask(text);
            }
          }}
          placeholder={pending ? "Reading" : placeholder}
          className="max-h-32 min-h-[22px] grow resize-none bg-transparent text-strong leading-[22px] text-ink outline-none placeholder:text-ink-faint disabled:cursor-wait"
        />

        {dictation.supported && !pending ? (
          <button
            type="button"
            onClick={dictation.listening ? dictation.stop : dictation.start}
            aria-label={dictation.listening ? "Stop dictating" : "Dictate the question"}
            aria-pressed={dictation.listening}
            className={`flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-md border transition-colors duration-150 ${
              dictation.listening
                ? "border-signal bg-signal-tint text-signal"
                : "border-hairline-strong bg-canvas text-ink-tertiary hover:text-ink"
            }`}
          >
            <Icon name="mic" size={13} />
          </button>
        ) : null}

        {pending ? (
          <button
            type="button"
            onClick={onStop}
            aria-label="Stop"
            className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-md border border-hairline-strong bg-canvas hover:bg-active"
          >
            <span aria-hidden="true" className="h-2 w-2 rounded-xs bg-ink" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={text.trim().length === 0}
            aria-label="Ask"
            className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-md bg-ink disabled:bg-active"
          >
            <Icon name="send" size={13} className={text.trim() ? "text-ink-inverse" : "text-ink-faint"} />
          </button>
        )}
      </div>
    </form>
  );
}

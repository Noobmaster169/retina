"use client";

import { useEffect, useRef, useState } from "react";

import { clockName, runName } from "@/components/shell/run-name";
import { RunSummary } from "@/lib/api/runs-schemas";

/**
 * The run's name, edited where it is shown. Click it, type, click away: there
 * is no pencil, no dialog and no save button, because the only thing a person
 * does to a name is change it and any of those is a step between them and
 * doing it.
 *
 * It has to look editable before it is touched, which a bare heading does not,
 * so it carries a hover and focus surface the way a field does and nothing
 * else. It is a `contenteditable` rather than an input because the title is
 * Newsreader at display size, and an input would either have to be measured
 * against the text or reserve a width the name never fills.
 *
 * Emptying it is how a name is taken back: the run is named by when it started
 * again, which is what the placeholder was showing all along.
 */

interface RunTitleProps {
  run: RunSummary;
  /** Writes the new name and returns the run as the API left it. */
  onRename: (name: string) => Promise<void>;
}

export function RunTitle({ run, onRename }: RunTitleProps) {
  const field = useRef<HTMLHeadingElement>(null);
  const [editing, setEditing] = useState(false);
  const shown = runName(run);

  // The poll rewrites `run` every two seconds, so the field's text is only
  // ever set from outside while nobody is typing into it.
  useEffect(() => {
    if (editing || !field.current) return;
    if (field.current.textContent !== shown) field.current.textContent = shown;
  }, [editing, shown]);

  async function commit() {
    setEditing(false);
    const typed = (field.current?.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
    if (field.current) field.current.textContent = typed.length > 0 ? typed : clockName(run);
    // An unnamed run shows its clock name, so typing that same name back means
    // "leave it unnamed" rather than "pin today's wording onto it forever".
    const wanted = typed === clockName(run) ? "" : typed;
    if (wanted === (run.name ?? "")) return;
    await onRename(wanted);
  }

  return (
    <h1
      ref={field}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      tabIndex={0}
      spellCheck={false}
      aria-label="Run name, editable"
      title="Click to rename"
      onFocus={() => setEditing(true)}
      onBlur={() => void commit()}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          field.current?.blur();
        }
        if (event.key === "Escape") {
          event.preventDefault();
          if (field.current) field.current.textContent = shown;
          setEditing(false);
          field.current?.blur();
        }
      }}
      className={`-mx-2 inline-block max-w-[42ch] whitespace-nowrap rounded-md px-2 py-0.5 font-display text-display font-normal tracking-[-0.01em] transition-colors duration-150 hover:bg-sunken focus:bg-sunken ${
        // Cut at rest, scrollable while typing: the caret has to stay in view
        // past the width, and an ellipsis cannot follow it.
        editing ? "overflow-x-auto" : "overflow-hidden text-ellipsis"
      }`}
    >
      {shown}
    </h1>
  );
}

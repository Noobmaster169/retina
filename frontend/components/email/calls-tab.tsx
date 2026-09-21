"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";

import { Chip, Fact } from "@/components/ui/chip";
import { EvidenceWell } from "@/components/ui/marked-span";
import type { LlmCall } from "@/lib/api/trace-schemas";
import { panel } from "@/lib/motion";

import { readCall } from "./call-reading";

/**
 * Every model call made for this email, oldest first, on one rule.
 *
 * A timeline because the calls are a sequence and the order is the argument:
 * the email was sorted, then each file was named, then each was read, then the
 * seven fields were judged.
 *
 * One line each, folded. Ten calls each carrying a paragraph of the model's
 * reasoning is a wall of prose nobody reads, and the shape of the run, which
 * is the thing this tab is for, was lost inside it. The line says what the
 * step decided; how sure it was, why, what it cost and exactly what it wrote
 * are all one press away.
 *
 * The model name, the prompt version, the tokens and the cost are allowed here
 * and nowhere else on the page: docs/05-design.md section 11.
 */

export function CallsTab({ calls }: { calls: LlmCall[] }) {
  if (calls.length === 0) {
    return <p className="px-6 py-4 text-small text-ink-tertiary">No model call has been made for this email yet.</p>;
  }
  return (
    <ol className="px-6 py-4">
      {calls.map((call, index) => (
        <Entry key={call.id} call={call} last={index === calls.length - 1} />
      ))}
    </ol>
  );
}

function Entry({ call, last }: { call: LlmCall; last: boolean }) {
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState(false);
  const reading = readCall(call);
  // A failure says its reason on the folded line. It is the one thing a person
  // opening this tab is looking for, and there are never many of them.
  const line = call.ok ? reading.line : call.error;

  return (
    <li className="relative flex gap-3 pb-1.5 last:pb-0">
      {last ? null : <span aria-hidden="true" className="absolute left-[3.5px] top-[13px] bottom-0 w-px bg-hairline" />}
      <span
        aria-hidden="true"
        className={`relative mt-[9px] h-2 w-2 shrink-0 rounded-full ${call.ok ? "bg-ink-faint" : "bg-fault"}`}
      />

      <div className="min-w-0 grow">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="flex w-full items-baseline gap-2.5 py-1 text-left"
        >
          <span className="shrink-0 font-mono text-mono-sm">{call.step}</span>
          <span className="shrink-0 font-mono text-mono-xs text-ink-faint">{at(call.createdAt)}</span>
          {call.attempt > 1 ? <span className="shrink-0 text-caption text-ink-tertiary">attempt {call.attempt}</span> : null}
          <span className={`min-w-0 grow truncate text-strong ${call.ok ? "text-ink-secondary" : "text-fault"}`}>{line}</span>
          {call.ok ? null : <Chip tone="fault">failed</Chip>}
          <span className="shrink-0 font-mono text-mono-xs tabular-nums text-ink-faint">
            {(call.latencyMs / 1000).toFixed(1)}s
          </span>
        </button>

        <AnimatePresence initial={false}>
          {open ? (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={panel}
              className="overflow-hidden"
            >
              <div className="pb-3 pt-1">
                {reading.facts.length > 0 ? (
                  <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                    {reading.facts.map((fact) => (
                      <Fact key={fact.label} label={fact.label} value={fact.value} />
                    ))}
                  </div>
                ) : null}

                {reading.quote ? <EvidenceWell quote={reading.quote} /> : null}

                <div className="mt-2 flex items-center gap-2.5">
                  <span className="font-mono text-micro text-ink-faint">{call.promptVersion}</span>
                  <span className="font-mono text-micro text-ink-faint">{call.model}</span>
                  {call.inputTokens === null ? null : (
                    <span className="font-mono text-micro tabular-nums text-ink-faint">
                      {call.inputTokens.toLocaleString()} in
                      {call.outputTokens === null ? "" : ` ${call.outputTokens.toLocaleString()} out`}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setRaw(!raw)}
                    aria-expanded={raw}
                    className="text-micro text-ink-tertiary underline underline-offset-2 transition-colors duration-150 hover:text-ink"
                  >
                    {raw ? "Hide what the model wrote" : "What the model wrote"}
                  </button>
                </div>

                {raw ? (
                  <div className="mt-2">
                    <EvidenceWell quote={call.responseText ?? "The call itself failed, so there is nothing it wrote."} />
                  </div>
                ) : null}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </li>
  );
}

/** The clock on this call, to the second. A run is minutes long, so the date would be the same on every row. */
function at(iso: string): string {
  const when = new Date(iso);
  return Number.isNaN(when.getTime()) ? "" : when.toLocaleTimeString([], { hour12: false });
}

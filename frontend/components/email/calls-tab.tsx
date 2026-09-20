"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";

import { Chip } from "@/components/ui/chip";
import { EvidenceWell } from "@/components/ui/marked-span";
import type { LlmCall } from "@/lib/api/trace-schemas";
import { panel } from "@/lib/motion";

/**
 * Every model call made for this email. This is the machinery view, so the
 * model name, the prompt version, the tokens and the cost are allowed here and
 * nowhere else on the page: docs/05-design.md section 11.
 *
 * What comes back is still not shown as JSON. An accepted answer is rendered as
 * the fields it carried; the raw text is one disclosure below it, for the
 * person who needs to see exactly what the model wrote.
 */

export function CallsTab({ calls }: { calls: LlmCall[] }) {
  const [open, setOpen] = useState<string | null>(null);
  if (calls.length === 0) {
    return <p className="px-6 py-4 text-small text-ink-tertiary">No model call has been made for this email yet.</p>;
  }
  return (
    <div className="px-6 pb-4">
      {calls.map((call) => (
        <div key={call.id} className="border-t border-hairline-faint first:border-t-0">
          <button
            type="button"
            onClick={() => setOpen(open === call.id ? null : call.id)}
            aria-expanded={open === call.id}
            className="flex h-[38px] w-full items-center gap-2.5 text-left"
          >
            <span className="w-[120px] shrink-0 font-mono text-mono-sm">{call.step}</span>
            <span className="shrink-0 font-mono text-mono-xs text-ink-tertiary">{call.promptVersion}</span>
            <span className="shrink-0 font-mono text-mono-xs text-ink-tertiary">{call.model}</span>
            {call.attempt > 1 ? (
              <span className="shrink-0 text-caption text-ink-tertiary">attempt {call.attempt}</span>
            ) : null}
            <span className="grow" />
            {call.ok ? null : <Chip tone="fault">failed</Chip>}
            <span className="shrink-0 font-mono text-mono-xs tabular-nums text-ink-tertiary">
              {(call.latencyMs / 1000).toFixed(1)}s
            </span>
            <span className="w-[86px] shrink-0 text-right font-mono text-mono-xs tabular-nums text-ink-tertiary">
              {call.inputTokens === null ? "" : `${call.inputTokens} in`}
              {call.outputTokens === null ? "" : ` ${call.outputTokens} out`}
            </span>
          </button>

          <AnimatePresence initial={false}>
            {open === call.id ? (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={panel}
                className="overflow-hidden"
              >
                <div className="pb-3">
                  {call.error ? (
                    <p className="mb-2 max-w-[68ch] text-small text-fault">{call.error}</p>
                  ) : null}
                  <div className="text-caption text-ink-tertiary">What the model wrote</div>
                  <div className="mt-1.5">
                    <EvidenceWell quote={call.responseText ?? "The call itself failed, so there is nothing it wrote."} />
                  </div>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      ))}
    </div>
  );
}

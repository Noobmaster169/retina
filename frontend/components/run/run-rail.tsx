"use client";

import { RailBlock } from "@/components/shell/rail";
import { DEPENDENCIES, DEPENDENCY_LABELS, type HealthReport } from "@/lib/api/queues-schemas";
import { type PromptSet } from "@/lib/api/runs-schemas";

/**
 * What the rail carries on a run page: the prompt versions this run pinned,
 * and the state of everything the pipeline depends on.
 *
 * The dependency row is chips and not dots. A chip carries its state in its
 * label and its tint, and a coloured dot beside a word was the single most
 * common note across four rounds of review.
 *
 * The memory block the canvas drew here is absent on purpose. `core.lessons`
 * arrives in phase 11, and the handover is explicit: render it when the table
 * is there, do not fake a lesson, do not stub the table.
 */

interface RunRailProps {
  promptSet: PromptSet;
  /** Null while the first health read is in flight, or when it failed. The block then says so. */
  health: HealthReport | null;
}

export function RunRail({ promptSet, health }: RunRailProps) {
  const pinned = Object.entries(promptSet).flatMap(([step, prompt]) =>
    prompt ? [{ step, version: prompt.version }] : [],
  );

  return (
    <>
      <div className="mx-[18px] mt-3 h-px bg-hairline" />
      {pinned.length > 0 ? (
        <RailBlock title="Pinned for this run">
          {pinned.map((prompt) => (
            <div key={prompt.step} className="flex h-[25px] items-center">
              <span className="font-mono text-mono-sm text-ink-tertiary">{prompt.step}</span>
              <span className="grow" />
              <span className="font-mono text-mono-sm text-ink-secondary">{prompt.version}</span>
            </div>
          ))}
        </RailBlock>
      ) : (
        <RailBlock title="Pinned for this run">
          <p className="text-caption leading-[17px] text-ink-tertiary">
            Nothing pinned. The worker runs whichever prompt is active when it reaches each step.
          </p>
        </RailBlock>
      )}

      <span className="grow" />

      <div className="border-t border-hairline px-[18px] py-3.5">
        <div className="text-small font-medium text-ink-tertiary">Dependencies</div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {health === null ? (
            <span className="text-caption text-ink-tertiary">Reading.</span>
          ) : (
            DEPENDENCIES.map((key) => {
              const down = health.checks[key] === "down";
              return (
                <span
                  key={key}
                  className={`inline-flex h-[22px] items-center rounded-sm px-2 font-mono text-mono-xs transition-colors duration-150 ${
                    down ? "bg-fault-tint text-fault" : "bg-sunken text-ink-secondary"
                  }`}
                  title={down ? `${DEPENDENCY_LABELS[key]} is not answering` : `${DEPENDENCY_LABELS[key]} is up`}
                >
                  {DEPENDENCY_LABELS[key]}
                </span>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}

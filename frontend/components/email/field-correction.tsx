"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type { FieldJudgementView } from "@/lib/api/comparison-schemas";

/**
 * A correction typed on the row it is about, under the quote it came from.
 * Never a modal: the whole value of doing this here is that the line the
 * extractor read is still on screen while the value is retyped.
 *
 * Both sides are offered, always. A person says what one document reads; the
 * product never asks which of the two is right, and there is no field anywhere
 * for a correct value.
 */

export interface CorrectionProps {
  judgement: FieldJudgementView;
  /** A person's value already recorded for each side, which is what the input starts from. */
  human: { SI: string | null; BL: string | null };
  pending: boolean;
  onRecord: (side: "SI" | "BL", value: string) => void;
  onCancel: () => void;
}

export function FieldCorrection({ judgement, human, pending, onRecord, onCancel }: CorrectionProps) {
  const here = useRef<HTMLDivElement>(null);
  // The action bar can start a correction from the foot of the page, and the
  // row it opens is usually below the fold. Scrolling to it is the difference
  // between a control that works and one that looks broken.
  useEffect(() => here.current?.scrollIntoView({ block: "center", behavior: "smooth" }), []);

  return (
    <div ref={here} className="ml-[27px] mt-2 border-t border-hairline-faint pt-2">
      <p className="text-caption text-ink-tertiary">
        What does each document actually say? Retina records what you read, and judges the two again.
      </p>
      <Side side="SI" was={human.SI ?? judgement.siValue} pending={pending} onRecord={onRecord} />
      <Side side="BL" was={human.BL ?? judgement.blValue} pending={pending} onRecord={onRecord} />
      <div className="mt-2">
        <Button variant="quiet" onClick={onCancel}>
          Done
        </Button>
      </div>
    </div>
  );
}

function Side({
  side,
  was,
  pending,
  onRecord,
}: {
  side: "SI" | "BL";
  was: string | null;
  pending: boolean;
  onRecord: (side: "SI" | "BL", value: string) => void;
}) {
  const [value, setValue] = useState(was ?? "");
  const changed = value.trim().length > 0 && value.trim() !== (was ?? "");
  return (
    <div className="mt-1.5 flex items-center gap-2.5">
      <span className="w-[18px] shrink-0 text-[10.5px] font-medium text-ink-tertiary">{side}</span>
      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && changed && !pending) onRecord(side, value.trim());
        }}
        placeholder={was === null ? "nothing was read here" : undefined}
        aria-label={`What the ${side} reads`}
        className="h-[30px] min-w-0 grow rounded-md border border-hairline-strong bg-canvas px-2 font-mono text-mono-sm text-ink outline-none focus-visible:border-ink"
      />
      <Button variant="secondary" className="h-[30px]" disabled={!changed || pending} onClick={() => onRecord(side, value.trim())}>
        Record
      </Button>
    </div>
  );
}

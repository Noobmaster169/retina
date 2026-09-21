import { Chip } from "@/components/ui/chip";
import type { Category, VerdictClassify } from "@/lib/api/scoring-schemas";

import { EFFECTS } from "./verdict-reading";

/**
 * The two readers on one line: what the generator said, what the verifier made
 * of it, and which of them was looking at the truth. A category is never
 * coloured for its own sake (section 4.9); the tint here means wrong, and the
 * chip at the end says what the second call was worth.
 */

interface StripProps {
  classify: VerdictClassify;
  truth: Category;
}

export function ClassifyStrip({ classify, truth }: StripProps) {
  const effect = EFFECTS[classify.effect];
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <Reader label="gen" category={classify.genCategory} confidence={classify.genConfidence} truth={truth} />
      {classify.verCategory === null ? null : (
        <>
          <span className="text-ink-faint" aria-hidden="true">
            &rarr;
          </span>
          <Reader label="ver" category={classify.verCategory} confidence={classify.verConfidence} truth={truth} />
        </>
      )}
      <Chip tone={effect.tone}>{effect.label}</Chip>
      {classify.humanCategory === null ? null : (
        <Chip tone="signal">a person said {classify.humanCategory}</Chip>
      )}
      <span className="font-mono text-mono-xs text-ink-faint">
        {classify.promptVersion ?? "no version"} {classify.model ?? ""}
      </span>
    </div>
  );
}

function Reader({
  label,
  category,
  confidence,
  truth,
}: {
  label: string;
  category: Category;
  confidence: number | null;
  truth: Category;
}) {
  const right = category === truth;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-caption text-ink-tertiary">{label}</span>
      <span className={`font-mono text-mono-xs ${right ? "text-ink" : "text-fault"}`}>{category}</span>
      {confidence === null ? null : (
        <span className="font-mono text-mono-xs tabular-nums text-ink-faint">{confidence.toFixed(2)}</span>
      )}
    </span>
  );
}

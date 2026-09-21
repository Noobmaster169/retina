import { Tooltip } from "@/components/ui/tooltip";
import type { IdentityFact } from "@/lib/api/insight-schemas";

/**
 * What a thing is, in the fewest words that are true.
 *
 * Two hues would be a mistake here: these are all facts about one thing and
 * only their provenance differs. So a fact the model supplied is written in
 * the same ink and carries a dotted underline, and the tooltip says what the
 * profile stored: which source, and the model's own confidence in it.
 */

export function IdentityStrip({ facts }: { facts: IdentityFact[] }) {
  if (facts.length === 0) return null;
  return (
    <dl className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {facts.map((fact) => (
        <div key={fact.key} className="flex items-baseline gap-1.5">
          <dt className="text-caption text-ink-tertiary">{fact.label}</dt>
          <dd className="text-small text-ink">
            {fact.verified ? (
              fact.value
            ) : (
              <Tooltip
                label={`The model's own knowledge, not something our mail states${
                  fact.confidence === null ? "" : `. It put its confidence at ${fact.confidence.toFixed(2)}`
                }.`}
              >
                <span className="border-b border-dotted border-hairline-strong">{fact.value}</span>
              </Tooltip>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

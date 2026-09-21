import type { EntityInsight, InsightLine } from "@/lib/api/insight-schemas";

import { FacetList } from "./facet-list";
import { IdentityStrip } from "./identity-strip";

/**
 * What a thing means: the sentence, what it is, and at most three facets of
 * the trade it sits in.
 *
 * The order is the argument. A reader arriving at a port wants to know what
 * the port is before they are told it appeared in six emails, and the counts
 * that used to lead this page (read_from, runs, documents) are now under the
 * evidence, where somebody goes to check rather than to learn.
 */

interface MeaningProps {
  insight: EntityInsight;
  /** Where a line that names another resolved thing leads. */
  hrefFor: (line: InsightLine) => string | null;
  /** True where a profile exists but says nothing yet, so the page says so rather than showing a gap. */
  stale?: boolean;
}

export function Meaning({ insight, hrefFor, stale = false }: MeaningProps) {
  return (
    <div className="flex flex-col gap-3">
      {insight.summary ? (
        <p className="max-w-[64ch] text-body leading-[21px] text-ink">
          {insight.summary}
          {stale ? <span className="text-ink-tertiary"> Written before the last mail about it.</span> : null}
        </p>
      ) : (
        <p className="max-w-[64ch] text-small text-ink-tertiary">
          Nothing has been written about this one yet. The profile job reaches it within a few minutes of the mail that
          named it.
        </p>
      )}

      <IdentityStrip facts={insight.identity} />

      <Scale scale={insight.scale} />

      {insight.facets.map((facet) => (
        <FacetList key={facet.key} facet={facet} hrefFor={hrefFor} />
      ))}

      {insight.unknowns.length > 0 ? (
        <section className="border-t border-hairline-faint pt-3">
          <h3 className="text-caption font-medium text-ink-secondary">What our mail does not say</h3>
          <ul className="mt-1">
            {insight.unknowns.map((unknown) => (
              <li key={unknown} className="max-w-[64ch] py-[3px] text-small leading-[18px] text-ink-tertiary">
                {unknown}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/**
 * How much of it there is, in one line. `disputed` is the only one that can
 * carry a hue, because it is the only one that means something is wrong: an
 * appearance the judge said the two documents did not agree on.
 */
function Scale({ scale }: { scale: EntityInsight["scale"] }) {
  const seen =
    scale.firstMailDate && scale.lastMailDate
      ? scale.firstMailDate === scale.lastMailDate
        ? `on ${scale.firstMailDate}`
        : `between ${scale.firstMailDate} and ${scale.lastMailDate}`
      : null;
  return (
    <p className="text-caption text-ink-tertiary">
      <span className="tabular-nums text-ink-secondary">{scale.appearances}</span> appearance
      {scale.appearances === 1 ? "" : "s"} across{" "}
      <span className="tabular-nums text-ink-secondary">{scale.emails}</span> email{scale.emails === 1 ? "" : "s"},
      written <span className="tabular-nums text-ink-secondary">{scale.spellings}</span> way
      {scale.spellings === 1 ? "" : "s"}
      {seen ? `, ${seen}` : ""}.
      {scale.disputed > 0 ? (
        <span className="text-differ">
          {" "}
          {scale.disputed} of those appearances {scale.disputed === 1 ? "is" : "are"} on the side of a field the judge
          called different.
        </span>
      ) : null}
    </p>
  );
}

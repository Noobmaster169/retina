"use client";

import Link from "next/link";

import type { FlowNode } from "./flow";
import { SLICE_TONE } from "./outcome-tones";

/**
 * What each colour in the flow means, and the way into the emails behind it.
 *
 * Built from the diagram's own end nodes rather than from a second list, so a
 * swatch here and a band there cannot come to disagree about either the colour
 * or the count. Hovering one lights its band; clicking one opens exactly the
 * emails it counted.
 *
 * It reads as a legend and works as a set of links, which is the pair the
 * picture cannot give on its own: a band is hard to point at and impossible to
 * tab to, and nothing on an SVG says which grey is which.
 */

interface FlowLegendProps {
  /** The endings, in the order the diagram stacks them. */
  endings: FlowNode[];
  /** The four reasons inside `Needs a person`, which are one band up there. */
  reasons: FlowNode[];
  runId: string;
  lit: string | null;
  onLight(id: string | null): void;
}

export function FlowLegend({ endings, reasons, runId, lit, onLight }: FlowLegendProps) {
  return (
    <div className="space-y-1.5 border-t border-hairline-faint pt-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {endings.map((node) => (
          <Item key={node.id} node={node} runId={runId} lit={lit} onLight={onLight} strong />
        ))}
      </div>

      {reasons.length > 0 ? (
        /*
         * The four reasons are not a fifth thing beside the endings above:
         * they are the violet one, read four ways. Saying that with a swatch
         * and the words "of which" did the opposite, because a swatch is what
         * every other row uses to mean "a colour of its own", and four labels
         * with no swatch beside it read as a second series whose colour had
         * gone missing.
         *
         * So: no swatch, the parent's own label rather than a pronoun for it,
         * and the whole group set inside a violet block. Nesting is the one
         * thing a legend can say that a list of chips cannot.
         */
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-review-tint px-2 py-1.5">
          <span className="flex items-center gap-1.5 text-caption font-medium text-review">
            {reasonsHead(endings)}
          </span>
          {reasons.map((node) => (
            <Item key={node.id} node={node} runId={runId} lit={lit} onLight={onLight} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * What to call the nested group, in the words of the ending it belongs to.
 *
 * Read off that ending rather than written here, so the two can never come to
 * say different things about one band. Where the diagram has no such ending to
 * point at, which is a run whose emails all failed, it says the plain thing.
 */
function reasonsHead(endings: FlowNode[]): string {
  const parent = endings.find((node) => node.id === "needs-person");
  return parent ? `${parent.label}, by reason` : "By reason";
}

function Item({
  node,
  runId,
  lit,
  onLight,
  strong = false,
}: {
  node: FlowNode;
  runId: string;
  lit: string | null;
  onLight(id: string | null): void;
  /** An ending carries its swatch; a reason inside one does not, because the group already showed it. */
  strong?: boolean;
}) {
  // A reason lights the band it is part of, because that is the band it is in.
  const lights = strong ? node.id : "needs-person";
  const faded = lit !== null && lit !== lights;
  const body = (
    <>
      {strong ? <Swatch tone={node.tone} /> : null}
      {/* A reason reads on the violet block it sits on, which is paler than
          the panel, so it takes the darker of the two secondary inks. */}
      <span className="text-ink-secondary">{node.label}</span>
      <span className="font-mono text-mono-sm tabular-nums text-ink">{node.count}</span>
    </>
  );
  const shell = `flex items-center gap-1.5 rounded-sm px-1 py-0.5 text-caption transition-opacity duration-150 ${
    faded ? "opacity-35" : "opacity-100"
  }`;

  if (node.filter === null) return <span className={shell}>{body}</span>;
  return (
    <Link
      href={`/runs/${runId}/inbox?filter=${node.filter}`}
      title={node.says}
      onMouseEnter={() => onLight(lights)}
      onMouseLeave={() => onLight(null)}
      onFocus={() => onLight(lights)}
      onBlur={() => onLight(null)}
      // A reason sits on the violet block, where `active` is all but invisible;
      // it lifts off it instead.
      className={`${shell} ${strong ? "hover:bg-active" : "hover:bg-surface"}`}
    >
      {body}
    </Link>
  );
}

function Swatch({ tone }: { tone: FlowNode["tone"] }) {
  return <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: SLICE_TONE[tone].bar }} />;
}

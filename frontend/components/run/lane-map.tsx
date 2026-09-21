"use client";

import { Fragment } from "react";


import { Panel, PanelHead } from "@/components/ui/panel";

import type { LaneMap, StageCard } from "./progress";
import { Card } from "./stage-card";
import { LanePipe } from "./lane-pipe";
import { StagePeek } from "./stage-peek";
import type { StagePeek as Peek } from "./stage-peeks";

/**
 * How the work moves: two queues, one row each, joined by the pipe the
 * crossing runs through.
 *
 * It was one row of six cards, which drew two queues as though they were one
 * pipeline and left the crossing as an arrow with a label that overhung the
 * card beside it. A row per queue is what the code actually has
 * (queues/names.ts), and it gives the crossing somewhere of its own to be.
 *
 * What this panel says is what the machine is doing. Where the work ended is
 * the flow diagram below, which names the same five outcomes and opens each
 * one's emails; saying them here too was one screen speaking twice.
 *
 * The emails a stage is holding are on its own card, one hover away. They were
 * two panels under the strip, which was the same thing said twice again: a
 * card counting eight busy slots and a panel below listing the eight.
 */

/** Three cards and two arrows. The arrows are fixed; the cards share what is left. */
const COLUMNS = "minmax(0,1fr) 28px minmax(0,1fr) 28px minmax(0,1fr)";

interface LaneMapProps {
  map: LaneMap;
  /** The sentence under the title. It says what the two queues are doing right now. */
  note: string;
  /** How many slots each queue has, from the worker's own env rather than from a constant here. */
  slots: { classify: number; compare: number };
  /** Work is moving, so the pipe carries something. A drained run's pipe is still. */
  flowing: boolean;
  /** The emails each stage is holding, for the card that opens on it. Empty when the queues are unreachable. */
  peeks: Record<string, Peek>;
  /** Whose emails a peeked row opens. */
  runId: string;
}

export function LaneMapPanel({ map, note, slots, flowing, peeks, runId }: LaneMapProps) {
  const sorting = map.cards.slice(0, 3);
  const checking = map.cards.slice(3);
  const lane = { peeks, runId };
  return (
    <Panel className="shrink-0">
      <PanelHead title="How the work moves" note={note} />
      <div className="px-4 pb-4">
        <Lane name="classify" says="Sorts every email" at={slots.classify} cards={sorting} from={0} {...lane} />
        <LanePipe crossing={map.crossing} flowing={flowing && map.crossing > 0} />
        <Lane name="compare" says="Checks the two documents" at={slots.compare} cards={checking} from={3} {...lane} />
      </div>
    </Panel>
  );
}

/** One queue: what it is, how wide it runs, and its three cards. */
function Lane({
  name,
  says,
  at,
  cards,
  from,
  peeks,
  runId,
}: {
  name: string;
  says: string;
  at: number;
  cards: StageCard[];
  from: number;
  peeks: Record<string, Peek>;
  runId: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 pb-2">
        <span className="font-mono text-mono-xs text-ink-tertiary">{name}</span>
        <span className="text-small text-ink-secondary">{says}</span>
        <span className="grow" />
        <span className="text-small text-ink-tertiary">{at} at once</span>
      </div>
      <div className="grid items-stretch" style={{ gridTemplateColumns: COLUMNS }}>
        {cards.map((card, index) => {
          const peek = peeks[card.key];
          return (
            <Fragment key={card.key}>
              {peek ? (
                <StagePeek title={peek.title} rows={peek.rows} total={peek.total} runId={runId}>
                  <Card card={card} index={from + index} />
                </StagePeek>
              ) : (
                <Card card={card} index={from + index} />
              )}
              {index < cards.length - 1 ? <Arrow /> : null}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

/** Between two cards of one queue. It carries nothing, so it is drawn as nothing but a direction. */
function Arrow() {
  return (
    <div className="flex w-[28px] shrink-0 items-center justify-center">
      <svg width="24" height="8" viewBox="0 0 24 8" aria-hidden="true">
        <path
          d="M2 4 H19 M15.5 1.5 L19 4 L15.5 6.5"
          fill="none"
          stroke="var(--hairline-strong)"
          strokeWidth={1.3}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

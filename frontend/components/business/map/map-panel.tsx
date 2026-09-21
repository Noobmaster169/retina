"use client";

import Link from "next/link";

import { Flag } from "@/components/ui/flag";
import { Icon } from "@/components/ui/icons";

import type { PlacedLane, PlacedPin } from "./types";

/**
 * The port a person picked, beside the map rather than on a new page: its
 * flag, code and country, what loads and discharges, and each lane it sits
 * on. A lane's other end is a button, so a person can walk the network
 * without leaving the map. Open goes to the page.
 */
export function MapPanel({
  pin,
  lanes,
  onPick,
  onFrame,
  onClose,
}: {
  pin: PlacedPin;
  lanes: PlacedLane[];
  onPick(pin: PlacedPin): void;
  onFrame(): void;
  onClose(): void;
}) {
  const chips = [pin.locode, pin.country].filter((value): value is string => !!value);
  return (
    <aside
      className="absolute right-3 top-3 z-10 w-[280px] max-w-[calc(100%-1.5rem)] rounded-lg border border-hairline bg-canvas shadow-overlay"
      aria-label={`${pin.name} on the map`}
    >
      <div className="flex items-start gap-2 border-b border-hairline px-3 py-2.5">
        <Flag code={pin.countryCode} height={14} className="mt-1 shrink-0" />
        <div className="min-w-0 grow">
          <p className="truncate text-body font-medium text-kind-port">{pin.name}</p>
          {chips.length ? <p className="truncate font-mono text-mono-sm text-ink-tertiary">{chips.join(" · ")}</p> : null}
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 text-ink-tertiary hover:text-ink">
          <Icon name="close" />
        </button>
      </div>
      <dl className="grid grid-cols-2 gap-x-3 px-3 py-2.5 text-small">
        <div>
          <dt className="text-caption text-ink-tertiary">Loading</dt>
          <dd className="font-mono text-mono-sm">{pin.loading}</dd>
        </div>
        <div>
          <dt className="text-caption text-ink-tertiary">Discharge</dt>
          <dd className="font-mono text-mono-sm">{pin.discharge}</dd>
        </div>
      </dl>
      <div className="border-t border-hairline px-3 py-2.5">
        <p className="mb-1 text-caption text-ink-tertiary">
          Lanes <span className="font-mono">{lanes.length}</span>
        </p>
        {lanes.length === 0 ? (
          <p className="text-small text-ink-tertiary">No shipment names both ends yet.</p>
        ) : (
          <ul className="max-h-40 space-y-0.5 overflow-y-auto">
            {lanes.map((lane) => {
              const outbound = lane.polId === pin.id;
              const other = outbound ? lane.pod : lane.pol;
              return (
                <li key={`${lane.polId}-${lane.podId}`}>
                  <button
                    type="button"
                    onClick={() => onPick(other)}
                    className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left text-small hover:bg-sunken"
                  >
                    <span className="w-8 shrink-0 font-mono text-mono-sm text-ink-tertiary">{outbound ? "to" : "from"}</span>
                    <Flag code={other.countryCode} height={10} />
                    <span className="min-w-0 grow truncate">{other.name}</span>
                    <span className="shrink-0 font-mono text-mono-sm text-ink-tertiary">{lane.count}</span>
                    {lane.disputed > 0 ? <span className="shrink-0 rounded bg-differ-tint px-1 font-mono text-[10px] text-differ">{lane.disputed} disputed</span> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-hairline px-3 py-2">
        <button type="button" onClick={onFrame} className="text-small text-ink-secondary hover:text-ink">
          Frame its lanes
        </button>
        {pin.href !== "#" ? (
          <Link href={pin.href} className="rounded-md bg-accent px-2.5 py-1 text-small font-medium text-ink-inverse hover:opacity-90">
            Open
          </Link>
        ) : null}
      </div>
    </aside>
  );
}

/** What the pointer is over, beside it. */
export function MapTooltip({ at, flip, pin, lane }: { at: { x: number; y: number }; flip: boolean; pin: PlacedPin | null; lane: PlacedLane | null }) {
  if (!pin && !lane) return null;
  return (
    <div
      className="pointer-events-none absolute z-10 max-w-[260px] rounded-md border border-hairline bg-canvas px-2.5 py-1.5 text-small shadow-overlay"
      style={flip ? { right: `calc(100% - ${at.x - 14}px)`, top: at.y + 14 } : { left: at.x + 14, top: at.y + 14 }}
    >
      {pin ? (
        <>
          <span className="flex items-center gap-2 font-medium text-kind-port">
            <Flag code={pin.countryCode} height={12} />
            {pin.name}
          </span>
          <span className="block text-caption text-ink-tertiary">
            {pin.loading} loading, {pin.discharge} discharge
          </span>
        </>
      ) : lane ? (
        <>
          <span className="block font-medium">
            {lane.pol.name} <span className="text-ink-faint">to</span> {lane.pod.name}
          </span>
          <span className="block text-caption text-ink-tertiary">
            {lane.count} {lane.count === 1 ? "shipment" : "shipments"}
            {lane.disputed > 0 ? `, ${lane.disputed} disputed at a port` : ""}
          </span>
        </>
      ) : null}
    </div>
  );
}

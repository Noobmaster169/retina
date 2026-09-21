"use client";

import { Icon } from "@/components/ui/icons";

/** Zoom in, out, and back to the world: a column of three at the bottom right. */
export function MapControls({ onIn, onOut, onReset }: { onIn(): void; onOut(): void; onReset(): void }) {
  const button = "flex h-7 w-7 items-center justify-center text-ink-secondary hover:bg-sunken hover:text-ink";
  return (
    <div className="absolute bottom-3 right-3 z-10 flex flex-col overflow-hidden rounded-md border border-hairline-strong bg-canvas">
      <button type="button" onClick={onIn} aria-label="Zoom in" className={button}>
        <Icon name="plus" />
      </button>
      <button type="button" onClick={onOut} aria-label="Zoom out" className={`${button} border-t border-hairline`}>
        <span aria-hidden className="block h-px w-2.5 bg-current" />
      </button>
      <button type="button" onClick={onReset} aria-label="Whole world" className={`${button} border-t border-hairline`}>
        <Icon name="expand" />
      </button>
    </div>
  );
}

/** What size and ring mean, in the corner, in words. */
export function MapLegend({ ports, lanes }: { ports: number; lanes: number }) {
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 z-10 hidden items-center gap-4 rounded-md border border-hairline bg-canvas/90 px-2.5 py-1.5 text-caption text-ink-tertiary @lg:flex">
      <span className="font-mono text-ink-secondary">
        {ports} {ports === 1 ? "port" : "ports"}, {lanes} {lanes === 1 ? "lane" : "lanes"}
      </span>
      <span className="flex items-center gap-1.5">
        <svg width="18" height="12" aria-hidden>
          <circle cx="4" cy="6" r="2.5" className="fill-kind-port" />
          <circle cx="13" cy="6" r="4.5" className="fill-kind-port" />
        </svg>
        size is shipments
      </span>
      <span className="flex items-center gap-1.5">
        <svg width="12" height="12" aria-hidden>
          <circle cx="6" cy="6" r="2.5" className="fill-kind-port" />
          <circle cx="6" cy="6" r="5" className="fill-none stroke-kind-port" strokeWidth="1" />
        </svg>
        ring loads and discharges
      </span>
      <span className="hidden items-center gap-1.5 @3xl:flex">
        <svg width="18" height="12" aria-hidden>
          <path d="M1 9 Q9 0 17 9" className="fill-none stroke-kind-port opacity-90" strokeWidth="2" strokeDasharray="3 3" />
        </svg>
        pick a port for its lanes
      </span>
    </div>
  );
}

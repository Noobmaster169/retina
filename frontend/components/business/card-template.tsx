import { Icon } from "@/components/ui/icons";
import { Bar } from "@/components/shell/page-skeleton";

import { HUE_CLASSES, kindOf } from "./kind";

/**
 * A card and a thing's page before either has any values.
 *
 * Both draw what does not depend on the data, which is more than it sounds:
 * the kind is in the route, so the glyph, its tint and the word `Company` or
 * `Port` are all known, and the grid, the card's height and the panels below
 * are ours. A person sees the page they asked for, with the words still
 * arriving, rather than a screen that gives no sign which page it will be.
 */

/** One card, at the real 148px, laid out exactly as `entity-card.tsx` lays one out. */
function CardTemplate({ type }: { type: string }) {
  const kind = kindOf(type);
  const hue = HUE_CLASSES[kind.hue];
  return (
    <div className="flex min-h-[148px] flex-col rounded-lg border border-hairline bg-canvas p-4">
      <div className="flex items-start gap-2.5">
        <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${hue.tint} ${hue.text} opacity-60`}>
          <Icon name={kind.icon} size={14} />
        </span>
        <span className="min-w-0 grow space-y-1.5">
          <Bar className="h-4 w-2/3" />
          <Bar className="h-3 w-1/3" />
        </span>
      </div>
      <div className="mt-2.5 space-y-1.5">
        <Bar className="h-3.5 w-full" />
        <Bar className="h-3.5 w-4/5" />
      </div>
      <div className="mt-2 flex gap-1">
        <Bar className="h-[20px] w-16 rounded-sm" />
        <Bar className="h-[20px] w-12 rounded-sm" />
      </div>
      <span className="grow" />
      <div className="mt-3 flex gap-4">
        <Bar className="h-3 w-14" />
        <Bar className="h-3 w-14" />
      </div>
    </div>
  );
}

/** The grid the list opens with, at the same breakpoints the real one uses. */
export function CardGridTemplate({ type, cards = 8 }: { type: string; cards?: number }) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {Array.from({ length: cards }, (_, at) => (
        <CardTemplate key={at} type={type} />
      ))}
    </div>
  );
}

/** A thing's own page: the tinted header band it really has, then its panels. */
export function DetailTemplate({ type }: { type: string }) {
  const kind = kindOf(type);
  const hue = HUE_CLASSES[kind.hue];
  return (
    <div className="flex min-w-0 grow flex-col" aria-busy="true">
      <div className={`border-b border-hairline px-7 py-5 ${hue.tint}`}>
        <div className="flex items-start gap-4">
          <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-canvas ${hue.text}`}>
            <Icon name={kind.icon} size={20} />
          </span>
          <div className="min-w-0 grow">
            <div className="text-caption text-ink-tertiary">{kind.label}</div>
            <Bar className="mt-1 h-7 w-72" />
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Bar className="h-[22px] w-20 rounded-sm" />
              <Bar className="h-[22px] w-24 rounded-sm" />
              <Bar className="h-[22px] w-16 rounded-sm" />
            </div>
          </div>
        </div>
      </div>
      <main className="min-h-0 grow overflow-y-auto px-7 pb-8">
        <div className="space-y-3 py-5">
          <Bar className="h-36 w-full rounded-xl" />
          <Bar className="h-56 w-full rounded-xl" />
        </div>
      </main>
    </div>
  );
}

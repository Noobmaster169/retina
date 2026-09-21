import Link from "next/link";

import { Flag } from "@/components/ui/flag";
import { flagSrc } from "@/lib/flag";
import { Icon } from "@/components/ui/icons";
import { formatWhenShort } from "@/lib/when";

import { HUE_CLASSES, kindOf } from "./kind";

/**
 * One thing as a card: its name in its kind's hue, one sentence, a few
 * attribute chips and the counts that say how much of the mail it touches.
 * A hairline panel, not a floated card: docs/05-design.md section 6.
 */
interface EntityCardProps {
  type: string;
  href: string;
  name: string;
  summary: string | null;
  chips: string[];
  counts: { label: string; value: number }[];
  lastSeen: string | null;
  /** ISO code; the flag becomes the card's symbol where it is known. */
  countryCode?: string | null;
}

export function EntityCard({ type, href, name, summary, chips, counts, lastSeen, countryCode = null }: EntityCardProps) {
  const kind = kindOf(type);
  const hue = HUE_CLASSES[kind.hue];
  const flag = flagSrc(countryCode);
  return (
    <Link
      href={href}
      className="flex min-h-[148px] flex-col rounded-lg border border-hairline bg-canvas p-4 transition-colors duration-150 hover:border-hairline-strong hover:bg-surface"
    >
      <div className="flex items-start gap-2.5">
        <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${hue.tint} ${hue.text}`} title={countryCode ?? undefined}>
          {flag ? <Flag code={countryCode} height={16} /> : <Icon name={kind.icon} size={14} />}
        </span>
        <span className="min-w-0">
          <span className={`block truncate text-heading font-medium ${hue.text}`}>{name}</span>
          <span className="block text-caption text-ink-tertiary">
            {kind.label}
            {lastSeen ? ` · last seen ${formatWhenShort(lastSeen)}` : ""}
          </span>
        </span>
      </div>
      <p className="mt-2.5 line-clamp-2 text-small leading-[19px] text-ink-secondary">{summary ?? "Not profiled yet."}</p>
      {chips.length ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {chips.map((chip) => (
            <span key={chip} className="inline-flex h-[20px] items-center rounded-sm bg-sunken px-1.5 text-caption text-ink-secondary">
              {chip}
            </span>
          ))}
        </div>
      ) : null}
      <span className="grow" />
      <div className="mt-3 flex gap-4">
        {counts.map((count) => (
          <span key={count.label} className="text-caption text-ink-tertiary">
            <span className="font-mono text-mono-sm text-ink">{count.value}</span> {count.label}
          </span>
        ))}
      </div>
    </Link>
  );
}

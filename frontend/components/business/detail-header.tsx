import type { ReactNode } from "react";

import { Icon } from "@/components/ui/icons";
import { Flag } from "@/components/ui/flag";
import { flagSrc } from "@/lib/flag";

import { HUE_CLASSES, kindOf } from "./kind";

/** The top of a detail page: the kind's glyph in its tint, the name as the display line, the attributes as chips. */
export function DetailHeader({
  type,
  name,
  chips,
  aside,
  countryCode = null,
}: {
  type: string;
  name: string;
  chips: string[];
  aside?: ReactNode;
  countryCode?: string | null;
}) {
  const kind = kindOf(type);
  const hue = HUE_CLASSES[kind.hue];
  const flag = flagSrc(countryCode);
  return (
    <div className={`border-b border-hairline px-7 py-5 ${hue.tint}`}>
      <div className="flex items-start gap-4">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-canvas ${hue.text}`} title={countryCode ?? undefined}>
          {flag ? <Flag code={countryCode} height={22} /> : <Icon name={kind.icon} size={20} />}
        </span>
        <div className="min-w-0 grow">
          <div className="text-caption text-ink-tertiary">{kind.label}</div>
          <h1 className={`truncate font-display text-display font-normal tracking-[-0.01em] ${hue.text}`}>{name}</h1>
          {chips.length ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {chips.map((chip) => (
                <span key={chip} className="inline-flex h-[22px] items-center rounded-sm bg-canvas px-2 text-caption text-ink-secondary">
                  {chip}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        {aside}
      </div>
    </div>
  );
}

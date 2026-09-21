import Link from "next/link";

import { Icon } from "@/components/ui/icons";
import type { Counterpart } from "@/lib/api/ontology-schemas";

import { HUE_CLASSES, hrefFor, kindOf } from "./kind";

/** Things seen beside this one, most often first. A kind with no page of its own is a name, not a link. */
export function CounterpartList({ title, items, empty }: { title: string; items: Counterpart[]; empty: string }) {
  return (
    <section>
      <h3 className="text-caption font-medium text-ink-tertiary">{title}</h3>
      {items.length === 0 ? (
        <p className="mt-1 text-small text-ink-faint">{empty}</p>
      ) : (
        <ul className="mt-1">
          {items.map((item) => {
            const kind = kindOf(item.type);
            const href = hrefFor(item.type, item.id);
            const name = <span className={`block truncate text-small ${HUE_CLASSES[kind.hue].text}`}>{item.name}</span>;
            return (
              <li key={item.id} className="flex h-8 items-center gap-2 border-b border-hairline-faint">
                <Icon name={kind.icon} size={12} className="shrink-0 text-ink-faint" />
                {href ? (
                  <Link href={href} className="min-w-0 grow hover:underline">
                    {name}
                  </Link>
                ) : (
                  <span className="min-w-0 grow">{name}</span>
                )}
                <span className="font-mono text-mono-sm text-ink-tertiary">{item.count}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

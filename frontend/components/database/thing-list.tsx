import Link from "next/link";

import { Icon } from "@/components/ui/icons";
import type { EntityDetail, EntityRow } from "@/lib/api/ontology-schemas";
import type { EntityKind } from "@/lib/api/semantic-schemas";
import { formatWhenShort } from "@/lib/when";

import { ThingOpen } from "./thing-open";

/**
 * The same data read as records the model built, 52px a row, one open in place.
 *
 * The columns are what a reader of this kind of thing asks: how often it has
 * been read, how many emails name it, and when it was last seen. The spellings
 * count left with phase 10g: it is a sentence in the opened row now, and this
 * list sits between two rails where a fifth column cost the name its width.
 *
 * `Appearances` counts both halves. A port is read out of a document's
 * fields and a carrier out of a subject line, so a column that counted only
 * the first read 0 for every carrier, vessel and person on the page.
 */

/** What each kind is and where it was read, short enough to sit under a name. */
const READ_AS: Record<EntityKind, string> = {
  port: "Port, read out of documents",
  party: "Party, read out of documents",
  carrier: "Carrier, read out of the mail",
  vessel: "Vessel, read out of the mail",
  commodity: "Commodity, as the mail describes it",
  person: "Person, from a header or a signature",
};

interface ThingListProps {
  rows: EntityRow[];
  openId: string | null;
  detail: EntityDetail | null;
  /** Where opening a row leads, and where closing it leads back to. */
  hrefFor(id: string | null): string;
  /** Where the opened row's own page is. Passed in, because two pages host this list. */
  recordHrefFor(id: string): string;
}

export function ThingList({ rows, openId, detail, hrefFor, recordHrefFor }: ThingListProps) {
  return (
    <div className="flex min-h-0 grow flex-col">
      <div className="flex h-[34px] shrink-0 items-center gap-4 border-b border-hairline px-7">
        <span className="w-[52px] text-caption text-ink-faint">Seen</span>
        <span className="grow text-caption text-ink-faint">Name</span>
        <span className="w-14 text-right text-caption text-ink-faint">Emails</span>
        <span className="w-[92px] text-right text-caption text-ink-faint">Last seen</span>
        <span className="w-4" />
      </div>

      <ul className="min-h-0 grow overflow-y-auto">
        {rows.map((row) => {
          const open = row.id === openId;
          return (
            <li key={row.id}>
              <Link
                href={hrefFor(open ? null : row.id)}
                aria-expanded={open}
                className={`flex h-[52px] w-full items-center gap-4 px-7 text-left ${
                  open ? "bg-surface" : "border-b border-hairline-faint hover:bg-surface"
                }`}
              >
                <span className="w-[52px] shrink-0">
                  <span
                    className={`inline-flex h-[21px] items-center rounded-sm px-[7px] font-mono text-mono-xs ${
                      open ? "bg-ink text-ink-inverse" : "bg-sunken text-ink-secondary"
                    }`}
                  >
                    {row.mentions + row.sightings}
                  </span>
                </span>
                <span className="min-w-0 grow">
                  <span className={`block truncate text-heading ${open ? "font-semibold" : "font-medium"}`}>{row.name}</span>
                  <span className="block truncate text-caption text-ink-faint">
                    {READ_AS[row.type as EntityKind] ?? "Read out of the mail"}
                  </span>
                </span>
                <span className="w-14 shrink-0 text-right text-strong text-ink-secondary">{row.emails}</span>
                <span className="w-[92px] shrink-0 text-right text-small text-ink-faint">
                  {row.lastSeen ? formatWhenShort(row.lastSeen) : "never"}
                </span>
                <Icon name="chevron" size={14} className={`shrink-0 text-ink-faint ${open ? "-rotate-90" : "rotate-90"}`} />
              </Link>
              {open && detail ? <ThingOpen detail={detail} recordHref={recordHrefFor(row.id)} /> : null}
              {open && !detail ? (
                <p className="border-b border-hairline bg-surface px-7 py-4 text-small text-ink-faint">
                  Nothing more is stored about this one.
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>

      {rows.length === 0 ? (
        <p className="px-7 py-6 text-small text-ink-tertiary">
          Nothing of this kind has been read out of a document yet. These appear once a run has extracted and judged a
          pair of documents.
        </p>
      ) : null}
    </div>
  );
}

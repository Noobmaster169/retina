import Link from "next/link";

import { Icon } from "@/components/ui/icons";
import type { TableRowDetail } from "@/lib/api/database-schemas";

/**
 * The 380px drawer: one row as fields, then what points at it by foreign key.
 *
 * The foreign key list is the join between the two halves of this page. A
 * reader who wants to know what a row is connected to gets the literal answer
 * here, and the button at the foot takes them to the same thing read as a
 * record instead.
 */

interface RowDrawerProps {
  detail: TableRowDetail;
  runId: string;
  /** The same table with no row open. A link, because which row is open is in the URL. */
  closeHref: string;
}

export function RowDrawer({ detail, runId, closeHref }: RowDrawerProps) {
  return (
    <aside aria-label="The selected row" className="flex w-[380px] shrink-0 flex-col bg-surface">
      <header className="flex h-14 shrink-0 items-center gap-2.5 border-b border-hairline px-[18px]">
        <span className="min-w-0 truncate font-mono text-strong font-medium">{detail.id}</span>
        <span className="grow" />
        <Link
          href={closeHref}
          aria-label="Close"
          className="flex h-[26px] w-[26px] items-center justify-center rounded-sm hover:bg-active"
        >
          <Icon name="chevron" size={12} className="rotate-180 text-ink-tertiary" />
        </Link>
      </header>

      <div className="min-h-0 grow overflow-y-auto">
        <h3 className="px-[18px] pt-3.5 text-caption font-medium text-ink-tertiary">The row</h3>
        <dl>
          {detail.fields.map((field) => (
            <div key={field.key} className="border-b border-hairline-faint px-[18px] py-2">
              <dt className="flex items-center gap-[7px]">
                <span className="inline-flex h-[15px] shrink-0 items-center rounded-xs bg-active px-1 font-mono text-[9px] text-ink-tertiary">
                  {field.columnType}
                </span>
                <span className="font-mono text-mono-xs text-ink-tertiary">{field.key}</span>
              </dt>
              {/*
                An email body is a page of text and the list of what points at
                this row is the reason the drawer exists. Six lines is enough
                to recognise a value; the whole of it is on the email's page.
              */}
              <dd
                className={`mt-1 line-clamp-6 text-small leading-[18px] break-words ${
                  field.value === null ? "text-hairline-strong" : "text-ink"
                }`}
                title={field.value ?? undefined}
              >
                {field.value ?? "null"}
              </dd>
            </div>
          ))}
        </dl>

        <div className="flex items-center px-[18px] pt-3.5">
          <h3 className="text-caption font-medium text-ink-tertiary">What points at this row</h3>
          <span className="grow" />
          <span className="text-caption text-ink-faint">by foreign key</span>
        </div>
        <ul className="px-[18px] pt-1.5">
          {detail.referencedBy.map((reference) => (
            <li
              key={`${reference.table}.${reference.column}`}
              className="flex h-[30px] items-center gap-2.5 border-t border-hairline-faint"
            >
              <span className="min-w-0 truncate font-mono text-mono-sm text-ink-secondary">{reference.table}</span>
              <span className="shrink-0 text-micro text-hairline-strong">{reference.column}</span>
              <span className="grow" />
              <span className={`shrink-0 text-small font-medium ${reference.count === 0 ? "text-hairline-strong" : "text-ink"}`}>
                {reference.count}
              </span>
            </li>
          ))}
          {detail.referencedBy.length === 0 ? (
            <li className="py-2 text-small text-ink-faint">Nothing has a foreign key to this table.</li>
          ) : null}
        </ul>
      </div>

      {detail.asObject ? (
        <div className="shrink-0 border-t border-hairline px-[18px] py-3">
          <Link
            href={`/runs/${runId}/database?view=things&type=${detail.asObject.type}&id=${encodeURIComponent(detail.asObject.id)}`}
            className="flex h-[34px] items-center gap-2 rounded-md bg-active px-[11px]"
          >
            <Icon name="graph" size={13} className="text-ink-secondary" />
            <span className="text-strong font-medium text-ink-secondary">See it as a record, not a row</span>
            <span className="grow" />
            <Icon name="chevron" size={12} className="text-ink-tertiary" />
          </Link>
        </div>
      ) : null}
    </aside>
  );
}

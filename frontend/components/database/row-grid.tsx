import Link from "next/link";

import type { ColumnType, TablePage } from "@/lib/api/database-schemas";

/**
 * The literal view: typed column headers, 36px rows, and the SQL that produced
 * the page along its foot.
 *
 * The SQL is not debug output. It is the same argument the chat makes with its
 * query block, made by the page a reader is most likely to disbelieve: this is
 * what ran, and these are the rows it returned.
 */

/** Fixed widths, because a grid whose columns resize as you page through it is harder to read than a narrow one. */
const WIDTH_OF: Record<ColumnType, number> = {
  pk: 132,
  fk: 112,
  abc: 220,
  "123": 92,
  "1.0": 92,
  date: 156,
  bool: 76,
  json: 200,
  list: 168,
};

interface RowGridProps {
  page: TablePage;
  /** The row the drawer is open on, by its first column's value. */
  selectedId: string | null;
  /** Where clicking a row leads. A real link, so the row is reachable by Tab and openable in a tab. */
  hrefFor(id: string): string;
}

export function RowGrid({ page, selectedId, hrefFor }: RowGridProps) {
  return (
    <div className="flex min-w-0 grow flex-col border-r border-hairline">
      <div className="min-h-0 grow overflow-auto">
        <table className="border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="bg-surface">
              <th className="w-10 border-r border-b border-hairline-faint bg-surface" />
              {page.columns.map((column) => (
                <th
                  key={column.name}
                  style={{ width: WIDTH_OF[column.columnType] }}
                  title={`${column.dataType}${column.nullable ? "" : " not null"}`}
                  className="border-r border-b border-hairline-faint bg-surface px-[11px] text-left font-normal"
                >
                  <span className="flex h-[34px] items-center gap-1.5">
                    <span className="inline-flex h-[15px] shrink-0 items-center rounded-xs bg-active px-1 font-mono text-[9px] text-ink-tertiary">
                      {column.columnType}
                    </span>
                    <span className="min-w-0 truncate font-mono text-mono-sm text-ink-secondary">{column.name}</span>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {page.rows.map((row, index) => {
              const id = row[0] ?? String(index);
              const selected = id === selectedId;
              return (
                <tr
                  key={id}
                  className={`relative h-9 border-b border-hairline-faint ${
                    selected ? "bg-signal-tint shadow-[inset_2px_0_0_0_var(--signal)]" : "hover:bg-sunken"
                  }`}
                >
                  <td className="border-r border-hairline-faint text-center font-mono text-[10.5px] text-ink-faint">
                    {/*
                      One real anchor per row, stretched over it. A tr with an
                      onClick is unreachable by Tab and silent to a screen
                      reader; this is clickable anywhere and is still a link.
                    */}
                    <Link href={hrefFor(id)} className="after:absolute after:inset-0 after:content-['']">
                      <span className="sr-only">Open row {id}</span>
                      {page.offset + index + 1}
                    </Link>
                  </td>
                  {row.map((cell, column) => (
                    <Cell
                      key={page.columns[column].name}
                      value={cell}
                      type={page.columns[column].columnType}
                      first={column === 0}
                      selected={selected}
                    />
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <footer className="flex h-10 shrink-0 items-center gap-2.5 border-t border-hairline bg-surface px-5">
        <span className="shrink-0 text-caption text-ink-tertiary">
          Showing {page.rows.length} of {page.total.toLocaleString()}
        </span>
        <span className="grow" />
        <code className="min-w-0 truncate font-mono text-mono-xs text-ink-faint">{page.sql}</code>
      </footer>
    </div>
  );
}

function Cell({ value, type, first, selected }: { value: string | null; type: ColumnType; first: boolean; selected: boolean }) {
  // A null is a fact about the row, so it is drawn as one rather than as an
  // empty cell that reads as "nothing was loaded".
  const mono = type !== "abc";
  const ink = value === null ? "text-hairline-strong" : first ? (selected ? "font-medium text-signal" : "text-ink") : "text-ink-secondary";
  return (
    <td style={{ width: WIDTH_OF[type] }} className="border-r border-hairline-faint px-[11px]">
      <span className={`block truncate ${mono ? "font-mono text-mono-sm" : "text-small"} ${ink}`}>{value ?? "null"}</span>
    </td>
  );
}

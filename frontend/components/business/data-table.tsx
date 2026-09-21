"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

/** A sortable table over any rows. A row with an href opens on click and on Enter. */
export interface Column<T> {
  key: string;
  label: string;
  width?: string;
  mono?: boolean;
  sort?(row: T): string | number | null;
  cell(row: T): ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  keyOf(row: T): string;
  hrefOf?(row: T): string | null;
  empty: string;
  /** Below this width in pixels the table scrolls sideways instead of squeezing every column. Its header then stops sticking. */
  minWidth?: number;
}

type Sort = { key: string; dir: 1 | -1 } | null;

function sorted<T>(rows: T[], column: Column<T> | undefined, sort: Sort): T[] {
  const by = column?.sort;
  if (!by || !sort) return rows;
  return [...rows].sort((a, b) => {
    const av = by(a);
    const bv = by(b);
    if (av === null) return 1;
    if (bv === null) return -1;
    return (av < bv ? -1 : av > bv ? 1 : 0) * sort.dir;
  });
}

export function DataTable<T>({ columns, rows, keyOf, hrefOf, empty, minWidth }: DataTableProps<T>) {
  const router = useRouter();
  const [sort, setSort] = useState<Sort>(null);
  const column = sort ? columns.find((c) => c.key === sort.key) : undefined;
  const shown = sorted(rows, column, sort);

  if (rows.length === 0) return <p className="py-10 text-center text-body text-ink-tertiary">{empty}</p>;

  const table = (
    <table className="w-full border-collapse text-small" style={minWidth ? { minWidth } : undefined}>
      <thead className="sticky top-0 z-10 bg-canvas">
        <tr className="border-b border-hairline-strong text-left">
          {columns.map((c) => (
            <th
              key={c.key}
              style={{ width: c.width }}
              aria-sort={sort?.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : undefined}
              className="h-9 px-2 text-caption font-medium text-ink-tertiary"
            >
              {c.sort ? (
                <button
                  type="button"
                  onClick={() =>
                    setSort((was) => (was?.key === c.key ? { key: c.key, dir: was.dir === 1 ? -1 : 1 } : { key: c.key, dir: 1 }))
                  }
                  className="hover:text-ink"
                >
                  {c.label}
                  {sort?.key === c.key ? (sort.dir === 1 ? " ↑" : " ↓") : ""}
                </button>
              ) : (
                c.label
              )}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {shown.map((row) => {
          const href = hrefOf?.(row) ?? null;
          return (
            <tr
              key={keyOf(row)}
              tabIndex={href ? 0 : undefined}
              onClick={href ? () => router.push(href) : undefined}
              onKeyDown={
                href
                  ? (event) => {
                      if (event.key === "Enter") router.push(href);
                    }
                  : undefined
              }
              className={`border-b border-hairline-faint ${href ? "cursor-pointer hover:bg-active" : ""}`}
            >
              {columns.map((c) => (
                <td key={c.key} className={`h-10 max-w-0 truncate px-2 ${c.mono ? "font-mono text-mono-sm" : ""}`}>
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
  return minWidth ? <div className="overflow-x-auto">{table}</div> : table;
}

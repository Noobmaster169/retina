import type { ReactNode } from "react";

import { ListPage } from "@/components/business/list-page";
import type { ListCopy } from "@/components/business/list-copy";

import { TopBar } from "./top-bar";

/**
 * What a page is while its data is still being read.
 *
 * Not a spinner and not a grey rectangle: the page itself, as far as it can be
 * drawn without having read anything. A heading, a sentence under it, a crumb,
 * a toolbar, the frame of each card and the name of each column are all
 * written in this repository rather than fetched, so all of them can be on
 * screen in the first frame. What stays grey is only what a person is actually
 * waiting for, which is the values.
 *
 * That is worth more than the milliseconds it saves. A reader who sees the
 * shape of the page knows what is coming and where to look when it lands, and
 * the arriving page settles into a layout that is already there instead of
 * replacing a blank screen.
 */

/** One value, at the weight the type will be. */
export function Bar({ className = "" }: { className?: string }) {
  return <div className={`rounded-xs bg-sunken ${className}`} />;
}

/** The display line a page opens with, as the real pages set it. */
export function PageHeading({ title, lede }: { title: string; lede?: string }) {
  return (
    <div className="py-5">
      <h1 className="font-display text-display font-normal tracking-[-0.01em]">{title}</h1>
      {lede ? <p className="mt-0.5 max-w-[68ch] text-body text-ink-tertiary">{lede}</p> : null}
    </div>
  );
}

/** A page that is not a list: its crumb, and whatever it can draw of itself. */
export function PageFrame({ crumbs, children }: { crumbs: string[]; children: ReactNode }) {
  return (
    <div className="flex min-w-0 grow flex-col" aria-busy="true">
      <TopBar crumbs={crumbs.map((label) => ({ label }))} />
      <main className="min-h-0 grow overflow-y-auto px-7 pb-8">{children}</main>
    </div>
  );
}

/**
 * A list page, drawn by the same component the real one uses, so the heading,
 * the sentence and the spacing are not a second opinion about what the page
 * looks like: they are the page.
 */
export function ListTemplate({ copy, children }: { copy: ListCopy; children: ReactNode }) {
  return (
    <div className="flex min-w-0 grow flex-col" aria-busy="true">
      <ListPage {...copy} toolbar={<ToolbarTemplate />}>
        {children}
      </ListPage>
    </div>
  );
}

/** The search field, the selects and the view toggle, at their real heights. */
function ToolbarTemplate() {
  return (
    <>
      <Bar className="h-[30px] w-[220px] rounded-md" />
      <Bar className="h-[30px] w-[120px] rounded-md" />
      <Bar className="h-[30px] w-[120px] rounded-md" />
      <span className="grow" />
      <Bar className="h-[30px] w-[92px] rounded-md" />
    </>
  );
}

/** Rows under their real column names, so the table is recognisable before it has any. */
export function TableTemplate({ columns, rows = 12 }: { columns: readonly { label: string; width?: string }[]; rows?: number }) {
  return (
    <table className="w-full text-left">
      <thead>
        <tr className="border-b border-hairline">
          {columns.map((column) => (
            <th key={column.label} className={`px-2 py-1.5 text-caption font-medium text-ink-tertiary ${column.width ?? ""}`}>
              {column.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: rows }, (_, at) => (
          <tr key={at} className="border-b border-hairline-faint">
            {columns.map((column) => (
              <td key={column.label} className="px-2 py-2.5">
                <Bar className="h-3.5 w-full max-w-[160px]" />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

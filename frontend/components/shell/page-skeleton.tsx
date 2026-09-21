import { TopBar } from "./top-bar";

/**
 * What a page is while its data is still being read.
 *
 * It exists so that clicking something changes the screen. Without a loading
 * boundary a navigation leaves the person on the page they are leaving, with
 * no sign the click landed, until the server has finished every read behind
 * the next one; the rail highlights the new destination and nothing else
 * moves. Next only streams a shell where a route declares one, so each route
 * that reads anything declares this.
 *
 * It draws the frame the page will have, not a spinner: the top bar is at the
 * height the real one is, and the blocks sit where the real content sits, so
 * the arriving page replaces the skeleton rather than pushing it around.
 */

/** One block of the real thing, at the weight the type will be. */
export function Bar({ className = "" }: { className?: string }) {
  return <div className={`rounded-xs bg-sunken ${className}`} />;
}

export function PageSkeleton({ crumbs, children }: { crumbs: string[]; children?: React.ReactNode }) {
  return (
    <div className="flex min-w-0 grow flex-col" aria-busy="true">
      <TopBar crumbs={crumbs.map((label) => ({ label }))} />
      <main className="min-h-0 grow overflow-y-auto px-7 pb-8">
        {children ?? (
          <div className="space-y-3 py-5">
            <Bar className="h-7 w-64" />
            <Bar className="h-4 w-96" />
          </div>
        )}
      </main>
    </div>
  );
}

/** The card grids the business lists draw, at the card's real height. */
export function CardGridSkeleton({ cards = 8 }: { cards?: number }) {
  return (
    <>
      <div className="space-y-3 py-5">
        <Bar className="h-7 w-56" />
        <Bar className="h-4 w-80" />
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
        {Array.from({ length: cards }, (_, at) => (
          <Bar key={at} className="h-[148px]" />
        ))}
      </div>
    </>
  );
}

/** A thing's own page: a header band, then sections. */
export function DetailSkeleton() {
  return (
    <>
      <div className="flex items-start gap-3 py-5">
        <Bar className="h-10 w-10 rounded-md" />
        <div className="space-y-2">
          <Bar className="h-7 w-72" />
          <Bar className="h-4 w-52" />
        </div>
      </div>
      <div className="space-y-3">
        <Bar className="h-40 w-full rounded-xl" />
        <Bar className="h-64 w-full rounded-xl" />
      </div>
    </>
  );
}

/** Rows: the inbox, the runs, the senders, the held mail. */
export function TableSkeleton({ rows = 12 }: { rows?: number }) {
  return (
    <>
      <div className="space-y-3 py-5">
        <Bar className="h-7 w-56" />
        <Bar className="h-4 w-80" />
      </div>
      <div className="space-y-1.5">
        {Array.from({ length: rows }, (_, at) => (
          <Bar key={at} className="h-9 w-full" />
        ))}
      </div>
    </>
  );
}

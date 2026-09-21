import { Bar } from "@/components/shell/page-skeleton";
import { TopBar } from "@/components/shell/top-bar";

/** The schema rail, then the rows of whichever table is open. */
export default function Loading() {
  return (
    <div className="flex min-w-0 grow flex-col" aria-busy="true">
      <TopBar crumbs={[{ label: "Runs" }, { label: "Database" }]} />
      <div className="flex min-h-0 grow">
        <div className="hidden w-[232px] shrink-0 flex-col gap-1.5 border-r border-hairline p-3 md:flex">
          {Array.from({ length: 12 }, (_, at) => (
            <Bar key={at} className="h-[27px] w-full rounded-sm" />
          ))}
        </div>
        <div className="min-w-0 grow space-y-1.5 p-7">
          <Bar className="h-7 w-64" />
          <Bar className="mt-3 h-9 w-full" />
          {Array.from({ length: 14 }, (_, at) => (
            <Bar key={at} className="h-8 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}

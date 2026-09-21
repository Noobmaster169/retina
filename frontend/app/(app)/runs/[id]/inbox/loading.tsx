import { Bar } from "@/components/shell/page-skeleton";
import { TopBar } from "@/components/shell/top-bar";

/**
 * Two panes, as the inbox really is: the 300px list on the left at the row
 * height it really uses, and the reading pane beside it.
 */
export default function Loading() {
  return (
    <div className="flex min-w-0 grow flex-col" aria-busy="true">
      <TopBar crumbs={[{ label: "Runs" }, { label: "Inbox" }]} />
      <div className="flex min-h-0 grow">
        <div className="w-full shrink-0 flex-col border-r border-hairline md:w-[300px]">
          <div className="flex h-14 shrink-0 items-center px-[18px]">
            <h2 className="text-[16px] font-semibold tracking-[-0.015em]">Inbox</h2>
          </div>
          <div className="flex gap-1.5 px-[18px] pb-3">
            <Bar className="h-[24px] w-16 rounded-sm" />
            <Bar className="h-[24px] w-20 rounded-sm" />
            <Bar className="h-[24px] w-16 rounded-sm" />
          </div>
          {Array.from({ length: 9 }, (_, at) => (
            <div key={at} className="flex h-[86px] items-center gap-3 border-b border-hairline-faint px-[18px]">
              <Bar className="h-8 w-8 shrink-0 rounded-full" />
              <div className="min-w-0 grow space-y-1.5">
                <Bar className="h-3.5 w-2/3" />
                <Bar className="h-3.5 w-full" />
                <Bar className="h-3 w-1/3" />
              </div>
            </div>
          ))}
        </div>
        <div className="hidden min-w-0 grow flex-col gap-3 p-7 md:flex">
          <Bar className="h-7 w-96" />
          <Bar className="h-4 w-64" />
          <Bar className="mt-2 h-72 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}

import { Bar } from "@/components/shell/page-skeleton";
import { TopBar } from "@/components/shell/top-bar";

/** A conversation's own shape: a question to the right, an answer under it, the composer at the foot. */
export default function Loading() {
  return (
    <div className="flex min-w-0 grow flex-col" aria-busy="true">
      <TopBar crumbs={[{ label: "Runs" }, { label: "Ask Retina" }]} />
      <div className="min-h-0 grow overflow-y-auto px-7">
        <div className="max-w-[72ch] space-y-6 py-5">
          <div className="flex justify-end">
            <Bar className="h-9 w-64 rounded-lg" />
          </div>
          <div className="space-y-2.5">
            <Bar className="h-4 w-full" />
            <Bar className="h-4 w-5/6" />
            <Bar className="h-4 w-2/3" />
          </div>
        </div>
      </div>
      <div className="shrink-0 px-7 pb-6">
        <Bar className="h-[52px] w-full max-w-[72ch] rounded-lg" />
      </div>
    </div>
  );
}

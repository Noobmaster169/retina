import type { RunSummary } from "@/lib/api/runs-schemas";

/**
 * What to call a run. The contract has no name field, so a run is named by
 * when it started, which is how a person refers to one anyway: the morning
 * run, yesterday's overnight run. The id stays in the breadcrumb and in the
 * switcher, where an identifier belongs.
 *
 * One function, because the run page's display line, the rail's switcher and
 * the runs list all name the same run and must not disagree.
 */
export function runName(run: Pick<RunSummary, "startedAt" | "createdAt">): string {
  const at = run.startedAt ?? run.createdAt;
  const when = new Date(at);
  const hour = when.getHours();
  const part = hour < 5 ? "Overnight" : hour < 12 ? "Morning" : hour < 17 ? "Afternoon" : "Evening";
  const today = new Date().toDateString() === when.toDateString();
  return today ? `${part} run` : `${part} run, ${when.toLocaleDateString(undefined, { day: "numeric", month: "short" })}`;
}

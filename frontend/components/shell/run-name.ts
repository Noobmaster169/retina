import type { RunSummary } from "@/lib/api/runs-schemas";

/**
 * What to call a run: what a person called it, or when it started.
 *
 * The clock name is the default and not a placeholder. It is how a person
 * refers to a run anyway, the morning run, yesterday's overnight run, so an
 * unnamed run reads as named and the title on the run page can be edited in
 * place without ever having been empty. The id stays in the breadcrumb and in
 * the switcher, where an identifier belongs.
 *
 * One function, because the run page's display line, the rail's switcher and
 * the runs list all name the same run and must not disagree.
 */
export function runName(run: Pick<RunSummary, "name" | "startedAt" | "createdAt">): string {
  if (run.name) return run.name;
  return clockName(run);
}

/** What the run is called when nobody has named it, which is also what the field offers as a placeholder. */
export function clockName(run: Pick<RunSummary, "startedAt" | "createdAt">): string {
  const at = run.startedAt ?? run.createdAt;
  const when = new Date(at);
  const hour = when.getHours();
  const part = hour < 5 ? "Overnight" : hour < 12 ? "Morning" : hour < 17 ? "Afternoon" : "Evening";
  const today = new Date().toDateString() === when.toDateString();
  return today ? `${part} run` : `${part} run, ${when.toLocaleDateString(undefined, { day: "numeric", month: "short" })}`;
}

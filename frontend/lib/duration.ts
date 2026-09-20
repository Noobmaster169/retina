/** A run's length for people: "45 s", "3 min 20 s", "1 h 05 min". Null before it starts. */
export function formatDuration(ms: number | null): string {
  if (ms === null) return "not started";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ${String(s % 60).padStart(2, "0")} s`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`;
}

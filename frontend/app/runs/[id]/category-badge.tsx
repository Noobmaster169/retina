import type { RunEmailItem } from "@/lib/api/trace-schemas";

/** The final category, and who settled it when that was not the generator alone. The trace shows both answers. */
export function CategoryBadge({ email }: { email: RunEmailItem }) {
  if (!email.category) return <span className="text-xs text-muted">not yet</span>;
  return (
    <div>
      <div className="font-medium">{email.category}</div>
      {email.decidedBy === "verifier" && <div className="text-xs text-amber-700">checked by the verifier</div>}
      {email.decidedBy === "human" && <div className="text-xs text-accent-ink">set by a person</div>}
    </div>
  );
}

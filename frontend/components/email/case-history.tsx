import { Chip } from "@/components/ui/chip";
import type { ReviewActionView } from "@/lib/api/review-schemas";

/**
 * What people have done about this case, oldest first. It is the audit trail
 * the product promises and it is also the raw material phase 11 drafts lessons
 * from, so a row says what was written and who wrote it, not what it achieved.
 */

/** What each kind reads as. The enum itself never appears: plain English first, per section 2.2. */
const WORDS: Record<string, string> = {
  confirm: "agreed it needs a person",
  correct_field: "recorded what a document reads",
  reclassify: "recorded what the email is",
  note: "left a note",
  upload: "supplied a document",
  retry: "sent it back through",
  reopen: "put the case back",
};

export function CaseHistory({ actions }: { actions: ReviewActionView[] }) {
  if (actions.length === 0) return null;
  return (
    <section className="pb-4 pl-3 pt-3.5">
      <h3 className="text-small font-medium text-ink-tertiary">What has been done about it</h3>
      <div className="mt-1.5">
        {actions.map((action) => (
          <div key={action.id} className="flex items-baseline gap-2 border-t border-hairline-faint py-2">
            <span className="shrink-0 text-small font-medium">{action.actor}</span>
            <span className="shrink-0 text-small text-ink-secondary">{WORDS[action.kind] ?? action.kind}</span>
            {action.field ? (
              <Chip mono className="h-[19px] rounded-xs px-1.5">
                {action.side ? `${action.side} ${action.field}` : action.field}
              </Chip>
            ) : null}
            {action.newValue ? (
              <span className="min-w-0 grow truncate font-mono text-mono-sm text-ink-tertiary">
                {action.oldValue === null ? action.newValue : `${action.oldValue} to ${action.newValue}`}
              </span>
            ) : (
              <span className="min-w-0 grow truncate text-small text-ink-tertiary">{action.note ?? ""}</span>
            )}
            <span className="shrink-0 text-caption text-ink-faint">{when(action.createdAt)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function when(at: string): string {
  const minutes = Math.round((Date.now() - Date.parse(at)) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  return new Date(at).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

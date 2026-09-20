import { Button } from "@/components/ui/button";

/**
 * Every write path this page will offer, drawn and disabled. Phase 8 builds
 * `review_actions` and the three routes behind these; the bar is here now so
 * the page's height is settled and phase 8 adds a handler rather than a layout.
 *
 * Nothing here arbitrates. `Correct a field` records what a person says the
 * value is; it never declares one document right.
 */
export function ActionBar({ review }: { review: boolean }) {
  return (
    <div className="flex h-[60px] shrink-0 items-center gap-2 border-t border-hairline px-6">
      <Button variant="primary" shortcut="C" disabled title="Writing arrives in phase 8">
        {review ? "Agree, it needs a person" : "Confirm"}
      </Button>
      <Button variant="secondary" shortcut={review ? "U" : "E"} disabled title="Writing arrives in phase 8">
        {review ? "Upload a readable copy" : "Correct a field"}
      </Button>
      <Button variant="secondary" disabled title="Writing arrives in phase 8">
        Reclassify
      </Button>
      <span className="grow" />
      <span className="text-caption text-ink-tertiary">Writing arrives in phase 8</span>
      <Button variant="secondary" shortcut="N" disabled title="Writing arrives in phase 8">
        Note
      </Button>
    </div>
  );
}

import type { ProposedAction } from "@/lib/api/chat-agent-schemas";

/**
 * What the conversation would write, drawn before anything is written.
 *
 * The contract is docs/03-infra-deep.md section 5.5. Phase 10's scope puts
 * write tools out, so the agent has no tool that could apply one and both
 * buttons are disabled with the reason under them.
 *
 * Drawn rather than hidden on purpose. The card is the thing phase 11 turns
 * on, and a person who can see exactly what would be written, and that
 * nothing has been, understands the product better than one shown nothing at
 * all. `not written yet` is in the header for the same reason.
 */

export function ActionCard({ proposal }: { proposal: ProposedAction }) {
  const blocked = proposal.blockedReason !== null;
  return (
    <section className="overflow-hidden rounded-lg border border-review-line bg-canvas">
      <header className="flex items-center gap-2 border-b border-review-tint bg-review-tint/40 px-3 py-2.5">
        <span className="inline-flex h-5 shrink-0 items-center rounded-xs bg-review-tint px-1.5 font-mono text-[10.5px] text-review">
          {proposal.kind}
        </span>
        {proposal.field ? (
          <span className="font-mono text-mono-xs text-ink-secondary">
            {proposal.field}
            {proposal.side ? ` (${proposal.side})` : ""}
          </span>
        ) : null}
        <span className="grow" />
        <span className="text-caption text-ink-faint">not written yet</span>
      </header>

      <div className="px-3 py-2.5">
        {proposal.was !== null || proposal.is !== null ? (
          <dl className="space-y-1">
            <Row label="was" value={proposal.was} tone="text-differ" />
            <Row label="is" value={proposal.is} tone="text-match" />
          </dl>
        ) : null}
        {proposal.note ? <p className="mt-2 text-small leading-[18px] text-ink-secondary">{proposal.note}</p> : null}
        <p className="mt-2 text-caption leading-[17px] text-ink-tertiary">{proposal.effect}</p>
      </div>

      <div className="flex items-center gap-2 border-t border-review-tint px-3 py-2.5">
        <button
          type="button"
          disabled={blocked}
          className="h-[30px] rounded-md bg-review px-3 text-small font-medium text-ink-inverse disabled:cursor-not-allowed disabled:bg-sunken disabled:text-ink-faint"
        >
          Apply and remember
        </button>
        <button
          type="button"
          disabled={blocked}
          className="h-[30px] rounded-md border border-hairline-strong px-3 text-small text-ink-secondary disabled:cursor-not-allowed disabled:text-ink-faint"
        >
          Just this once
        </button>
      </div>

      {proposal.blockedReason ? (
        <p className="border-t border-review-tint px-3 py-2 text-caption leading-[17px] text-ink-tertiary">
          {proposal.blockedReason}
        </p>
      ) : null}
    </section>
  );
}

function Row({ label, value, tone }: { label: string; value: string | null; tone: string }) {
  return (
    <div className="flex items-start gap-2">
      <dt className="w-7 shrink-0 pt-px text-caption text-ink-faint">{label}</dt>
      <dd className={`min-w-0 grow font-mono text-mono-xs leading-[17px] ${value === null ? "text-ink-faint" : tone}`}>
        {value ?? "nothing"}
      </dd>
    </div>
  );
}

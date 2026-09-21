import Link from "next/link";

import { Chip } from "@/components/ui/chip";
import type { ConsignmentDetail, ConsignmentStatement } from "@/lib/api/shipment-schemas";

/**
 * One consignment: what it is filed under, the things on it, and what each
 * email said about it.
 *
 * The parties come first and in the order a bill of lading prints them, not in
 * the order the columns happen to sit, because that order is how a
 * documentation clerk reads one. A role the judge disputed is marked here and
 * nowhere else on the page: it is the one thing about a shipment that is a
 * problem rather than a fact.
 */

export function ShipmentRecord({ detail, base }: { detail: ConsignmentDetail; base: string }) {
  const { row, parties, statements } = detail;
  const title = row.refs[0]?.value ?? `Shipment ${row.id}`;

  return (
    <>
      <div className="shrink-0 border-b border-hairline px-7 py-5">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-5 items-center rounded-xs bg-sunken px-1.5 font-mono text-[10.5px] text-ink-tertiary">
            shipment
          </span>
          <span className="inline-flex h-5 items-center rounded-xs bg-sunken px-1.5 text-[10.5px] text-ink-tertiary">
            {row.emails} email{row.emails === 1 ? "" : "s"} about it
          </span>
          {row.disputedFields.length > 0 ? (
            <Chip tone="differ">{row.disputedFields.join(", ")} differ</Chip>
          ) : null}
        </div>
        <h1 className="mt-1 truncate font-display text-[28px] leading-[34px] font-normal tracking-[-0.01em]">{title}</h1>
        <p className="mt-0.5 max-w-[72ch] text-small text-ink-tertiary">
          {row.lane ? `${row.lane.from} to ${row.lane.to}. ` : ""}
          Two emails are one shipment when they share a number. This one carries{" "}
          {row.refs.length === 0 ? "none" : row.refs.map((ref) => `${ref.label} ${ref.value}`).join(", ")}.
        </p>
      </div>

      <div className="flex min-h-0 grow overflow-hidden">
        <section className="w-[380px] shrink-0 overflow-y-auto border-r border-hairline px-[22px] py-4">
          <h2 className="text-caption font-medium text-ink-secondary">What is on it</h2>
          {parties.length === 0 ? (
            <p className="mt-1 max-w-[56ch] text-small text-ink-tertiary">
              Nothing has been resolved onto it yet. A shipment learns its parties from the documents the extractor read
              and its carrier from what the mail itself states.
            </p>
          ) : (
            <dl className="mt-1">
              {parties.map((party) => (
                <div key={`${party.role}-${party.id}`} className="flex items-baseline gap-2 border-t border-hairline-faint py-[7px]">
                  <dt className="w-[104px] shrink-0 text-caption text-ink-tertiary">{party.role}</dt>
                  <dd className="min-w-0 grow">
                    <Link
                      href={`${base.replace(/type=[a-z]+/, `type=${party.kind}`)}&id=${encodeURIComponent(party.id)}&tab=record`}
                      className={`text-small hover:underline hover:underline-offset-2 ${party.disputed ? "text-differ" : "text-ink"}`}
                    >
                      {party.name}
                    </Link>
                    {party.disputed ? (
                      <span className="ml-1.5 text-caption text-differ">the two documents disagree here</span>
                    ) : null}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </section>

        <section className="min-w-0 grow overflow-y-auto px-7 py-4">
          <h2 className="text-caption font-medium text-ink-secondary">What each email said</h2>
          {statements.map((statement) => (
            <Statement key={statement.emailId} statement={statement} />
          ))}
        </section>
      </div>
    </>
  );
}

function Statement({ statement }: { statement: ConsignmentStatement }) {
  const facts: { label: string; value: string }[] = [
    ["voyage", statement.voyage],
    ["HS code", statement.hsCode],
    ["containers", statement.containerCount === null ? null : String(statement.containerCount)],
    ["gross weight", statement.grossWeightKg === null ? null : `${statement.grossWeightKg} kg`],
    ["trade term", statement.tradeTerm],
    ["payment term", statement.paymentTerm],
    ["bill", statement.blType],
    ["freight", statement.freight],
    ...Object.entries(statement.attributes),
  ]
    .filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0)
    .map(([label, value]) => ({ label, value }));

  return (
    <article className="border-t border-hairline-faint py-3">
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-mono-sm text-ink">{statement.emailId}</span>
        <span className="grow" />
        <span className="shrink-0 font-mono text-mono-xs text-ink-faint">{statement.mailDate ?? "no date stated"}</span>
      </div>
      <p className="mt-0.5 max-w-[68ch] text-small leading-[18px] text-ink-secondary">{statement.subject}</p>

      {facts.length === 0 ? (
        <p className="mt-1 text-small text-ink-tertiary">It states nothing beyond the seven fields.</p>
      ) : (
        <dl className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1">
          {facts.map((fact) => (
            <div key={fact.label} className="flex items-baseline gap-1.5">
              <dt className="text-caption text-ink-tertiary">{fact.label}</dt>
              <dd className="text-small text-ink">{fact.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {statement.mailDateQuote ? (
        <p className="mt-1.5 border-l-2 border-hairline pl-2.5 font-mono text-mono-xs text-ink-tertiary">
          {statement.mailDateQuote}
        </p>
      ) : null}
    </article>
  );
}

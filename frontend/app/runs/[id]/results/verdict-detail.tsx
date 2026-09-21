"use client";

import { useState } from "react";
import useSWR from "swr";

import { CallsTab } from "@/components/email/calls-tab";
import { rowsOf } from "@/components/email/check-tab";
import { FieldRow } from "@/components/email/field-row";
import { Chip } from "@/components/ui/chip";
import { EvidenceWell } from "@/components/ui/marked-span";
import type { EmailVerdict } from "@/lib/api/scoring-schemas";
import { EmailTrace } from "@/lib/api/trace-schemas";
import { parsedFetcher } from "@/lib/poll";

import { CopyNote } from "./copy-note";
import { EFFECTS } from "./verdict-reading";

/**
 * Why this email came out the way it did, fetched only when a row is opened.
 * Everything here is what a reader wrote, quoted: the generator's case, the
 * case the verifier put against it, the judge's word on each of the seven
 * fields, and every call underneath them.
 */

export function VerdictDetail({ runId, verdict }: { runId: string; verdict: EmailVerdict }) {
  const { data: trace, error } = useSWR(
    `/api/runs/${runId}/emails/${verdict.emailId}/trace`,
    parsedFetcher(EmailTrace),
    { revalidateOnFocus: false },
  );
  const [openField, setOpenField] = useState<string | null>(null);

  if (error) {
    return <p className="px-4 py-4 text-small text-fault">This email&apos;s trace could not be read: {String(error.message ?? error)}</p>;
  }
  if (!trace) return <p className="px-4 py-4 text-small text-ink-tertiary">Reading the trace.</p>;

  const classification = trace.classification;
  const rows = rowsOf(trace);
  const effect = verdict.classify ? EFFECTS[verdict.classify.effect] : null;

  return (
    <div className="border-l-2 border-hairline-strong bg-surface px-4 py-3">
      {effect ? <p className="mb-3 max-w-[68ch] text-small text-ink-secondary">{effect.sentence}</p> : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Block title="The generator" aside={classification ? <Chip mono>{classification.generator.category}</Chip> : null}>
          {classification ? (
            <EvidenceWell quote={classification.generator.rationale || "It gave no reasoning."} />
          ) : (
            <p className="text-small text-ink-tertiary">This email was never classified.</p>
          )}
        </Block>

        <Block
          title="The verifier"
          aside={classification?.verifier ? <Chip mono>{classification.verifier.category}</Chip> : null}
        >
          {classification?.verifier ? (
            <>
              {classification.verifier.counterCases ? (
                <>
                  <p className="mb-1 text-caption text-ink-tertiary">The case against the proposal</p>
                  <EvidenceWell quote={classification.verifier.counterCases} />
                </>
              ) : null}
              <p className="mb-1 mt-2 text-caption text-ink-tertiary">Its verdict</p>
              <EvidenceWell quote={classification.verifier.rationale || "It gave no reasoning."} />
            </>
          ) : (
            <p className="text-small text-ink-tertiary">
              {classification?.verifierError
                ? `The call failed: ${classification.verifierError}`
                : "It did not run: the generator was above the confidence threshold."}
            </p>
          )}
        </Block>
      </div>

      {rows.length > 0 ? (
        <section className="mt-4">
          <h3 className="mb-1 text-caption text-ink-tertiary">The seven fields, as the judge read them</h3>
          {rows.map((row) => (
            <FieldRow
              key={row.judgement.field}
              row={row}
              open={openField === row.judgement.field}
              onToggle={() => setOpenField(openField === row.judgement.field ? null : row.judgement.field)}
            />
          ))}
        </section>
      ) : null}

      <section className="mt-4">
        <h3 className="mb-1 text-caption text-ink-tertiary">Every model call for this email</h3>
        <div className="-mx-6">
          <CallsTab calls={trace.calls} />
        </div>
      </section>

      <div className="mt-3 flex items-center gap-2">
        <CopyNote verdict={verdict} trace={trace} />
        <a href={`/runs/${runId}/emails/${verdict.emailId}`} className="text-small text-ink-tertiary underline underline-offset-2 hover:text-ink">
          Open the email
        </a>
      </div>
    </div>
  );
}

function Block({ title, aside, children }: { title: string; aside: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="min-w-0">
      <div className="mb-1.5 flex items-center gap-2">
        <h3 className="text-caption font-medium text-ink-secondary">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

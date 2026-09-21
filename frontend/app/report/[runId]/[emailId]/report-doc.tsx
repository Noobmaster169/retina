import { duration, promptsUsed, spendOf, tallyFields } from "@/components/report/report-figures";
import { openingLine, statusOf } from "@/components/email/email-reading";
import { senderAddress } from "@/components/email/sender";
import type { Email } from "@/lib/api/mail-client";
import type { EmailTrace } from "@/lib/api/trace-schemas";

/**
 * One email's check, as a page somebody can send to the client.
 *
 * Print first: no colour that has to survive a laser printer, no chip that
 * carries its meaning in a tint alone, and every section short enough that the
 * whole of an ordinary check is one sheet. The verdict is at the top, because
 * the person opening the attachment wants it before the evidence, and the
 * evidence is under it in the order somebody would check it.
 *
 * The timeline is not here. Ten model calls are how the answer was reached and
 * this document is the answer; what survives of the machinery is the last
 * block, which says what it cost and which prompt decided it, because a
 * verdict whose provenance cannot be read has to be taken on trust.
 */

export function ReportDoc({ trace, email }: { trace: EmailTrace; email: Email | null }) {
  const status = statusOf(trace);
  const fields = trace.comparison?.fields ?? [];
  const tally = tallyFields(fields);
  const differing = fields.filter((field) => !field.same && !field.missing);
  const spend = spendOf(trace.calls);
  const prompts = promptsUsed(trace.calls);
  const category = trace.classification?.humanCategory ?? trace.classification?.finalCategory ?? null;
  // The instruction before the draft drawn from it, which is the order the
  // table's columns read in and the order the two are checked in.
  const documents = [...trace.documents].sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role));

  return (
    <article className="mx-auto max-w-[820px] px-8 py-10 print:px-0 print:py-0">
      <header className="border-b-2 border-ink pb-3">
        <div className="flex items-baseline gap-2">
          <span className="font-display text-[19px]">Retina SDOC</span>
          <span className="text-caption text-ink-tertiary">document check</span>
          <span className="grow" />
          <span className="font-mono text-mono-sm">{status.value}</span>
        </div>
        <h1 className="mt-3 text-[17px] font-semibold leading-6 tracking-[-0.01em]">{email?.subject ?? trace.emailId}</h1>
        <p className="mt-1 font-mono text-mono-xs text-ink-tertiary">
          {trace.emailId}
          {email ? ` · ${senderAddress(email.from)}` : ""}
          {category ? ` · ${category}` : ""}
        </p>
      </header>

      <p className="mt-5 max-w-[74ch] text-body leading-6">{openingLine(trace)}</p>

      {differing.length > 0 ? (
        <Section title="What differs">
          {differing.map((field) => (
            <div key={field.field} className="mb-3 break-inside-avoid border-l-2 border-ink pl-3 last:mb-0">
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-mono-sm font-medium">{field.field}</span>
                <span className="grow" />
                {field.confidence === null ? null : (
                  <span className="text-caption text-ink-tertiary">{field.confidence.toFixed(2)} sure</span>
                )}
              </div>
              <Side label="SI" value={field.siValue} />
              <Side label="BL" value={field.blValue} />
              {field.rationale ? <p className="mt-1.5 max-w-[74ch] text-small leading-5">{field.rationale}</p> : null}
            </div>
          ))}
        </Section>
      ) : null}

      {fields.length > 0 ? (
        <Section title="Every field">
          <table className="w-full table-fixed border-collapse text-left">
            <thead>
              <tr className="border-b border-hairline-strong text-caption text-ink-tertiary">
                <th className="w-[26%] py-1.5 pr-2 font-normal">Field</th>
                <th className="w-[16%] py-1.5 pr-2 font-normal">Verdict</th>
                <th className="w-[29%] py-1.5 pr-2 font-normal">Shipping instruction</th>
                <th className="w-[29%] py-1.5 font-normal">Bill of lading</th>
              </tr>
            </thead>
            <tbody>
              {fields.map((field) => (
                <tr key={field.field} className="break-inside-avoid border-b border-hairline align-top">
                  <td className="py-1.5 pr-2 font-mono text-mono-xs">{field.field}</td>
                  <td className={`py-1.5 pr-2 text-caption ${field.same ? "text-ink-tertiary" : "font-medium"}`}>
                    {verdict(field.same, field.missing)}
                  </td>
                  <td className="py-1.5 pr-2 font-mono text-mono-xs break-words">{field.siValue ?? "nothing"}</td>
                  <td className="py-1.5 font-mono text-mono-xs break-words">{field.blValue ?? "nothing"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      ) : null}

      {trace.review ? (
        <Section title="Waiting for a person">
          <p className="max-w-[74ch] text-small leading-5">
            <span className="font-mono text-mono-sm">{trace.review.reason ?? "failed"}</span>
            <span className="text-ink-secondary">
              {` raised in the ${trace.review.stage} stage, ${trace.review.status}`}
              {trace.review.actions.length > 0
                ? `, ${trace.review.actions.length} action${trace.review.actions.length === 1 ? "" : "s"} recorded`
                : ", nothing recorded against it yet"}
              .
            </span>
          </p>
        </Section>
      ) : null}

      {documents.length > 0 ? (
        <Section title="The documents">
          {documents.map((document) => (
            <p key={document.filename} className="mb-1 flex items-baseline gap-2 text-small last:mb-0">
              <span className="w-8 shrink-0 font-mono text-mono-xs text-ink-tertiary">{document.role}</span>
              <span className="font-mono text-mono-xs">{document.filename}</span>
              <span className="text-caption text-ink-tertiary">
                {document.format}, {document.pages} page{document.pages === 1 ? "" : "s"}
                {document.docType ? `, read as ${document.docType}` : ""}
                {document.docTypeConfidence === null ? "" : ` at ${document.docTypeConfidence.toFixed(2)}`}
                {document.scanned ? ", a scan read by OCR" : ""}
                {document.unreadable ? ", could not be read" : ""}
              </span>
            </p>
          ))}
        </Section>
      ) : null}

      <Section title="How it was read">
        <p className="text-small leading-5">
          {tally.total > 0
            ? `${tally.total} fields compared: ${tally.same} agree, ${tally.differ} differ, ${tally.missing} with nothing to compare.`
            : "No pair was compared for this email."}
        </p>
        <p className="mt-1 text-small leading-5 text-ink-secondary">
          {spend.calls} model call{spend.calls === 1 ? "" : "s"} · {duration(spend.seconds)} inside the model ·{" "}
          {spend.tokens.toLocaleString()} tokens
          {spend.costUsd === null ? "" : ` · $${spend.costUsd.toFixed(4)}`}
        </p>
        {prompts.length > 0 ? (
          <p className="mt-1 font-mono text-mono-xs text-ink-tertiary">
            {prompts.map((prompt) => `${prompt.step} ${prompt.promptVersion} ${prompt.model}`).join(" · ")}
          </p>
        ) : null}
      </Section>

      <footer className="mt-8 border-t border-hairline pt-2 text-caption text-ink-tertiary">
        Every value above was read out of the two documents by a model and quoted back to its line. Nothing on this page
        was typed in by hand.
      </footer>
    </article>
  );
}

const ROLE_ORDER = ["SI", "BL", "UNKNOWN"];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 break-inside-avoid">
      <h2 className="mb-2 border-b border-hairline pb-1 text-caption font-medium uppercase tracking-[0.06em] text-ink-tertiary">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Side({ label, value }: { label: string; value: string | null }) {
  return (
    <p className="mt-1 flex items-baseline gap-2">
      <span className="w-6 shrink-0 font-mono text-mono-xs text-ink-tertiary">{label}</span>
      <span className="min-w-0 font-mono text-mono-sm break-words">{value ?? "nothing"}</span>
    </p>
  );
}

function verdict(same: boolean, missing: boolean): string {
  if (missing) return "nothing to compare";
  return same ? "the same" : "different things";
}

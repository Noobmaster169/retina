import type { ClassificationView } from "@/lib/api/trace-schemas";

function Reader({ title, category, confidence, rationale, extra }: {
  title: string;
  category: string;
  confidence: number;
  rationale: string;
  extra?: string | null;
}) {
  return (
    <div className="rounded-md border border-line p-3">
      <div className="text-xs uppercase tracking-wide text-muted">{title}</div>
      <div className="mt-1 font-medium">
        {category} <span className="text-sm font-normal tabular-nums text-muted">at {confidence.toFixed(2)}</span>
      </div>
      {rationale && <p className="mt-1 text-sm">{rationale}</p>}
      {extra && <p className="mt-2 text-xs text-muted">Case for the others: {extra}</p>}
    </div>
  );
}

const DECIDER: Record<ClassificationView["decidedBy"], string> = {
  llm: "the generator alone (it was sure enough)",
  verifier: "the verifier (the generator was unsure)",
  human: "a person",
};

/** The verdict on one email: the category that stood, who settled it, and what each reader said. */
export function VerdictPanel({ classification }: { classification: ClassificationView }) {
  const { generator, verifier } = classification;
  return (
    <section className="rounded-lg border border-line bg-paper p-3">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <span className="text-xs uppercase tracking-wide text-muted">Verdict</span>
        <span className="text-lg font-semibold">{classification.finalCategory}</span>
        <span className="text-sm text-muted">decided by {DECIDER[classification.decidedBy]}</span>
      </div>
      <div className={`mt-3 grid gap-3 ${verifier ? "sm:grid-cols-2" : ""}`}>
        <Reader title="Generator" category={generator.category} confidence={generator.confidence} rationale={generator.rationale} />
        {verifier && (
          <Reader
            title={verifier.category === generator.category ? "Verifier, agreeing" : "Verifier, overruling"}
            category={verifier.category}
            confidence={verifier.confidence}
            rationale={verifier.rationale}
            extra={verifier.counterCases}
          />
        )}
      </div>
      {classification.verifierError && (
        <p className="mt-2 text-sm text-amber-700">
          The verifier failed ({classification.verifierError}), so the generator&apos;s category stood.
        </p>
      )}
    </section>
  );
}

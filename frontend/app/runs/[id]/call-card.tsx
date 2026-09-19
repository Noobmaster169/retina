import type { LlmCall } from "@/lib/api/trace-schemas";

const STEP_LABEL: Record<string, string> = { classify: "Generator", "classify-verify": "Verifier" };

function Block({ title, text, open = false }: { title: string; text: string; open?: boolean }) {
  return (
    <details open={open} className="mt-2 rounded-md border border-line">
      <summary className="cursor-pointer select-none px-3 py-1.5 text-xs font-medium uppercase tracking-wide text-muted">
        {title}
      </summary>
      <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words border-t border-line bg-paper px-3 py-2 font-mono text-xs leading-relaxed">
        {text}
      </pre>
    </details>
  );
}

/** One attempt at one model call: what went in, what came out, and what it cost. */
export function CallCard({ call }: { call: LlmCall }) {
  const tokens = call.inputTokens === null ? "" : `${call.inputTokens} in, ${call.outputTokens ?? 0} out`;
  return (
    <article className="rounded-lg border border-line p-3">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
        <span className="font-semibold">{STEP_LABEL[call.step] ?? call.step}</span>
        <span className="text-muted">
          {call.step} {call.promptVersion} on {call.model}
          {call.attempt > 1 ? `, attempt ${call.attempt}` : ""}
        </span>
        <span className={call.ok ? "text-accent-ink" : "text-red-700"}>{call.ok ? "ok" : "failed"}</span>
        <span className="ml-auto text-xs tabular-nums text-muted">
          {(call.latencyMs / 1000).toFixed(1)} s{tokens && ` · ${tokens}`}
          {call.costUsd !== null && ` · $${call.costUsd.toFixed(4)}`}
        </span>
      </header>
      {call.error && <p className="mt-2 text-sm text-red-700">{call.error}</p>}
      <Block title="Input: the email as the model saw it" text={call.user} open />
      <Block title="Output: the model's answer, as returned" text={call.responseText ?? "(no answer: the call failed)"} open />
      <Block title="System prompt" text={call.system} />
    </article>
  );
}

"use client";

import { useState } from "react";

import { type Choice, LabelledSelect } from "./labelled-select";
import { DEFAULT, useRunOptions } from "./use-run-options";

interface Props {
  onCreated: () => void;
}

type Scope = "dev" | "holdout" | "all" | "first";

const SCOPES: Choice[] = [
  { value: "dev", label: "Dev sample (30 train emails)" },
  { value: "holdout", label: "Holdout (104 emails)" },
  { value: "all", label: "Whole inbox (520 emails)" },
  { value: "first", label: "First N emails" },
];

const COUNTS: Choice[] = [5, 10, 20, 30, 50, 100].map((n) => ({ value: String(n), label: `${n} emails` }));

const PACES: Choice[] = [
  { value: "0", label: "All at once", hint: "Every email is queued immediately; the backend's concurrency sets the pace" },
  { value: "0.5", label: "One every 2 s" },
  { value: "1", label: "One per second" },
  { value: "2", label: "Two per second" },
  { value: "5", label: "Five per second" },
];

export function NewRunForm({ onCreated }: Props) {
  const options = useRunOptions();
  const [scope, setScope] = useState<Scope>("dev");
  const [count, setCount] = useState("20");
  const [pace, setPace] = useState("0");
  const [classifyPrompt, setClassifyPrompt] = useState(DEFAULT);
  const [verifyPrompt, setVerifyPrompt] = useState(DEFAULT);
  const [model, setModel] = useState(DEFAULT);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function body(): Record<string, unknown> {
    const out: Record<string, unknown> = { ratePerSecond: Number(pace) };
    if (scope === "dev" || scope === "holdout") out.subset = scope;
    if (scope === "first") out.limit = Number(count);
    const promptSet = {
      ...(classifyPrompt ? { classify: classifyPrompt } : {}),
      ...(verifyPrompt ? { "classify-verify": verifyPrompt } : {}),
    };
    if (Object.keys(promptSet).length) out.promptSet = promptSet;
    if (model) out.models = { classify: model, "classify-verify": model };
    return out;
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (scope === "all" && !window.confirm("Run all 520 emails? That is about 520 to 600 model calls.")) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body()),
      });
      if (!response.ok) {
        const refused: unknown = await response.json().catch(() => null);
        const message = typeof refused === "object" && refused !== null && "error" in refused ? String(refused.error) : null;
        setError(message ?? `Request failed with ${response.status}`);
        return;
      }
      onCreated();
    } catch (cause) {
      console.error("[runs] create failed:", cause);
      setError("Could not reach the server.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 flex flex-wrap items-end gap-4 border-y border-line py-4">
      <LabelledSelect name="scope" label="Emails" choices={SCOPES} value={scope} onChange={(v) => setScope(v as Scope)} />
      {scope === "first" && <LabelledSelect name="count" label="How many" choices={COUNTS} value={count} onChange={setCount} />}
      <LabelledSelect name="pace" label="Pace" choices={PACES} value={pace} onChange={setPace} />
      <LabelledSelect name="classify" label="Classify prompt" choices={options.prompts("classify")} value={classifyPrompt} onChange={setClassifyPrompt} />
      <LabelledSelect name="verify" label="Verifier prompt" choices={options.prompts("classify-verify")} value={verifyPrompt} onChange={setVerifyPrompt} />
      <LabelledSelect name="model" label="Model" choices={options.models} value={model} onChange={setModel} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-accent-ink/25 bg-accent px-3.5 py-2 text-sm font-medium text-white hover:bg-accent-ink disabled:opacity-60"
      >
        {pending ? "Starting…" : "New run"}
      </button>
      <p className="basis-full text-xs text-muted">
        All at once queues every email immediately, and the backend works through them as many at a time as its
        concurrency allows. Prompt and model are for experiments: the defaults are the active prompts on sonnet.
      </p>
      {(error ?? options.error) && (
        <p role="alert" className="basis-full text-sm text-red-700">
          {error ?? `Could not load the prompt and model choices: ${options.error}`}
        </p>
      )}
    </form>
  );
}

"use client";

import { useState, useTransition } from "react";

import { sendChat } from "@/app/actions/ai";
import type { ChatResult, ModelInfo } from "@/lib/api-client";

export function ChatPanel({ models }: { models: ModelInfo[] }) {
  const [model, setModel] = useState(models[0]?.id ?? "");
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState<ChatResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const selected = models.find((m) => m.id === model);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!prompt.trim() || !model) return;
    setError(null);
    startTransition(async () => {
      const outcome = await sendChat({ model, messages: [{ role: "user", content: prompt }] });
      if (outcome.ok) {
        setResult(outcome.result);
      } else {
        setResult(null);
        setError(outcome.message);
      }
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted">Model</span>
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className="rounded-lg border border-line bg-surface px-3 py-2"
        >
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.id} — {m.provider}/{m.model}
            </option>
          ))}
        </select>
        {selected?.provider === "claudecli" && (
          <span className="text-xs text-muted">
            Runs through the Claude Code subscription; the first call can take several seconds.
          </span>
        )}
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted">Prompt</span>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={5}
          className="rounded-lg border border-line bg-surface px-3 py-2 outline-none focus:border-brand"
        />
      </label>

      <button
        type="submit"
        disabled={pending || !prompt.trim()}
        className="self-start rounded-lg border border-brand-ink/25 bg-brand px-3.5 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? "Thinking…" : "Send"}
      </button>

      {error && <p className="text-sm text-red-700">{error}</p>}

      {result && (
        <section className="rounded-xl border border-line bg-surface p-4">
          <pre className="whitespace-pre-wrap font-sans text-sm">{result.text}</pre>
          <p className="mt-3 text-xs text-muted">
            {result.model ?? model} · {result.usage.inputTokens} in / {result.usage.outputTokens} out
            {result.costUsd !== null && ` · $${result.costUsd.toFixed(4)}`}
            {result.stopReason && ` · ${result.stopReason}`}
          </p>
        </section>
      )}
    </form>
  );
}

"use client";

import { useState } from "react";

interface Props {
  onCreated: () => void;
}

const FIELD = "w-28 rounded-md border border-line bg-paper px-3 py-2 text-sm tabular-nums focus:border-accent focus:bg-surface";

export function NewRunForm({ onCreated }: Props) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const limit = String(form.get("limit") ?? "").trim();
    const body = { ratePerSecond: Number(form.get("rate")), ...(limit ? { limit: Number(limit) } : {}) };

    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const refused = (await response.json().catch(() => ({}))) as { error?: string };
        setError(refused.error ?? `Request failed with ${response.status}`);
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
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted">Emails per second</span>
        <input name="rate" type="number" min={0} max={50} step={0.5} defaultValue={5} required className={FIELD} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted">Limit</span>
        <input name="limit" type="number" min={1} step={1} placeholder="all" className={FIELD} />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-accent-ink/25 bg-accent px-3.5 py-2 text-sm font-medium text-white hover:bg-accent-ink disabled:opacity-60"
      >
        {pending ? "Starting…" : "New run"}
      </button>
      <p className="basis-full text-xs text-muted">0 per second is a burst: every email is queued at once.</p>
      {error && (
        <p role="alert" className="basis-full text-sm text-red-700">
          {error}
        </p>
      )}
    </form>
  );
}

"use client";

import { useState } from "react";

interface Props {
  onCreated: () => void;
}

type Scope = "dev" | "holdout" | "all" | "first";

const SCOPES: { value: Scope; label: string }[] = [
  { value: "dev", label: "Dev sample (30 train emails)" },
  { value: "holdout", label: "Holdout (104 emails)" },
  { value: "all", label: "Whole inbox (520 emails)" },
  { value: "first", label: "First N emails" },
];

const FIELD = "rounded-md border border-line bg-paper px-3 py-2 text-sm focus:border-accent focus:bg-surface";

/** The request body, from the form. Blank optional fields are left out so the backend's defaults apply. */
function bodyOf(form: FormData): Record<string, unknown> {
  const text = (name: string) => String(form.get(name) ?? "").trim();
  const scope = text("scope") as Scope;
  const body: Record<string, unknown> = { ratePerSecond: Number(form.get("rate")) };
  if (scope === "dev" || scope === "holdout") body.subset = scope;
  if (scope === "first" && text("limit")) body.limit = Number(text("limit"));

  const version = text("version");
  if (version) body.promptSet = { classify: version };
  const model = text("model");
  if (model) body.models = { classify: model, "classify-verify": model };
  return body;
}

export function NewRunForm({ onCreated }: Props) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<Scope>("dev");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = bodyOf(new FormData(event.currentTarget));
    if (scope === "all" && !window.confirm("Run all 520 emails? That is about 520 to 600 model calls.")) return;

    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
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
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted">Emails</span>
        <select name="scope" value={scope} onChange={(e) => setScope(e.target.value as Scope)} className={FIELD}>
          {SCOPES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      {scope === "first" && (
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">N</span>
          <input name="limit" type="number" min={1} step={1} defaultValue={20} required className={`w-24 tabular-nums ${FIELD}`} />
        </label>
      )}
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted">Emails per second</span>
        <input name="rate" type="number" min={0} max={50} step={0.5} defaultValue={0} required className={`w-28 tabular-nums ${FIELD}`} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted">Classify prompt</span>
        <input name="version" pattern="v\d+" placeholder="active" className={`w-24 ${FIELD}`} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted">Model</span>
        <input name="model" placeholder="sonnet" className={`w-32 ${FIELD}`} />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-accent-ink/25 bg-accent px-3.5 py-2 text-sm font-medium text-white hover:bg-accent-ink disabled:opacity-60"
      >
        {pending ? "Starting…" : "New run"}
      </button>
      <p className="basis-full text-xs text-muted">
        0 per second is a burst: every email is queued at once, and the backend works through them as many at a time as its
        concurrency allows. Prompt and model are for experiments; blank means the active prompt on sonnet.
      </p>
      {error && (
        <p role="alert" className="basis-full text-sm text-red-700">
          {error}
        </p>
      )}
    </form>
  );
}

"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import type { PromptStep } from "@/lib/api/runs-schemas";
import { panel } from "@/lib/motion";

import { type Choice, Field } from "./labelled-select";
import { DEFAULT, useRunOptions } from "./use-run-options";

/**
 * Starting a run is two decisions: which emails, and how fast. The eight
 * prompt and model dropdowns are an experiment and they sit behind a
 * disclosure, because putting them on the page by default is the exposure
 * `05-design.md` section 2.1 principle 8 warns about: every one of them is
 * true, and none of them is what someone starting a run is deciding.
 */

type Scope = "dev" | "holdout" | "all" | "first";

const SCOPES: Choice[] = [
  { value: "dev", label: "Dev sample, 30 emails" },
  { value: "holdout", label: "Holdout, 104 emails" },
  { value: "all", label: "The whole inbox, 520" },
  { value: "first", label: "The first N" },
];

const COUNTS: Choice[] = [5, 10, 20, 30, 50, 100].map((n) => ({ value: String(n), label: `${n} emails` }));

const PACES: Choice[] = [
  { value: "0", label: "All at once", hint: "Every email is queued immediately; the queues' own concurrency sets the pace" },
  { value: "0.5", label: "One every 2 seconds" },
  { value: "1", label: "One a second" },
  { value: "2", label: "Two a second" },
  { value: "5", label: "Five a second" },
];

/** One dropdown per model step, in the order the pipeline runs them. */
const STEPS: { step: PromptStep; label: string }[] = [
  { step: "classify", label: "Classify" },
  { step: "classify-verify", label: "Verifier" },
  { step: "triage", label: "Triage" },
  { step: "doc-type", label: "Document type" },
  { step: "extract", label: "Extractor" },
  { step: "extract-verify", label: "Extraction verifier" },
  { step: "field-judge", label: "Field judge" },
];

export function NewRunForm({ onCreated }: { onCreated: () => void }) {
  const options = useRunOptions();
  const [scope, setScope] = useState<Scope>("dev");
  const [count, setCount] = useState("20");
  const [pace, setPace] = useState("0");
  const [prompts, setPrompts] = useState<Partial<Record<PromptStep, string>>>({});
  const [model, setModel] = useState(DEFAULT);
  const [pinning, setPinning] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pinned = STEPS.filter(({ step }) => prompts[step] && prompts[step] !== options.active(step)).length;

  function body(): Record<string, unknown> {
    const out: Record<string, unknown> = { ratePerSecond: Number(pace) };
    if (scope === "dev" || scope === "holdout") out.subset = scope;
    if (scope === "first") out.limit = Number(count);
    // Only a version other than the active one is pinned; the active one is what a run gets anyway.
    const promptSet = Object.fromEntries(
      STEPS.map(({ step }) => [step, prompts[step]]).filter(([step, version]) => version && version !== options.active(step as PromptStep)),
    );
    if (Object.keys(promptSet).length) out.promptSet = promptSet;
    if (model) out.models = Object.fromEntries(STEPS.map(({ step }) => [step, model]));
    return out;
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (scope === "all" && !window.confirm("Run all 520 emails? That is about 800 to 900 model calls.")) return;
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
    <form onSubmit={submit} className="border-y border-hairline py-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field name="scope" label="Emails" choices={SCOPES} value={scope} onChange={(v) => setScope(v as Scope)} />
        {scope === "first" ? <Field name="count" label="How many" choices={COUNTS} value={count} onChange={setCount} /> : null}
        <Field name="pace" label="Pace" choices={PACES} value={pace} onChange={setPace} />
        <Button type="submit" variant="primary" disabled={pending} className="h-9">
          {pending ? "Starting" : "New run"}
        </Button>
        <span className="grow" />
        <button
          type="button"
          onClick={() => setPinning((open) => !open)}
          aria-expanded={pinning}
          className="flex h-9 items-center gap-1.5 rounded-md px-2 text-small text-ink-tertiary transition-colors duration-150 hover:text-ink"
        >
          <motion.span animate={{ rotate: pinning ? 90 : 0 }} transition={panel} className="flex">
            <Icon name="chevron" size={12} />
          </motion.span>
          Pin a prompt or a model
          {pinned > 0 ? <span className="font-mono text-mono-xs text-ink">{pinned}</span> : null}
        </button>
      </div>

      <AnimatePresence initial={false}>
        {pinning ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={panel}
            className="overflow-hidden"
          >
            <div className="flex flex-wrap items-end gap-3 pt-4">
              {STEPS.map(({ step, label }) => (
                <Field
                  key={step}
                  name={step}
                  label={label}
                  choices={options.prompts(step)}
                  value={prompts[step] || options.active(step)}
                  onChange={(version) => setPrompts((current) => ({ ...current, [step]: version }))}
                />
              ))}
              <Field name="model" label="Model" choices={options.models} value={model} onChange={setModel} />
            </div>
            <p className="max-w-[68ch] pt-3 text-small leading-[18px] text-ink-tertiary">
              A run pins what it was given and the worker loads exactly that, so a prompt added mid run cannot change
              it. Left alone, every step runs its active prompt on sonnet.
            </p>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {error ?? options.error ? (
        <p role="alert" className="mt-3 border-l-2 border-fault pl-3 text-small text-fault">
          {error ?? `Could not load the prompt and model choices: ${options.error}`}
        </p>
      ) : null}
    </form>
  );
}

"use client";

import { useState } from "react";
import useSWR from "swr";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";

import { Button } from "@/components/ui/button";
import { HealthReport } from "@/lib/api/queues-schemas";
import { parsedFetcher } from "@/lib/poll";
import { Icon } from "@/components/ui/icons";
import { z } from "zod";

import type { PromptStep } from "@/lib/api/runs-schemas";
import { panel } from "@/lib/motion";

import { countsFor, grouped, ORGANISERS, priceOf, scopesFor } from "./inbox-scope";
import { PACES, STEPS } from "./new-run-choices";
import { Field } from "./labelled-select";
import { DEFAULT, useRunOptions } from "./use-run-options";

/**
 * Starting a run is two decisions: which emails, and how fast. The eight
 * prompt and model dropdowns are an experiment and they sit behind a
 * disclosure, because putting them on the page by default is the exposure
 * `05-design.md` section 2.1 principle 8 warns about: every one of them is
 * true, and none of them is what someone starting a run is deciding.
 */

/**
 * Past this many, a run is worth confirming. Under it the wait and the cost
 * are both small enough that a dialogue is the more annoying of the two.
 */
const WARN_ABOVE = 200;

/** The only part of the new run's summary this form reads: where to send you. */
const Created = z.object({ id: z.string() });

type Scope = "dev" | "holdout" | "all" | "first";

/**
 * `onCreated` still refreshes the list behind the redirect, so coming back to
 * this page shows the new run rather than a list from before it existed.
 */
export function NewRunForm({ onCreated }: { onCreated: () => void }) {
  const router = useRouter();
  const options = useRunOptions();
  // How many emails the inbox actually serves. Read once, never polled: it
  // changes when somebody remounts the email server with another dataset, not
  // while a form is open. Null until it answers, and then the form says "the
  // whole inbox" without a number rather than a number that may be wrong.
  const { data: health } = useSWR("/api/health", parsedFetcher(HealthReport), {
    revalidateOnFocus: false,
    keepPreviousData: true,
  });
  const inbox = health?.checks.inbox.emails ?? null;
  const scopes = scopesFor(inbox);
  const counts = countsFor(inbox);
  const [scope, setScope] = useState<Scope>("first");
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
    // What a big run costs, said before it starts and in the numbers of the
    // inbox in front of them. It used to name 520 whatever was being served.
    const asked = scope === "all" ? (inbox ?? ORGANISERS) : scope === "first" ? Number(count) : 0;
    if (asked >= WARN_ABOVE && !window.confirm(`Run ${grouped(asked)} emails? That is ${priceOf(asked)}.`)) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body()),
      });
      const answer: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message = typeof answer === "object" && answer !== null && "error" in answer ? String(answer.error) : null;
        setError(message ?? `Request failed with ${response.status}`);
        setPending(false);
        return;
      }
      onCreated();
      // Starting a run is asking to watch it, so this goes straight to the
      // overview rather than leaving someone on a list to find the row that
      // just appeared. `pending` stays set: the button should not look ready
      // again while the route is still resolving.
      const created = Created.safeParse(answer);
      if (created.success) {
        router.push(`/runs/${created.data.id}`);
        return;
      }
      setPending(false);
    } catch (cause) {
      console.error("[runs] create failed:", cause);
      setError("Could not reach the server.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="border-y border-hairline py-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field name="scope" label="Emails" choices={scopes} value={scope} onChange={(v) => setScope(v as Scope)} />
        {scope === "first" ? <Field name="count" label="How many" choices={counts} value={count} onChange={setCount} /> : null}
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

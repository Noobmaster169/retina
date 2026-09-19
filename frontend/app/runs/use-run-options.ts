"use client";

import useSWR from "swr";
import { z } from "zod";

import { PromptCatalog } from "@/lib/api/runs-schemas";
import { parsedFetcher } from "@/lib/poll";

import type { Choice } from "./labelled-select";

const ModelList = z.object({ models: z.array(z.object({ id: z.string(), provider: z.string() })) });

const fetchPrompts = parsedFetcher(PromptCatalog);
const fetchModels = parsedFetcher(ModelList);

/** "" means: pin nothing, and let the backend use the active version or the prompt's own model. */
export const DEFAULT = "";

export interface RunOptions {
  prompts(step: string): Choice[];
  models: Choice[];
  error: string | null;
}

/**
 * What a new run can be told to use, read from the backend: the prompt versions
 * on disk per step, and the proxy's model aliases. The form offers these and
 * nothing else, so every choice it makes is one POST /runs accepts.
 */
export function useRunOptions(): RunOptions {
  const prompts = useSWR("/api/prompts", fetchPrompts, { revalidateOnFocus: false });
  const models = useSWR("/api/models", fetchModels, { revalidateOnFocus: false });

  function promptChoices(step: string): Choice[] {
    const versions = prompts.data?.steps.find((s) => s.step === step)?.versions ?? [];
    const active = versions.find((v) => v.active);
    return [
      { value: DEFAULT, label: active ? `Active (${active.version})` : "Active" },
      ...versions.map((v) => ({
        value: v.version,
        label: `${v.version}${v.active ? " (active)" : ""}`,
        hint: v.notes ?? undefined,
      })),
    ];
  }

  // The mock echoes its prompt back; it cannot answer a schema, so a run on it only fails.
  const aliases = (models.data?.models ?? []).filter((m) => m.provider !== "mock");
  const failure = prompts.error ?? models.error;
  return {
    prompts: promptChoices,
    models: [{ value: DEFAULT, label: "Each prompt's own (sonnet)" }, ...aliases.map((m) => ({ value: m.id, label: m.id }))],
    error: failure instanceof Error ? failure.message : null,
  };
}

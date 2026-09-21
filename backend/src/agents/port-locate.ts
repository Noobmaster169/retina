import { z } from "zod";

import { WORKER_PROJECT } from "./classify";
import type { Prompt } from "./prompts/registry";
import { callStructured, type StructuredDeps, type StructuredResult } from "./structured";

/**
 * Where one port is, for the map.
 *
 * The one step that may search the web, on the `sonnet-web` alias, and the
 * only thing it is ever given is a port's name, country and locode from its
 * own attributes: nothing read from an email reaches a session with a tool in
 * it. It runs once per port whose coordinates are null and belongs to no run.
 */

export const PortLocateOutput = z.object({
  lat: z.number().min(-90).max(90).nullable(),
  lon: z.number().min(-180).max(180).nullable(),
  confidence: z.number().min(0).max(1),
  /** `search` when a page gave the position, `model` when its own knowledge did. */
  basis: z.enum(["search", "model"]),
  url: z.string().max(400).nullable(),
});
export type PortLocateOutput = z.infer<typeof PortLocateOutput>;

export interface PortLocateInput {
  canonical: string;
  country: string | null;
  locode: string | null;
}

export async function locatePort(
  deps: StructuredDeps,
  prompt: Prompt,
  input: PortLocateInput,
): Promise<StructuredResult<PortLocateOutput>> {
  return callStructured(deps, {
    prompt,
    input: {
      "the port": input.canonical,
      "its country, where known": input.country ?? "(not known)",
      "its UN/LOCODE, where known": input.locode ?? "(not known)",
    },
    schema: PortLocateOutput,
    project: WORKER_PROJECT,
    runId: null,
  });
}

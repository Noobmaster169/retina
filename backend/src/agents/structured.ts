import { z } from "zod";

import type { Queryable } from "../db";
import { TerminalError } from "../lib/errors";
import { childLogger } from "../lib/logger";
import { llmCalls } from "../ontology/repositories";
import type { LiveCalls } from "../live";
import { livePreview } from "./live-preview";
import type { LlmClient, LlmRequest } from "./llm-client";
import type { Prompt } from "./prompts/registry";

export interface StructuredDeps {
  llm: LlmClient;
  pool: Queryable;
  /** Where a call's answer so far is kept while it streams. Absent, calls do not stream. */
  live?: LiveCalls;
}

export interface StructuredCall<T> {
  prompt: Prompt;
  /** Rendered as labelled sections, in this order. */
  input: Record<string, string | string[]>;
  schema: z.ZodType<T>;
  project: string;
  /** Null for a call that belongs to no run: the chat agent's loop is the only one. */
  runId: string | null;
  emailRunId?: string;
}

export interface StructuredResult<T> {
  value: T;
  model: string;
  promptVersion: string;
}

const MAX_ATTEMPTS = 2;

const log = childLogger({ module: "structured" });

function renderInput(input: StructuredCall<unknown>["input"]): string {
  return Object.entries(input)
    .map(([label, value]) => {
      const text = Array.isArray(value) ? (value.length ? value.map((item) => `- ${item}`).join("\n") : "(none)") : value;
      return `## ${label}\n${text}`;
    })
    .join("\n\n");
}

/** The first balanced `{ ... }` in `text`, skipping braces that sit inside strings. */
function firstObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (inString) {
      if (char === "\\") i += 1;
      else if (char === '"') inString = false;
    } else if (char === '"') inString = true;
    else if (char === "{") depth += 1;
    else if (char === "}" && --depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

/** Models reason first and answer last, and often fence the answer. A fenced json block wins; else the last object. */
export function extractJson(text: string): unknown {
  const fenced = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].map((match) => match[1]);
  const candidates = fenced.length > 0 ? fenced.reverse() : [text.slice(Math.max(0, text.lastIndexOf("\n{")))];
  for (const candidate of [...candidates, text]) {
    const object = firstObject(candidate);
    const value = object ? parseOrUndefined(object) : undefined;
    if (value !== undefined) return value;
  }
  // A total miss: the schema check on `undefined` fails and the caller asks the model again.
  return undefined;
}

/** Braces that balance are not always JSON. Only that case is absorbed; anything else is a bug and is thrown. */
function parseOrUndefined(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    if (error instanceof SyntaxError) return undefined;
    throw error;
  }
}

/**
 * The schema as the provider takes it: plain JSON Schema, without the
 * `$schema` dialect marker some reject.
 *
 * A top-level union is refused here rather than by the provider. The Anthropic
 * wire answers `input_schema does not support oneOf, allOf, or anyOf at the
 * top level`, which arrives as a 502 from the proxy marked retryable, so the
 * caller retries a call that can never succeed and the reason is three layers
 * away from the schema that caused it. Failing at the seam turns that into one
 * sentence naming the fix.
 *
 * The fix is always the same: one flat object with the discriminant as a
 * field, narrowed in code after it parses.
 */
export function toOutputSchema(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _dialect, ...rest } = z.toJSONSchema(schema);
  for (const combinator of ["oneOf", "anyOf", "allOf"]) {
    if (combinator in rest) {
      throw new TerminalError(
        `a structured output schema cannot be a union: the provider refuses \`${combinator}\` at the top level of a tool schema. ` +
          "Use one object with the discriminant as a field and narrow it after it parses.",
      );
    }
  }
  return rest;
}

function describe(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("; ");
}

/**
 * One model call whose answer must match `schema`. The schema goes to the
 * provider as its structured-output constraint, so the answer is that JSON
 * object by construction and not by request; the prompt shows the same schema
 * so the model knows what each field means. Zod still checks the result: it
 * holds constraints a JSON Schema constraint cannot, and a provider may ignore
 * the constraint. An answer that does not parse gets one more call that shows
 * the model its mistake. Every attempt is a row in the ledger, ok or not.
 */
export async function callStructured<T>(deps: StructuredDeps, call: StructuredCall<T>): Promise<StructuredResult<T>> {
  const { prompt } = call;
  const outputSchema = toOutputSchema(call.schema);
  const system = prompt.text.replace("{{schema}}", JSON.stringify(outputSchema, null, 2));
  let user = renderInput(call.input);
  let problem = "no attempt made";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const request: LlmRequest = {
      model: prompt.model,
      system,
      user,
      maxTokens: prompt.maxTokens,
      outputSchema,
      project: call.project,
    };
    const row = {
      runId: call.runId,
      emailRunId: call.emailRunId ?? null,
      step: prompt.step,
      model: prompt.model,
      promptVersion: prompt.version,
      request,
      attempt,
    };

    // Streamed only where someone can watch it: an email's call of a run, with
    // a live store. A call that belongs to no run has no run page to stream to.
    const preview =
      deps.live && call.emailRunId && call.runId
        ? livePreview(deps.live, {
            emailRunId: call.emailRunId,
            runId: call.runId,
            step: prompt.step,
            model: prompt.model,
            promptVersion: prompt.version,
            attempt,
          })
        : null;
    if (preview) request.onText = (soFar) => preview.onText(soFar);

    let response;
    const started = Date.now();
    try {
      response = await deps.llm.complete(request);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.warn(
        { runId: call.runId, emailRunId: call.emailRunId, stage: prompt.step, model: prompt.model, promptVersion: prompt.version, attempt, err: message },
        "model call failed",
      );
      await llmCalls.insert(deps.pool, { ...row, ok: false, error: message, latencyMs: Date.now() - started });
      throw error;
    } finally {
      await preview?.end();
    }

    const parsed = call.schema.safeParse(extractJson(response.text));
    const where = { runId: call.runId, emailRunId: call.emailRunId, stage: prompt.step, model: prompt.model, promptVersion: prompt.version, attempt };
    log.info(
      { ...where, ok: parsed.success, latencyMs: response.latencyMs, tokens: response.usage, costUsd: response.costUsd },
      "model call",
    );
    // The whole exchange, for a worker started with LOG_LEVEL=debug. The ledger keeps it either way.
    log.debug({ ...where, system, user, response: response.text }, "model call input and output");
    await llmCalls.insert(deps.pool, {
      ...row,
      response: { text: response.text, model: response.model, stopReason: response.stopReason },
      parsed: parsed.success ? parsed.data : null,
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
      costUsd: response.costUsd,
      latencyMs: response.latencyMs,
      ok: parsed.success,
      error: parsed.success ? null : describe(parsed.error),
    });
    if (parsed.success) return { value: parsed.data, model: response.model ?? prompt.model, promptVersion: prompt.version };

    problem = describe(parsed.error);
    // Asking again under the same cap would be cut off at the same place.
    if (response.stopReason === "max_tokens") {
      throw new TerminalError(`step ${prompt.step} ran out of tokens before finishing its answer: raise max_tokens`);
    }
    user = `${renderInput(call.input)}\n\n## your previous answer\n${response.text}\n\n## what was wrong with it\n${problem}\n\nReturn only the corrected JSON object.`;
  }

  throw new TerminalError(`structured output invalid for step ${prompt.step}: ${problem}`);
}

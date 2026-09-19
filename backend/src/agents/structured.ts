import { z } from "zod";

import type { Queryable } from "../db";
import { TerminalError } from "../lib/errors";
import { llmCalls } from "../ontology/repositories";
import type { LlmClient, LlmRequest } from "./llm-client";
import type { Prompt } from "./prompts/registry";

export interface StructuredDeps {
  llm: LlmClient;
  pool: Queryable;
}

export interface StructuredCall<T> {
  prompt: Prompt;
  /** Rendered as labelled sections, in this order. */
  input: Record<string, string | string[]>;
  schema: z.ZodType<T>;
  project: string;
  runId: string;
  emailRunId?: string;
}

export interface StructuredResult<T> {
  value: T;
  model: string;
  promptVersion: string;
}

const MAX_ATTEMPTS = 2;

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

function describe(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("; ");
}

/**
 * One model call whose answer must match `schema`. An answer that does not
 * parse gets one more call that shows the model its mistake. Every attempt is
 * a row in the ledger, ok or not.
 */
export async function callStructured<T>(deps: StructuredDeps, call: StructuredCall<T>): Promise<StructuredResult<T>> {
  const { prompt } = call;
  const system = prompt.text.replace("{{schema}}", JSON.stringify(z.toJSONSchema(call.schema), null, 2));
  let user = renderInput(call.input);
  let problem = "no attempt made";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const request: LlmRequest = { model: prompt.model, system, user, maxTokens: prompt.maxTokens, project: call.project };
    const row = {
      runId: call.runId,
      emailRunId: call.emailRunId ?? null,
      step: prompt.step,
      model: prompt.model,
      promptVersion: prompt.version,
      request,
      attempt,
    };

    let response;
    const started = Date.now();
    try {
      response = await deps.llm.complete(request);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await llmCalls.insert(deps.pool, { ...row, ok: false, error: message, latencyMs: Date.now() - started });
      throw error;
    }

    const parsed = call.schema.safeParse(extractJson(response.text));
    await llmCalls.insert(deps.pool, {
      ...row,
      response: { text: response.text, model: response.model },
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
    user = `${renderInput(call.input)}\n\n## your previous answer\n${response.text}\n\n## what was wrong with it\n${problem}\n\nReturn only the corrected JSON object.`;
  }

  throw new TerminalError(`structured output invalid for step ${prompt.step}: ${problem}`);
}

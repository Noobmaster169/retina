import { z } from "zod";

/**
 * A tool's arguments as one line the model can copy: `{ text: string, kind?: "port" | "party" }`.
 *
 * Without it the model guesses the names, and a live run showed it guessing
 * `name` for `text` three times running. Derived from the tool's own zod
 * schema, so it cannot drift from what the tool accepts. Pure.
 */

interface JsonSchema {
  type?: string | string[];
  enum?: unknown[];
  items?: JsonSchema;
  anyOf?: JsonSchema[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: unknown;
}

function typeOf(schema: JsonSchema): string {
  if (schema.enum) return schema.enum.map((value) => JSON.stringify(value)).join(" | ");
  if (schema.anyOf) return [...new Set(schema.anyOf.map(typeOf))].join(" | ");
  if (schema.type === "array") return `${schema.items ? typeOf(schema.items) : "unknown"}[]`;
  if (schema.type === "integer") return "number";
  if (schema.type === "object") return schema.properties ? shapeOf(schema) : "{ name: value, ... }";
  return Array.isArray(schema.type) ? schema.type.join(" | ") : (schema.type ?? "unknown");
}

function shapeOf(schema: JsonSchema): string {
  const required = new Set(schema.required ?? []);
  const fields = Object.entries(schema.properties ?? {}).map(([name, field]) => `${name}${required.has(name) ? "" : "?"}: ${typeOf(field)}`);
  return fields.length === 0 ? "{}" : `{ ${fields.join(", ")} }`;
}

export function argsSignature(schema: z.ZodType): string {
  // `input`, because a field with a default is one the caller may leave out.
  return shapeOf(z.toJSONSchema(schema, { io: "input" }) as JsonSchema);
}

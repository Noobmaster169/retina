import { z } from "zod";

/**
 * What one model call decided, in words, read out of the structured answer it
 * returned. Pure: an object in, a sentence and some facts out.
 *
 * Every step answers a different shape, so each is narrowed here with a schema
 * of its own and nothing is read off an unchecked `unknown`. A shape that does
 * not narrow is not a failure: the call still carries what the model wrote,
 * one disclosure below, and a reading that guessed would be worse than none.
 *
 * The counts are counted, never taken from a field the model could have got
 * wrong: "six the same" is six rows that said so.
 */

export interface Fact {
  label: string;
  value: string;
}

export interface CallReading {
  /** What the call decided, in one sentence. Null where the answer did not narrow. */
  line: string | null;
  facts: Fact[];
  /** The model's own reasoning, where the step records one. */
  quote: string | null;
}

const NOTHING: CallReading = { line: null, facts: [], quote: null };

const Sure = z.object({ rationale: z.string(), confidence: z.number() });

const Classify = Sure.extend({ category: z.string() });
const Verify = Classify.extend({ agrees: z.boolean() });
const Triage = Sure.extend({ request: z.string() });
const DocType = Sure.extend({ doc_type: z.string() });

const Extracted = z.record(z.string(), z.object({ value: z.string().nullable() }).loose());
const Judged = z.record(z.string(), z.object({ same: z.boolean(), missing: z.boolean() }).loose());

const Quoted = z.object({ value: z.string().nullable() }).loose().nullable();
const ShipmentRead = z
  .object({
    parties: z.array(z.unknown()).optional(),
    people: z.array(z.unknown()).optional(),
    ports: z.object({ port_of_loading: Quoted, port_of_discharge: Quoted }).optional(),
    goods: Quoted.optional(),
    vessel: Quoted.optional(),
    carrier: Quoted.optional(),
  })
  .loose();

function sure(confidence: number): Fact {
  return { label: "sure", value: confidence.toFixed(2) };
}

/** "a, b and c", or nothing at all. */
function listed(parts: string[]): string {
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

function held(quoted: z.infer<typeof Quoted> | undefined): boolean {
  return quoted !== undefined && quoted !== null && quoted.value !== null;
}

function readClassify(parsed: unknown): CallReading {
  const it = Classify.safeParse(parsed);
  if (!it.success) return NOTHING;
  return { line: `Sorted it into ${it.data.category}.`, facts: [sure(it.data.confidence)], quote: it.data.rationale };
}

function readVerify(parsed: unknown): CallReading {
  const it = Verify.safeParse(parsed);
  if (!it.success) return NOTHING;
  const line = it.data.agrees
    ? `Argued the other categories and still came back to ${it.data.category}.`
    : `Argued the other categories and said ${it.data.category} instead.`;
  return { line, facts: [sure(it.data.confidence)], quote: it.data.rationale };
}

function readTriage(parsed: unknown): CallReading {
  const it = Triage.safeParse(parsed);
  if (!it.success) return NOTHING;
  return { line: `Read the request as ${it.data.request}.`, facts: [sure(it.data.confidence)], quote: it.data.rationale };
}

function readDocType(parsed: unknown): CallReading {
  const it = DocType.safeParse(parsed);
  if (!it.success) return NOTHING;
  return { line: `Named the file ${it.data.doc_type}.`, facts: [sure(it.data.confidence)], quote: it.data.rationale };
}

function readExtract(parsed: unknown): CallReading {
  const it = Extracted.safeParse(parsed);
  if (!it.success) return NOTHING;
  const fields = Object.entries(it.data);
  if (fields.length === 0) return NOTHING;
  const blank = fields.filter(([, field]) => field.value === null).map(([name]) => name);
  const found = fields.length - blank.length;
  return {
    line: `Read ${found} of ${plural(fields.length, "field")} out of the document.`,
    facts: blank.length > 0 ? [{ label: "nothing for", value: listed(blank) }] : [],
    quote: null,
  };
}

function readJudge(parsed: unknown): CallReading {
  const it = Judged.safeParse(parsed);
  if (!it.success) return NOTHING;
  const fields = Object.entries(it.data);
  if (fields.length === 0) return NOTHING;
  const missing = fields.filter(([, field]) => field.missing);
  const differ = fields.filter(([, field]) => !field.missing && !field.same);
  const same = fields.length - missing.length - differ.length;
  const parts = [
    same > 0 ? `${same} the same` : null,
    differ.length > 0 ? `${differ.length} different` : null,
    missing.length > 0 ? `${missing.length} with nothing to compare` : null,
  ].filter((part): part is string => part !== null);
  return {
    line: `Judged ${plural(fields.length, "field")}: ${listed(parts)}.`,
    facts: differ.length > 0 ? [{ label: "differ", value: listed(differ.map(([name]) => name)) }] : [],
    quote: null,
  };
}

function readShipment(parsed: unknown): CallReading {
  const it = ShipmentRead.safeParse(parsed);
  if (!it.success) return NOTHING;
  const { parties = [], people = [], ports, goods, vessel, carrier } = it.data;
  const lane = [held(ports?.port_of_loading), held(ports?.port_of_discharge)].filter(Boolean).length;
  const parts = [
    parties.length > 0 ? plural(parties.length, "company", "companies") : null,
    people.length > 0 ? plural(people.length, "person", "people") : null,
    lane > 0 ? plural(lane, "port") : null,
    held(goods) ? "what is being shipped" : null,
    held(vessel) ? "a vessel" : null,
    held(carrier) ? "a carrier" : null,
  ].filter((part): part is string => part !== null);
  if (parts.length === 0) return { line: "Found nothing in it to put in the model.", facts: [], quote: null };
  return { line: `Read ${listed(parts)} out of it.`, facts: [], quote: null };
}

/** A step this file does not know: its own reasoning if it recorded one, and nothing invented. */
function readUnknown(parsed: unknown): CallReading {
  const it = z.object({ rationale: z.string() }).loose().safeParse(parsed);
  if (!it.success) return NOTHING;
  return { line: null, facts: [], quote: it.data.rationale };
}

const READERS: Record<string, (parsed: unknown) => CallReading> = {
  classify: readClassify,
  "classify-verify": readVerify,
  triage: readTriage,
  "doc-type": readDocType,
  extract: readExtract,
  "extract-verify": readExtract,
  "field-judge": readJudge,
  "shipment-read": readShipment,
};

export function readCall(call: { step: string; parsed: unknown }): CallReading {
  return (READERS[call.step] ?? readUnknown)(call.parsed);
}

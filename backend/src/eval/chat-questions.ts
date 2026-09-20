import { z } from "zod";

import { ChatOutcome } from "../contracts";

/**
 * What one evaluation question declares: what to ask, and what the answer must
 * do. Split from chat-score.ts, which checks a turn against it.
 *
 * Every expectation is about behaviour a person could verify from the page: did
 * it look before it filtered, did it use the standard query, does the answer
 * name what it should, did it offer only alternatives it had read. Never the
 * model's prose against a reference sentence.
 */

export const Behaviour = z.enum([
  /** A lookup came before the first call that filters on a thing or a text value. */
  "grounds_first",
  /** At least one recipe ran. */
  "uses_recipe",
  /** The turn needed no SQL the agent wrote itself. */
  "no_own_sql",
  /** The literal guard never had to refuse a call. */
  "no_guard_refusal",
  /** The answer names the run it counted in, by the first eight characters of its id. */
  "names_the_run",
  /** Every alternative it offered survived the check against what its tools returned. */
  "every_alternative_real",
  /** It asked the person to choose between readings. */
  "asked",
  /** It did not ask: a broad question gets a stated reading and an answer. */
  "did_not_ask",
  /** It offered at least one next move, so the answer is not a dead end. */
  "offers_a_next_move",
  /** It said which part of the answer was its own knowledge rather than the data. */
  "marks_its_inference",
  /** It gave a term a meaning: a `find_entities` call ran and reported a reading. */
  "gives_a_meaning",
  /** It needed no meaning: a stored column or attribute answered the term, which is complete and free. */
  "no_meaning_needed",
  /** Where a set was only partly judged, the answer worded the total as a lower bound. */
  "says_lower_bound",
  /** Every reading's `complete` flag agrees with its own deferred count. */
  "completeness_is_truthful",
  /** It said which date column it filtered on. */
  "names_the_date_column",
]);
export type Behaviour = z.infer<typeof Behaviour>;

export const ChatQuestion = z.object({
  id: z.string().min(1),
  tags: z.array(z.string()).default([]),
  question: z.string().min(1),
  /** Ask it in a conversation opened about the latest run, as the run page's chat is. */
  scoped: z.boolean().default(true),
  expect: z
    .object({
      /** Each must appear in the answer. Case does not matter. */
      mentions: z.array(z.string()).default([]),
      /** At least one of each inner list must appear: for a fact that can be worded several ways. */
      mentionsAnyOf: z.array(z.array(z.string()).min(1)).default([]),
      /** None may appear. */
      absent: z.array(z.string()).default([]),
      behaviours: z.array(Behaviour).default([]),
      /** The outcome the turn should report. */
      outcome: ChatOutcome.optional(),
      /** Each must be the `thing` of an alternative it offered. */
      alternatives: z.array(z.string()).default([]),
      /** None may be the `thing` of any alternative: a plausible neighbour that is not in the data. */
      alternativesAbsent: z.array(z.string()).default([]),
      /** Model calls, the answer included. */
      maxSteps: z.number().int().positive().optional(),
      /**
       * The canonical names the entity set should hold, written by a person
       * from the inbox and its documents. Precision and recall are reported
       * against the things `find_entities` matched, never against the prose.
       */
      entities: z.array(z.string()).default([]),
      /** Whether the set should come back complete. Omitted where either is a fair answer. */
      complete: z.boolean().optional(),
    })
    .default({ mentions: [], mentionsAnyOf: [], absent: [], behaviours: [], alternatives: [], alternativesAbsent: [], entities: [] }),
});
export type ChatQuestion = z.infer<typeof ChatQuestion>;

export const ChatQuestionSet = z.array(ChatQuestion).min(1);

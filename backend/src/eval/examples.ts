import type { Category, TruthRow } from "../contracts";
import { TerminalError } from "../lib/errors";
import { pickPerCategory } from "./pick";
import type { Split } from "./split";

export interface ExampleEmail {
  from: string;
  subject: string;
  attachments: string[];
  body: string;
}

export interface Example {
  category: Category;
  /** The email as the classifier is shown one, in the same labelled sections. */
  email: string;
}

/**
 * Few-shot ids: a seeded few per category from the train split, never from
 * the dev sample (a dev run must not be graded on its own examples) and never
 * from the holdout. The holdout check is not redundant with drawing from
 * train: a hand-edited split could put an id in both, and one leaked example
 * makes every holdout number after it worthless.
 */
export function chooseExampleIds(
  truth: Record<string, TruthRow>,
  split: Split,
  devIds: string[],
  perCategory: number,
  seed: number,
): string[] {
  const ids = pickPerCategory(truth, split.train, perCategory, seed, devIds);
  const held = new Set(split.holdout);
  const leaked = ids.filter((id) => held.has(id));
  if (leaked.length > 0) throw new TerminalError(`holdout ids chosen as examples: ${leaked.join(", ")}`);
  return ids;
}

/** One example as the model reads it. The body is cut to keep ten examples from dwarfing the email itself. */
export function toExample(category: Category, email: ExampleEmail, maxBodyChars: number): Example {
  const body = email.body.length > maxBodyChars ? `${email.body.slice(0, maxBodyChars)}\n[cut]` : email.body;
  const attachments = email.attachments.length ? email.attachments.map((name) => `- ${name}`).join("\n") : "(none)";
  return {
    category,
    email: `## from\n${email.from}\n\n## subject\n${email.subject}\n\n## attachments\n${attachments}\n\n## body\n${body}`,
  };
}

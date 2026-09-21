import { describe, expect, it } from "vitest";

import type { EmailDraft } from "../../src/contracts";
import { draftIsReal } from "../../src/agents/chat/draft";

/**
 * The rule under test: a draft's address is real, or the draft is not shown.
 *
 * `grounds` is written as `get_email` actually writes it, one field per line,
 * because that is the shape the check runs against.
 */

const GET_EMAIL = ["email_id: email_097", "run_id: 0011eb39-2767-415a-bc2d-75617c4a0212", "from: sales@roxcel.at", "subject: Draft BL"].join("\n");

function draft(over: Partial<EmailDraft> = {}): EmailDraft {
  return { to: "sales@roxcel.at", subject: "Draft BL, two fields to confirm", body: "Please confirm.", ...over };
}

describe("draftIsReal", () => {
  const cases: { name: string; draft: EmailDraft; grounds: string[]; real: boolean }[] = [
    {
      name: "an address a get_email call actually returned is real",
      draft: draft(),
      grounds: [GET_EMAIL],
      real: true,
    },
    {
      name: "an address composed from the sender domain, never shown whole, is not",
      draft: draft({ to: "ops@roxcel.at" }),
      grounds: [GET_EMAIL],
      real: false,
    },
    {
      name: "an address that is a substring of a shown one is not the same address",
      draft: draft({ to: "ales@roxcel.at" }),
      grounds: [GET_EMAIL],
      real: false,
    },
    {
      name: "nothing was ever looked up",
      draft: draft(),
      grounds: [],
      real: false,
    },
    {
      name: "shown on a different call's result, which is still this turn's grounds",
      draft: draft(),
      grounds: ["a query returned nothing", GET_EMAIL],
      real: true,
    },
  ];

  for (const { name, draft: given, grounds, real } of cases) {
    it(name, () => {
      expect(draftIsReal(given, grounds)).toBe(real);
    });
  }
});

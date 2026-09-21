import { describe, expect, it } from "vitest";

import { resolveContext } from "../../../src/agents/chat/context";
import { scopeText } from "../../../src/agents/chat/loop.input";
import { NORTHWIND, seedInbox } from "../../chat-seed";
import { inRollback } from "../../db";

describe("resolveContext", () => {
  it("turns a party ref into its name and one line, and drops a ref nothing holds", async () => {
    await inRollback(async (tx) => {
      const inbox = await seedInbox(tx);
      const resolved = await resolveContext(tx, [
        { kind: "party", id: inbox.idOf(NORTHWIND) },
        { kind: "party", id: "999999999" },
        { kind: "email", id: inbox.emailIds[0] },
        { kind: "run", id: inbox.runId },
      ]);
      expect(resolved.map((item) => item.ref.kind)).toEqual(["party", "email", "run"]);
      expect(resolved[0].title).toBe(NORTHWIND);
      expect(resolved[0].line).toContain("consignee on 2 emails");
      expect(resolved[1].line).toContain("REQUEST BL DRAFT");
    });
  });
});

describe("scopeText with context", () => {
  it("says what the person is looking at, as a default and not a filter", () => {
    const text = scopeText({
      runId: null,
      emailId: null,
      context: [{ ref: { kind: "party", id: "1" }, title: "ACME", line: "ACME (a party): a mill. Shipper on 4 emails." }],
    });
    expect(text).toContain("The person is looking at: ACME.");
    expect(text).toContain("unless the question says otherwise");
    expect(text).toContain("Shipper on 4 emails");
  });

  it("says nothing about context when there is none", () => {
    expect(scopeText({ runId: null, emailId: null, context: [] })).not.toContain("looking at");
  });
});

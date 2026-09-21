import { describe, expect, it } from "vitest";

import { costOf } from "../../src/pipeline/gate";

/** The shape the Averis inbox actually hands over: a subject, a body, an SI and a BL. */
const ORDINARY = {
  subject: "REQUEST BL DRAFT _ PO 26067_ COATED IVORY BOARD__138MT",
  body: "Hi Mitchelle, please compare the SI and draft BL.",
  attachments: ["attachments/email_013_SI.txt", "attachments/email_013_BL.txt"],
};

describe("costOf", () => {
  const cases: { name: string; input: Parameters<typeof costOf>[0]; units: number }[] = [
    { name: "an email with nothing attached is the three calls it always costs", input: { subject: "Hi", body: "Hello", attachments: [] }, units: 3 },
    {
      name: "one document adds its three calls and earns no comparison",
      input: { subject: "Hi", body: "Hello", attachments: ["a_SI.txt"], attachmentBytes: [2000] },
      units: 6,
    },
    {
      name: "two documents add the comparison: 3 + 6 + 7",
      input: { ...ORDINARY, attachmentBytes: [4000, 5000] },
      units: 16,
    },
    {
      name: "a third document costs three more and the comparison is still charged once",
      input: { subject: "Hi", body: "Hello", attachments: ["a", "b", "c"], attachmentBytes: [10, 10, 10] },
      units: 19,
    },
  ];

  for (const { name, input, units } of cases) {
    it(name, () => expect(costOf(input).units).toBe(units));
  }

  it("breaks the number down so a row can say where it came from", () => {
    expect(costOf({ ...ORDINARY, attachmentBytes: [4000, 5000] }).breakdown).toEqual({
      email: 3,
      attachments: 6,
      comparison: 7,
      oversize: 0,
      bytes: 4000 + 5000 + Buffer.byteLength(ORDINARY.subject) + Buffer.byteLength(ORDINARY.body),
    });
  });

  it("charges nothing for size until an email is bigger than an ordinary one", () => {
    const justUnder = costOf({ subject: "", body: "", attachments: ["big"], attachmentBytes: [262_144] });
    expect(justUnder.breakdown.oversize).toBe(0);
  });

  it("charges one unit for every 100 KB past that", () => {
    const over = costOf({ subject: "", body: "", attachments: ["big"], attachmentBytes: [262_144 + 512_000] });
    expect(over.breakdown.oversize).toBe(5);
    expect(over.units).toBe(3 + 3 + 5);
  });

  it("prices a body nobody could have meant to send", () => {
    const huge = costOf({ subject: "hi", body: "a".repeat(2_000_000), attachments: [] });
    expect(huge.breakdown.oversize).toBe(Math.floor((2_000_002 - 262_144) / 102_400));
    expect(huge.units).toBeGreaterThan(schemaSafeFloor());
  });

  it("assumes a size for an attachment the inbox did not measure, rather than assuming zero", () => {
    const unmeasured = costOf({ subject: "", body: "", attachments: ["a", "b"] });
    expect(unmeasured.breakdown.bytes).toBe(2 * 131_072);
  });

  it("treats a missing, negative or non-finite stated size as unmeasured", () => {
    const odd = costOf({ subject: "", body: "", attachments: ["a", "b", "c"], attachmentBytes: [null, -5, Number.NaN] });
    expect(odd.breakdown.bytes).toBe(3 * 131_072);
  });

  it("counts bytes and not characters, so a body in another script is not free", () => {
    const ascii = costOf({ subject: "", body: "a".repeat(300), attachments: [] });
    const cjk = costOf({ subject: "", body: "漢".repeat(300), attachments: [] });
    expect(cjk.breakdown.bytes).toBe(3 * ascii.breakdown.bytes);
  });

  it("is the same number twice, which is the whole point of it", () => {
    expect(costOf({ ...ORDINARY, attachmentBytes: [4000, 5000] })).toEqual(costOf({ ...ORDINARY, attachmentBytes: [4000, 5000] }));
  });
});

/** An ordinary email with two documents. A 2 MB body must cost more than that. */
function schemaSafeFloor(): number {
  return 16;
}

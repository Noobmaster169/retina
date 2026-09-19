import { describe, expect, it } from "vitest";

import { buildClassifyInput } from "../../src/pipeline/classify";

const email = {
  from: "Docs Team <docs@example.test>",
  subject: "RE_ FW: Something   with odd spacing",
  body: "CAUTION: external sender.\n\nHi,\nPlease check the draft.\n\nBest Regards,\nSam\n\n-----Original Message-----\nFrom: someone",
};

describe("buildClassifyInput", () => {
  it("passes every part of the email through exactly as it arrived", () => {
    expect(buildClassifyInput(email, ["x_SI.txt", "x_BL.txt"], 4000)).toEqual({
      from: email.from,
      subject: email.subject,
      attachments: ["x_SI.txt", "x_BL.txt"],
      body: email.body,
    });
  });

  it("strips nothing: the banner, the signature and the quoted thread are the model's to read", () => {
    const { body } = buildClassifyInput(email, [], 4000);
    expect(body).toContain("CAUTION: external sender.");
    expect(body).toContain("Best Regards,");
    expect(body).toContain("-----Original Message-----");
  });

  it("cuts a long body at the cap and says so", () => {
    const { body } = buildClassifyInput({ ...email, body: "a".repeat(50) }, [], 20);
    expect(body).toBe(`${"a".repeat(20)}\n[the body was cut here for length]`);
  });

  it("leaves a body at the cap alone", () => {
    expect(buildClassifyInput({ ...email, body: "a".repeat(20) }, [], 20).body).toBe("a".repeat(20));
  });
});

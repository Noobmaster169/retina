import { describe, expect, it } from "vitest";

import { describeAttachments } from "../../src/pipeline/classify";

describe("describeAttachments", () => {
  it("names each file and gives its text as the parser recovered it", () => {
    const text = describeAttachments(
      [
        { filename: "e_SI.txt", text: "SHIPPING INSTRUCTION\nShipper: ACME", scanned: false, warnings: [] },
        { filename: "e_BL.txt", text: "BILL OF LADING (DRAFT)\nShipper: ACME", scanned: false, warnings: [] },
      ],
      1000,
    );
    expect(text).toBe("### e_SI.txt\nSHIPPING INSTRUCTION\nShipper: ACME\n\n### e_BL.txt\nBILL OF LADING (DRAFT)\nShipper: ACME");
  });

  it("says a file is unreadable, with the parser's reason, rather than leaving it out", () => {
    const text = describeAttachments([{ filename: "e_BL.pdf", text: null, scanned: false, warnings: ["the file is empty (0 bytes)"] }], 1000);
    expect(text).toBe("### e_BL.pdf\n(unreadable: the file is empty (0 bytes))");
  });

  it("marks text that came from OCR", () => {
    const text = describeAttachments([{ filename: "e_SI.pdf", text: "Shipper: ACME", scanned: true, warnings: ["page 1: read by OCR"] }], 1000);
    expect(text).toContain("### e_SI.pdf (text recovered by OCR from a scanned page)\nShipper: ACME");
  });

  it("cuts each file at the cap and says so", () => {
    const text = describeAttachments([{ filename: "big.txt", text: "a".repeat(50), scanned: false, warnings: [] }], 20);
    expect(text).toBe(`### big.txt\n${"a".repeat(20)}\n[the text was cut here for length]`);
  });

  it("is (none) with no files", () => {
    expect(describeAttachments([], 100)).toBe("(none)");
  });
});

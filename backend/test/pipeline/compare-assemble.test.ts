import { describe, expect, it } from "vitest";

import { TerminalError } from "../../src/lib/errors";
import { assemble, decide, judgeable } from "../../src/pipeline/compare";
import type { ExtractedField, ExtractedFields, Judgement } from "../../src/pipeline/compare";

const read = (value: string | null, quote: string | null = value, over: Partial<ExtractedField> = {}): ExtractedField => ({
  value,
  placeholder: null,
  source_quote: quote,
  confidence: 0.95,
  note: null,
  ...over,
});

// emails/data_v2/attachments/email_004_SI.txt and email_004_BL.txt: the BL names another consignee and notify party.
const SI_004: ExtractedFields = {
  shipper: read("APRIL FAR EAST (M) SDN BHD", "Shipper: APRIL FAR EAST (M) SDN BHD"),
  consignee: read("EAST BRIGHT FZ-LLC", "Consignee (Non-Negotiable): EAST BRIGHT FZ-LLC"),
  notify_party: read("EAST BRIGHT FZ-LLC", "Notify: EAST BRIGHT FZ-LLC"),
  port_of_loading: read("NANTONG, CHINA (CNNTG)", "Port of Loading (POL): NANTONG, CHINA (CNNTG)"),
  port_of_discharge: read("KARACHI, PAKISTAN (PKKHI)", "POD: KARACHI, PAKISTAN (PKKHI)"),
  container_count: read("6 x 40'HC", "Total Containers: 6 x 40'HC"),
  gross_weight_kg: read("131,058 KG", "Gross Wt (kgs): 131,058 KG"),
};
const BL_004: ExtractedFields = {
  ...SI_004,
  shipper: read("APRIL FAR EAST (M) SDN BHD", "SHIPPER: APRIL FAR EAST (M) SDN BHD"),
  consignee: read("UAB NOVAKOPA", "To the Order of: UAB NOVAKOPA"),
  notify_party: read("UAB NOVAKOPA", "Notify Party: UAB NOVAKOPA"),
  container_count: read("6 x 40'HC", "Container Count: 6 x 40'HC"),
  gross_weight_kg: read("131,058 KG", "Gross Weight (KG): 131,058 KG"),
};

const same = (rationale = "the same thing written the same way"): Judgement => ({ rationale, same: true, missing: false, confidence: 0.98 });
const different = (rationale: string): Judgement => ({ rationale, same: false, missing: false, confidence: 0.97 });
const allSame = (fields: readonly string[]) => Object.fromEntries(fields.map((f) => [f, same()]));

describe("judgeable", () => {
  it("is every field with a value on both sides, in the enum's order", () => {
    expect(judgeable(SI_004, BL_004)).toEqual(["shipper", "consignee", "notify_party", "port_of_loading", "port_of_discharge", "container_count", "gross_weight_kg"]);
  });

  it("leaves out a field either side has no value for", () => {
    const si = { ...SI_004, gross_weight_kg: read(null, "Gross Weight毛重(KGS): N/A", { placeholder: "N/A" }) };
    expect(judgeable(si, BL_004)).not.toContain("gross_weight_kg");
    expect(judgeable(si, BL_004)).toHaveLength(6);
  });
});

describe("assemble and decide", () => {
  it("email_004: two fields judged different are the defect fields, and the pair is a MISMATCH", () => {
    const judged = {
      ...allSame(judgeable(SI_004, BL_004)),
      consignee: different("two different companies"),
      notify_party: different("two different companies"),
    };
    const assembled = assemble(SI_004, BL_004, judged);
    expect(assembled.defectFields).toEqual(["consignee", "notify_party"]);
    expect(assembled.missing).toEqual([]);
    expect(assembled.fields).toHaveLength(7);
    expect(assembled.fields[1]).toEqual({
      field: "consignee",
      siValue: "EAST BRIGHT FZ-LLC",
      blValue: "UAB NOVAKOPA",
      same: false,
      missing: false,
      confidence: 0.97,
      rationale: "two different companies",
    });
    expect(decide(assembled)).toEqual({ status: "MISMATCH", reviewReason: null, defectFields: ["consignee", "notify_party"], missing: [] });
  });

  it("every field judged the same is OK", () => {
    const assembled = assemble(SI_004, SI_004, allSame(judgeable(SI_004, SI_004)));
    expect(assembled.defectFields).toEqual([]);
    expect(decide(assembled)).toEqual({ status: "OK", reviewReason: null, defectFields: [], missing: [] });
  });

  it("email_516: a placeholder on the SI is missing_value, not a mismatch, and the judge is not asked about it", () => {
    // Gross Weight毛重(KGS): N/A against Gross Weight (KG): 235,550 KG
    const si = { ...SI_004, gross_weight_kg: read(null, "Gross Weight毛重(KGS): N/A", { placeholder: "N/A" }) };
    const bl = { ...BL_004, gross_weight_kg: read("235,550 KG", "Gross Weight (KG): 235,550 KG") };
    const assembled = assemble(si, bl, allSame(judgeable(si, bl)));
    expect(assembled.missing).toEqual(["gross_weight_kg"]);
    expect(assembled.defectFields).toEqual([]);
    expect(assembled.fields[6]).toMatchObject({ same: false, missing: true, confidence: null, rationale: 'SI: "N/A" stands where the value should be' });
    expect(decide(assembled)).toEqual({ status: "NEEDS_REVIEW", reviewReason: "missing_value", defectFields: [], missing: ["gross_weight_kg"] });
  });

  it("email_517: two placeholders and a defect elsewhere: missing_value, with the defect carried as provisional", () => {
    // Port of Loading (POL): ____MT and Port of Discharge (POD): TBA
    const si = {
      ...SI_004,
      port_of_loading: read(null, "Port of Loading (POL): ____MT", { placeholder: "____MT" }),
      port_of_discharge: read(null, "Port of Discharge (POD): TBA", { placeholder: "TBA" }),
    };
    const judged = { ...allSame(judgeable(si, BL_004)), consignee: different("different companies") };
    const decision = decide(assemble(si, BL_004, judged));
    expect(decision).toEqual({
      status: "NEEDS_REVIEW",
      reviewReason: "missing_value",
      defectFields: ["consignee"],
      missing: ["port_of_loading", "port_of_discharge"],
    });
  });

  it("a value the extractor and verifier could not locate is missing, with the note as the reason", () => {
    const bl = { ...BL_004, notify_party: read(null, null, { note: "the verifier could not locate this value in the document", confidence: 0 }) };
    const assembled = assemble(SI_004, bl, allSame(judgeable(SI_004, bl)));
    expect(assembled.missing).toEqual(["notify_party"]);
    expect(assembled.fields[2].rationale).toBe("BL: the verifier could not locate this value in the document");
  });

  it("the judge may call a field missing that the extractor returned as a value", () => {
    const judged = { ...allSame(judgeable(SI_004, BL_004)), gross_weight_kg: { rationale: "the BL weight reads TBC", same: false, missing: true, confidence: 0.9 } };
    const assembled = assemble(SI_004, BL_004, judged);
    expect(assembled.missing).toEqual(["gross_weight_kg"]);
    expect(assembled.defectFields).toEqual([]);
  });

  it("a placeholder on both sides is one missing field, with both sides named", () => {
    const si = { ...SI_004, notify_party: read(null, "Notify: ???", { placeholder: "???" }) };
    const bl = { ...BL_004, notify_party: read(null, "Notify Party: TBA", { placeholder: "TBA" }) };
    const assembled = assemble(si, bl, allSame(judgeable(si, bl)));
    expect(assembled.fields[2].rationale).toBe('SI: "???" stands where the value should be; BL: "TBA" stands where the value should be');
  });

  it("refuses a judgement for a name outside the seven", () => {
    const judged = { ...allSame(judgeable(SI_004, BL_004)), vessel: same() } as Record<string, Judgement>;
    expect(() => assemble(SI_004, BL_004, judged)).toThrow(TerminalError);
  });

  it("refuses a missing judgement for a field with a value on both sides", () => {
    const judged = allSame(judgeable(SI_004, BL_004));
    delete judged.shipper;
    expect(() => assemble(SI_004, BL_004, judged)).toThrow(TerminalError);
  });
});

import { describe, expect, it } from "vitest";

import { checkEvidence, EXTRACT_TRUST_FROM, fieldsInDoubt } from "../../src/pipeline/compare";
import type { ExtractedField, ExtractedFields } from "../../src/pipeline/compare";

// Lines from emails/data_v2/attachments/email_004_SI.txt and email_516_SI.txt.
const TEXT = [
  "SHIPPING INSTRUCTION",
  "Shipper: APRIL FAR EAST (M) SDN BHD",
  "  TOWER 2, AVENUE 5, LEVEL 6; BANGSAR SOUTH CITY, NO. 8 JALAN KERINCHI; 59200 KUALA LUMPUR, MALAYSIA",
  "Consignee (Non-Negotiable): EAST BRIGHT FZ-LLC",
  "Gross Wt (kgs): 131,058 KG",
  "Gross Weight毛重(KGS): N/A",
].join("\n");

const field = (over: Partial<ExtractedField>): ExtractedField => ({
  value: "APRIL FAR EAST (M) SDN BHD",
  placeholder: null,
  source_quote: "Shipper: APRIL FAR EAST (M) SDN BHD",
  confidence: 0.95,
  note: null,
  ...over,
});

describe("checkEvidence", () => {
  it.each([
    ["the quote is a line and the value is in it", field({}), { ok: true }],
    ["spacing and case differ from the document", field({ source_quote: "shipper:   april far east (m) sdn bhd", value: "April Far East (M) Sdn Bhd" }), { ok: true }],
    ["a quote that spans two lines is still found when the text has them in order", field({ source_quote: "SHIPPING INSTRUCTION\nShipper: APRIL FAR EAST (M) SDN BHD", value: "APRIL FAR EAST (M) SDN BHD" }), { ok: true }],
    ["no quote at all", field({ source_quote: null }), { ok: false, reason: "no_quote" }],
    ["an empty quote", field({ source_quote: "   " }), { ok: false, reason: "no_quote" }],
    ["a quote the document does not contain", field({ source_quote: "Shipper: SOMEONE ELSE" }), { ok: false, reason: "quote_not_found" }],
    ["a value that is not inside its quote", field({ value: "EAST BRIGHT FZ-LLC" }), { ok: false, reason: "value_not_in_quote" }],
    ["a placeholder with its line found", field({ value: null, placeholder: "N/A", source_quote: "Gross Weight毛重(KGS): N/A" }), { ok: true }],
    ["a placeholder whose line is not in the text", field({ value: null, placeholder: "???", source_quote: "Gross Weight: ???" }), { ok: false, reason: "quote_not_found" }],
    ["a field the document does not carry has nothing to prove", field({ value: null, placeholder: null, source_quote: null, note: "no notify party label" }), { ok: true }],
  ])("%s", (_name, extracted, expected) => {
    expect(checkEvidence(TEXT, extracted)).toEqual(expected);
  });
});

describe("fieldsInDoubt", () => {
  const all = (over: Partial<ExtractedField> = {}): ExtractedFields => ({
    shipper: field(over),
    consignee: field({ value: "EAST BRIGHT FZ-LLC", source_quote: "Consignee (Non-Negotiable): EAST BRIGHT FZ-LLC", ...over }),
    notify_party: field({ value: null, placeholder: null, source_quote: null, note: "absent", ...over }),
    port_of_loading: field(over),
    port_of_discharge: field(over),
    container_count: field(over),
    gross_weight_kg: field({ value: "131,058 KG", source_quote: "Gross Wt (kgs): 131,058 KG", ...over }),
  });

  it("is empty when every field is proven and confident", () => {
    expect(fieldsInDoubt(TEXT, all())).toEqual([]);
  });

  it("names a field whose evidence fails, with the reason", () => {
    const fields = all();
    fields.gross_weight_kg = field({ value: "131,058 KG", source_quote: "Gross Wt (kgs): 131,058" });
    expect(fieldsInDoubt(TEXT, fields)).toEqual([{ field: "gross_weight_kg", reason: "value_not_in_quote" }]);
  });

  it("names a field the extractor was unsure of, even with its evidence in order", () => {
    const fields = all();
    fields.shipper = field({ confidence: EXTRACT_TRUST_FROM - 0.01 });
    expect(fieldsInDoubt(TEXT, fields)).toEqual([{ field: "shipper", reason: "low_confidence" }]);
  });

  it("an evidence failure outranks low confidence on the same field", () => {
    const fields = all();
    fields.shipper = field({ confidence: 0.2, source_quote: null });
    expect(fieldsInDoubt(TEXT, fields)).toEqual([{ field: "shipper", reason: "no_quote" }]);
  });

  it("an absent field with low confidence is still in doubt: the verifier looks for it once more", () => {
    const fields = all();
    fields.notify_party = field({ value: null, placeholder: null, source_quote: null, note: "absent", confidence: 0.3 });
    expect(fieldsInDoubt(TEXT, fields)).toEqual([{ field: "notify_party", reason: "low_confidence" }]);
  });
});

import type { LlmRequest } from "../../src/agents/llm-client";
import type { ExtractedFields } from "../../src/pipeline/compare";

/** The documents of emails/data_v2/attachments/email_004_*.txt and email_516_SI.txt, as doc-extract returns them. */

export const SI_004 = [
  "SHIPPING INSTRUCTION",
  "========================================",
  "",
  "Shipper: APRIL FAR EAST (M) SDN BHD",
  "  TOWER 2, AVENUE 5, LEVEL 6; BANGSAR SOUTH CITY, NO. 8 JALAN KERINCHI; 59200 KUALA LUMPUR, MALAYSIA",
  "Consignee (Non-Negotiable): EAST BRIGHT FZ-LLC",
  "  RAKEZ AMENITY CENTER; AL HAMRA INDUSTRIAL ZONE, RAK, UAE",
  "Notify: EAST BRIGHT FZ-LLC",
  "Port of Loading (POL): NANTONG, CHINA (CNNTG)",
  "POD: KARACHI, PAKISTAN (PKKHI)",
  "Total Containers: 6 x 40'HC",
  "Gross Wt (kgs): 131,058 KG",
  "Vessel: NAP 914 V.BS007",
  "Booking Ref: ONEYSINF32871",
  "Freight: PREPAID",
].join("\n");

export const BL_004 = [
  "BILL OF LADING (DRAFT)",
  "========================================",
  "",
  "SHIPPER: APRIL FAR EAST (M) SDN BHD",
  "  TOWER 2, AVENUE 5, LEVEL 6; BANGSAR SOUTH CITY, NO. 8 JALAN KERINCHI; 59200 KUALA LUMPUR, MALAYSIA",
  "To the Order of: UAB NOVAKOPA",
  "  RAKEZ AMENITY CENTER; AL HAMRA INDUSTRIAL ZONE, RAK, UAE",
  "Notify Party: UAB NOVAKOPA",
  "Port of Loading (POL): NANTONG, CHINA (CNNTG)",
  "POD: KARACHI, PAKISTAN (PKKHI)",
  "Container Count: 6 x 40'HC",
  "Gross Weight (KG): 131,058 KG",
  "Bill of Lading No.: SINF88496965",
  "Booking Ref: ONEYSINF32871",
  "Freight: PREPAID",
].join("\n");

export const SI_516 = [
  "SHIPPING INSTRUCTION",
  "========================================",
  "",
  "Shipper (Principal or Seller): APRIL FAR EAST (M) SDN BHD",
  "Consignee: EAST BRIGHT FZ-LLC",
  "Notify: EAST BRIGHT FZ-LLC",
  "PORT OF LOADING: NANTONG, CHINA",
  "POD: KARACHI, PAKISTAN",
  "No. of Containers or Packages: 6 x 40'HC",
  "Gross Weight毛重(KGS): N/A",
  "Description of Goods: PAPERBOARD",
  "NET WEIGHT: _______ MTS",
  "Freight: PREPAID",
].join("\n");

const field = (value: string | null, source_quote: string | null, over: Partial<ExtractedFields["shipper"]> = {}) => ({
  value,
  placeholder: null,
  source_quote,
  confidence: 0.97,
  note: null,
  ...over,
});

export const SI_004_FIELDS: ExtractedFields = {
  shipper: field("APRIL FAR EAST (M) SDN BHD", "Shipper: APRIL FAR EAST (M) SDN BHD"),
  consignee: field("EAST BRIGHT FZ-LLC", "Consignee (Non-Negotiable): EAST BRIGHT FZ-LLC"),
  notify_party: field("EAST BRIGHT FZ-LLC", "Notify: EAST BRIGHT FZ-LLC"),
  port_of_loading: field("NANTONG, CHINA (CNNTG)", "Port of Loading (POL): NANTONG, CHINA (CNNTG)"),
  port_of_discharge: field("KARACHI, PAKISTAN (PKKHI)", "POD: KARACHI, PAKISTAN (PKKHI)"),
  container_count: field("6 x 40'HC", "Total Containers: 6 x 40'HC"),
  gross_weight_kg: field("131,058 KG", "Gross Wt (kgs): 131,058 KG"),
};

export const BL_004_FIELDS: ExtractedFields = {
  shipper: field("APRIL FAR EAST (M) SDN BHD", "SHIPPER: APRIL FAR EAST (M) SDN BHD"),
  consignee: field("UAB NOVAKOPA", "To the Order of: UAB NOVAKOPA"),
  notify_party: field("UAB NOVAKOPA", "Notify Party: UAB NOVAKOPA"),
  port_of_loading: field("NANTONG, CHINA (CNNTG)", "Port of Loading (POL): NANTONG, CHINA (CNNTG)"),
  port_of_discharge: field("KARACHI, PAKISTAN (PKKHI)", "POD: KARACHI, PAKISTAN (PKKHI)"),
  container_count: field("6 x 40'HC", "Container Count: 6 x 40'HC"),
  gross_weight_kg: field("131,058 KG", "Gross Weight (KG): 131,058 KG"),
};

export const SI_516_FIELDS: ExtractedFields = {
  shipper: field("APRIL FAR EAST (M) SDN BHD", "Shipper (Principal or Seller): APRIL FAR EAST (M) SDN BHD"),
  consignee: field("EAST BRIGHT FZ-LLC", "Consignee: EAST BRIGHT FZ-LLC"),
  notify_party: field("EAST BRIGHT FZ-LLC", "Notify: EAST BRIGHT FZ-LLC"),
  port_of_loading: field("NANTONG, CHINA", "PORT OF LOADING: NANTONG, CHINA"),
  port_of_discharge: field("KARACHI, PAKISTAN", "POD: KARACHI, PAKISTAN"),
  container_count: field("6 x 40'HC", "No. of Containers or Packages: 6 x 40'HC"),
  gross_weight_kg: field(null, "Gross Weight毛重(KGS): N/A", { placeholder: "N/A", confidence: 0.9 }),
};

const docType = (doc_type: string, confidence = 0.96) => JSON.stringify({ rationale: "It says what it is.", doc_type, confidence });

/** A stand-in judge: the same when the two values read the same, a stand-in for the model, which reads meaning. */
function judgeByText(user: string): string {
  const answer: Record<string, unknown> = {};
  for (const section of user.split(/^## /m).slice(1)) {
    const [name, ...lines] = section.split("\n");
    if (!/^[a-z_]+$/.test(name.trim())) continue;
    const si = lines.find((l) => l.startsWith("- SI value: "))?.slice("- SI value: ".length);
    const bl = lines.find((l) => l.startsWith("- BL value: "))?.slice("- BL value: ".length);
    answer[name.trim()] = { rationale: si === bl ? "the same words" : "different words", same: si === bl, missing: false, confidence: 0.95 };
  }
  return JSON.stringify(answer);
}

/** Answers every step from the text in front of it, as the model would: no step is told which fixture it is reading. */
export function byContent(request: LlmRequest): string {
  const { system, user } = request;
  if (system.startsWith("You compare a Shipping Instruction")) return judgeByText(user);
  const extracting = system.startsWith("You read one shipping document") || system.startsWith("You check a reading");
  if (extracting) {
    if (user.includes("Gross Weight毛重(KGS): N/A")) return JSON.stringify(SI_516_FIELDS);
    if (user.includes("BILL OF LADING")) return JSON.stringify(BL_004_FIELDS);
    return JSON.stringify(SI_004_FIELDS);
  }
  if (user.includes("COMMERCIAL INVOICE")) return docType("INVOICE");
  if (user.includes("BILL OF LADING")) return docType("BL");
  return docType("SI");
}

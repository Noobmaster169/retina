import { describe, expect, it } from "vitest";

import { parseTonnage, roleFromName, senderDomain } from "../../src/ingest/email-facts";

describe("senderDomain", () => {
  it.each([
    ["docs@vitalsolutions.sg", "vitalsolutions.sg"],
    ["Mitchelle.Tan@AprilAsia.com", "aprilasia.com"],
    ["Docs Team <docs@fujitogrp.com>", "fujitogrp.com"],
    ["winner@prize-claims.info", "prize-claims.info"],
  ])("%s -> %s", (from, expected) => {
    expect(senderDomain(from)).toBe(expected);
  });
});

describe("parseTonnage", () => {
  it.each([
    ["REQUEST BL DRAFT _ PO 26067_ COATED IVORY BOARD__138MT", 138],
    ["RE_ REQUEST BL DRAFT _ PO 26061_ PAPERBOARD__42MT", 42],
    ["REQUEST BL DRAFT _ PO 26000_ UNCOATED WOODFREE PAPER IN REA__126MT", 126],
    ["Shipment of 1200 MTS confirmed", 1200],
    ["TO CONFIRM DOCS _ OC123 _ JEBEL ALI _ AL GURG _ MEDUX1234567", null],
    ["Mill D & D charges - 48213", null],
  ])("%s -> %s", (subject, expected) => {
    expect(parseTonnage(subject)).toBe(expected);
  });
});

describe("roleFromName", () => {
  it.each([
    ["email_004_SI.txt", "SI"],
    ["email_004_BL.txt", "BL"],
    ["email_120_SI.xlsx", "SI"],
    ["email_120_BL.docx", "BL"],
    ["email_511_BL.pdf", "BL"],
    ["scan0001.pdf", "UNKNOWN"],
  ])("%s -> %s", (filename, expected) => {
    expect(roleFromName(filename)).toBe(expected);
  });
});

import { describe, expect, it } from "vitest";

import { agreementNote, anythingInDoubt, groupRows, rewordedIn } from "./check-groups";
import type { FieldRowData } from "./field-row";
import type { FieldJudgementView } from "@/lib/api/comparison-schemas";

/**
 * Rows in the shape the compare stage produces them, taken from email_005
 * (seven agreeing fields, one of them written two ways) and from a pair where
 * the consignee differs and the gross weight was blank on one side.
 */

function row(judgement: Partial<FieldJudgementView> & { field: FieldJudgementView["field"] }): FieldRowData {
  return {
    judgement: {
      siValue: "ASIA PACIFIC PAPERBOARD TRADING PTE LTD",
      blValue: "ASIA PACIFIC PAPERBOARD TRADING PTE LTD",
      same: true,
      missing: false,
      confidence: 0.99,
      rationale: "Both name the same company with an identical address.",
      ...judgement,
    },
    si: undefined,
    bl: undefined,
  };
}

const ALL_AGREE: FieldRowData[] = [
  row({ field: "shipper" }),
  row({ field: "consignee" }),
  row({ field: "notify_party" }),
  row({ field: "port_of_loading" }),
  // The same place written two ways, which is the evidence a model judged it.
  row({ field: "port_of_discharge", siValue: "KOPER, SLOVENIA", blValue: "KOPER, SLOVENIA (SIKOP)" }),
  row({ field: "container_count" }),
  row({ field: "gross_weight_kg" }),
];

const MIXED: FieldRowData[] = [
  row({ field: "shipper" }),
  row({ field: "consignee", siValue: "BALL & DOGGETT", blValue: "SPICERS AUSTRALIA", same: false }),
  row({ field: "notify_party" }),
  row({ field: "port_of_loading" }),
  row({ field: "port_of_discharge", siValue: "KOPER", blValue: "TRIESTE", same: false }),
  row({ field: "container_count" }),
  row({ field: "gross_weight_kg", siValue: "341715", blValue: null, same: false, missing: true }),
];

const fields = (rows: FieldRowData[]) => rows.map((one) => one.judgement.field);

describe("groupRows", () => {
  it("puts a difference, a blank and an agreement each in their own group", () => {
    const groups = groupRows(MIXED);
    expect(fields(groups.differing)).toEqual(["consignee", "port_of_discharge"]);
    expect(fields(groups.blank)).toEqual(["gross_weight_kg"]);
    expect(fields(groups.agreed)).toEqual(["shipper", "notify_party", "port_of_loading", "container_count"]);
  });

  it("never counts a blank as a difference: one side having no value is an uncertainty", () => {
    const groups = groupRows(MIXED);
    expect(fields(groups.differing)).not.toContain("gross_weight_kg");
  });

  it("keeps the enum's order inside every group", () => {
    const groups = groupRows(MIXED);
    expect(fields(groups.agreed)).toEqual(fields(MIXED.filter((one) => groups.agreed.includes(one))));
  });

  it("loses no row", () => {
    const groups = groupRows(MIXED);
    expect(groups.differing.length + groups.blank.length + groups.agreed.length).toBe(MIXED.length);
  });

  it("makes every group empty for a pair that was never judged", () => {
    expect(groupRows([])).toEqual({ differing: [], blank: [], agreed: [] });
  });
});

describe("anythingInDoubt", () => {
  const cases: { name: string; rows: FieldRowData[]; expect: boolean }[] = [
    { name: "seven agreements ask for nobody", rows: ALL_AGREE, expect: false },
    { name: "a difference asks for someone", rows: MIXED, expect: true },
    { name: "a blank alone asks for someone", rows: [row({ field: "shipper", missing: true, same: false })], expect: true },
    { name: "nothing judged asks for nobody", rows: [], expect: false },
  ];

  for (const one of cases) {
    it(one.name, () => expect(anythingInDoubt(groupRows(one.rows))).toBe(one.expect));
  }
});

describe("rewordedIn", () => {
  it("names only the agreeing fields the two documents spelled differently", () => {
    expect(rewordedIn(groupRows(ALL_AGREE))).toEqual(["port_of_discharge"]);
  });

  it("names nothing where every agreement was written the same way", () => {
    expect(rewordedIn(groupRows([row({ field: "shipper" })]))).toEqual([]);
  });
});

describe("agreementNote", () => {
  it("says the sentence the seven rows used to say, and names the evidence", () => {
    expect(agreementNote(groupRows(ALL_AGREE))).toBe(
      "All 7 fields agree. Port_of_discharge was written two ways and the judge called it the same.",
    );
  });

  it("plurals when more than one was written two ways", () => {
    const two = [
      row({ field: "shipper", siValue: "ACME PTE", blValue: "ACME PTE LTD" }),
      row({ field: "consignee", siValue: "KOPER", blValue: "KOPER (SIKOP)" }),
    ];
    expect(agreementNote(groupRows(two))).toBe(
      "All 2 fields agree. Shipper and consignee were written two ways and the judge called them the same.",
    );
  });

  it("stays plain where nothing was reworded", () => {
    const two = [row({ field: "shipper" }), row({ field: "consignee" })];
    expect(agreementNote(groupRows(two))).toBe("All 2 fields agree across the two documents.");
  });

  it("does not say `all 1 fields`", () => {
    expect(agreementNote(groupRows([row({ field: "shipper" })]))).toBe("The one field compared agrees across the two documents.");
  });

  it("says nothing at all while something is in doubt", () => {
    expect(agreementNote(groupRows(MIXED))).toBeNull();
  });

  it("says nothing for a pair that was never judged", () => {
    expect(agreementNote(groupRows([]))).toBeNull();
  });
});

/**
 * What each list page calls itself, in one place.
 *
 * Here rather than inline in the list because the loading shell says it too.
 * None of it depends on data, so a page can draw its own heading, its own
 * sentence and its own crumb the instant it is asked for, and leave grey only
 * the part that is genuinely still being read. Two copies of a sentence would
 * drift, and the drift would show as the heading changing when the rows land.
 */

export interface ListCopy {
  crumb: string;
  title: string;
  lede: string;
}

export const LIST_COPY = {
  company: {
    crumb: "Companies",
    title: "Companies",
    lede: "Every shipper, consignee and notify party the mail named, resolved across its spellings, with what the mail shows about each.",
  },
  port: {
    crumb: "Ports",
    title: "Ports",
    lede: "Every port the mail named as a place of loading or discharge, one per UN/LOCODE, and every lane the shipments state between two of them.",
  },
  shipment: {
    crumb: "Shipments",
    title: "Shipments",
    lede: "One shipment per email, as the mail states it: the references, the parties, the lane and the cargo, with the fields the two documents disagreed on.",
  },
} as const satisfies Record<string, ListCopy>;

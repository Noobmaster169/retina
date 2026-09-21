import Link from "next/link";
import type { ReactNode } from "react";

import { ShipmentLane } from "@/components/business/shipment-lane";
import { Chip, toneOf } from "@/components/ui/chip";
import type { ShipmentDetail } from "@/lib/api/shipments-schemas";

import { none, Row, Section, Thing } from "./record-parts";

/** The whole record, in sections: who, where, what, on what terms, and the email it came from. `route` sits under the cargo, a picture of the lane after the facts. */
export function ShipmentRecord({ shipment: s, route }: { shipment: ShipmentDetail; route?: ReactNode }) {
  const extras = Object.entries(s.attributes);
  return (
    <div className="grid grid-cols-1 gap-8 px-7 py-6 xl:grid-cols-2">
      <div className="space-y-8">
        <Section title="Parties">
          <Row label="Shipper"><Thing type="party" item={s.shipper} /></Row>
          <Row label="Consignee"><Thing type="party" item={s.consignee} /></Row>
          <Row label="Notify party"><Thing type="party" item={s.notifyParty} /></Row>
        </Section>
        <Section title="Lane and voyage">
          <Row label="Lane"><ShipmentLane pol={s.pol} pod={s.pod} /></Row>
          <Row label="Carrier"><Thing type="carrier" item={s.carrier} /></Row>
          <Row label="Vessel"><Thing type="vessel" item={s.vessel} /></Row>
          <Row label="Voyage">{s.voyage ?? none}</Row>
        </Section>
        <Section title="Cargo">
          <Row label="Commodity"><Thing type="commodity" item={s.commodity} /></Row>
          <Row label="HS code">{s.hsCode ?? none}</Row>
          <Row label="Containers">{s.containerCount !== null ? `${s.containerCount} x ${s.containerType ?? "container"}` : none}</Row>
          <Row label="Gross weight">{s.grossWeightKg !== null ? `${s.grossWeightKg.toLocaleString()} kg` : none}</Row>
        </Section>
        {route}
      </div>
      <div className="space-y-8">
        <Section title="References and terms">
          <Row label="OC number">{s.ocNo ?? none}</Row>
          <Row label="BL number">{s.blNo ?? none}</Row>
          <Row label="Booking">{s.bookingRef ?? none}</Row>
          <Row label="Invoice">{s.invoiceNo ?? none}</Row>
          <Row label="PO">{s.poNo ?? none}</Row>
          <Row label="Trade term">{s.tradeTerm ?? none}</Row>
          <Row label="Payment term">{s.paymentTerm ?? none}</Row>
          <Row label="BL type">{s.blType ?? none}</Row>
          <Row label="Freight">{s.freight ?? none}</Row>
          <Row label="Mail date">
            {s.mailDate ? (
              <>
                {s.mailDate}
                {s.mailDateQuote ? <span className="ml-2 font-mono text-mono-xs text-ink-tertiary">&ldquo;{s.mailDateQuote}&rdquo;</span> : null}
              </>
            ) : (
              none
            )}
          </Row>
        </Section>
        {extras.length ? (
          <Section title="What else the mail states">
            {extras.map(([key, value]) => (
              <Row key={key} label={key.replace(/_/g, " ")}>
                {value}
              </Row>
            ))}
          </Section>
        ) : null}
        <Section title="The email">
          <Row label="Email"><span className="font-mono text-mono-sm">{s.emailId}</span></Row>
          <Row label="Subject">{s.subject}</Row>
          <Row label="Outcome">{s.outcome ? <Chip tone={toneOf(s.outcome)} mono>{s.outcome}</Chip> : none}</Row>
          <Row label="Disputed fields">
            {s.disputedFields.length ? (
              <span className="flex flex-wrap gap-1.5">
                {s.disputedFields.map((field) =>
                  s.caseHref ? (
                    <Link key={field} href={s.caseHref}>
                      <Chip tone="differ" mono>{field}</Chip>
                    </Link>
                  ) : (
                    <Chip key={field} tone="differ" mono>{field}</Chip>
                  ),
                )}
              </span>
            ) : (
              <span className="text-match">the two documents agreed</span>
            )}
          </Row>
          {s.caseHref ? (
            <Row label="Open">
              <Link href={s.caseHref} className="text-accent hover:underline">The email and its documents</Link>
            </Row>
          ) : null}
        </Section>
      </div>
    </div>
  );
}

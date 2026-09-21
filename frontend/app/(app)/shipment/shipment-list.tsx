"use client";

import { FilterBar } from "@/components/business/filter-bar";
import { LIST_COPY } from "@/components/business/list-copy";
import { ListPage } from "@/components/business/list-page";
import { MoreBelow } from "@/components/business/more-below";
import { CARD_STEP, TABLE_STEP } from "@/components/business/soft-page";
import { useSoftPage } from "@/components/business/use-soft-page";
import { ShipmentTable } from "@/components/business/shipment-table";
import { useView } from "@/components/business/use-view";
import { ViewToggle } from "@/components/business/view-toggle";
import type { ShipmentRow } from "@/lib/api/shipments-schemas";

import { ShipmentCard } from "./shipment-card";

const VIEWS = ["table", "cards"] as const;

export function ShipmentList({ rows, total }: { rows: ShipmentRow[]; total: number }) {
  const [view, setView] = useView("shipment", VIEWS);
  // The filtering here is the backend's, so the rows that arrive are already
  // the answer; this only decides how much of the answer is drawn at once.
  const page = useSoftPage(rows, view === "cards" ? CARD_STEP : TABLE_STEP, view);
  return (
    <ListPage
      {...LIST_COPY.shipment}
      toolbar={
        <>
          <FilterBar
            placeholder="Search by OC, BL or booking"
            selects={[
              {
                param: "disputed",
                label: "Disputed",
                options: [
                  { value: "true", label: "Only disputed" },
                  { value: "false", label: "Only clean" },
                ],
              },
            ]}
            shown={rows.length}
            total={total}
          />
          <ViewToggle
            views={[
              { key: "table", label: "Table", icon: "table" },
              { key: "cards", label: "Cards", icon: "cards" },
            ]}
            current={view}
            onChange={setView}
          />
        </>
      }
    >
      {view === "table" ? (
        <ShipmentTable rows={page.shown} />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {page.shown.map((row) => (
            <ShipmentCard key={row.emailId} row={row} />
          ))}
          {rows.length === 0 ? (
            <p className="col-span-full py-10 text-center text-body text-ink-tertiary">No shipment has been read yet.</p>
          ) : null}
        </div>
      )}
      <MoreBelow rest={page.rest} sentinel={page.sentinel} />
    </ListPage>
  );
}

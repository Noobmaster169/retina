"use client";

import { FilterBar } from "@/components/business/filter-bar";
import { ListPage } from "@/components/business/list-page";
import { ShipmentTable } from "@/components/business/shipment-table";
import { useView } from "@/components/business/use-view";
import { ViewToggle } from "@/components/business/view-toggle";
import type { ShipmentRow } from "@/lib/api/shipments-schemas";

import { ShipmentCard } from "./shipment-card";

const VIEWS = ["table", "cards"] as const;

export function ShipmentList({ rows, total }: { rows: ShipmentRow[]; total: number }) {
  const [view, setView] = useView("shipment", VIEWS);
  return (
    <ListPage
      crumb="Shipments"
      title="Shipments"
      lede="One shipment per email, as the mail states it: the references, the parties, the lane and the cargo, with the fields the two documents disagreed on."
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
        <ShipmentTable rows={rows} />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => (
            <ShipmentCard key={row.emailId} row={row} />
          ))}
          {rows.length === 0 ? (
            <p className="col-span-full py-10 text-center text-body text-ink-tertiary">No shipment has been read yet.</p>
          ) : null}
        </div>
      )}
    </ListPage>
  );
}

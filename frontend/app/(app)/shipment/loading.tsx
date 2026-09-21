import { LIST_COPY } from "@/components/business/list-copy";
import { ListTemplate, TableTemplate } from "@/components/shell/page-skeleton";

/**
 * The table, because that is the view a shipment list opens in.
 *
 * The labels are written out rather than imported from `shipment-table.tsx`.
 * That module is a client one, and a plain value imported from a client module
 * into a shell that renders on the server arrives as a reference to it rather
 * than as itself, which is not something a caller can read a label off.
 */
const HEADS = [
  { label: "Reference" },
  { label: "Shipper" },
  { label: "Consignee" },
  { label: "Lane", width: "280px" },
  { label: "Vessel" },
  { label: "Mail date" },
  { label: "Disputed" },
];

export default function Loading() {
  return (
    <ListTemplate copy={LIST_COPY.shipment}>
      <TableTemplate columns={HEADS} />
    </ListTemplate>
  );
}

import type { ComparisonField } from "@/lib/api/runs-schemas";

const LABELS: Record<ComparisonField, string> = {
  shipper: "Shipper",
  consignee: "Consignee",
  notify_party: "Notify party",
  port_of_loading: "Port of loading",
  port_of_discharge: "Port of discharge",
  container_count: "Container count",
  gross_weight_kg: "Gross weight",
};

export function fieldLabel(field: ComparisonField): string {
  return LABELS[field];
}

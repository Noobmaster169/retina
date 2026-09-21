import type { Category } from "@/lib/api/trace-schemas";

/** Plain-language labels for the organiser categories shown in working UI. */
const LABELS: Record<Category, string> = {
  BL_COMPARISON: "Bill of lading check",
  SI_REQUEST: "Shipping instruction",
  INVOICE_QUERY: "Invoice question",
  GENERAL: "General",
  SPAM: "Spam",
};

/**
 * Category accents are deliberately softer than verdict colors. They help a
 * reader scan the inbox without competing with an actual finding.
 */
const STYLES: Record<Category, string> = {
  BL_COMPARISON: "bg-accent-tint text-accent",
  SI_REQUEST: "bg-kind-company-tint text-kind-company",
  INVOICE_QUERY: "bg-kind-commodity-tint text-kind-commodity",
  GENERAL: "bg-sunken text-ink-secondary",
  SPAM: "bg-fault-tint text-fault",
};

export function classificationLabel(category: Category): string {
  return LABELS[category];
}

export function ClassificationChip({ category, className = "" }: { category: Category; className?: string }) {
  const label = classificationLabel(category);
  return (
    <span
      title={label}
      className={`inline-flex h-[22px] shrink-0 items-center whitespace-nowrap rounded-sm px-2 text-caption font-medium ${STYLES[category]} ${className}`}
    >
      {label}
    </span>
  );
}

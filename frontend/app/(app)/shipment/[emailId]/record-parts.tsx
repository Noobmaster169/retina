import Link from "next/link";
import type { ReactNode } from "react";

import { hrefFor } from "@/components/business/kind";
import type { ShipmentRef } from "@/lib/api/shipments-schemas";

/** The three shapes a record is made of: a section of rows, one row, and a thing that links out where it can. */

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-8 items-start gap-3 border-b border-hairline-faint py-1.5">
      <dt className="w-36 shrink-0 text-caption text-ink-tertiary">{label}</dt>
      <dd className="min-w-0 grow text-small text-ink">{children}</dd>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-1 text-heading font-medium">{title}</h2>
      <dl>{children}</dl>
    </section>
  );
}

const INK: Record<string, string> = { party: "text-kind-company", port: "text-kind-port" };

export function Thing({ type, item }: { type: string; item: ShipmentRef | null }) {
  if (!item) return <span className="text-ink-faint">not stated</span>;
  const href = hrefFor(type, item.id);
  const name = <span className={INK[type] ?? "text-ink"}>{item.name}</span>;
  return href ? (
    <Link href={href} className="hover:underline">
      {name}
    </Link>
  ) : (
    name
  );
}

export const none = <span className="text-ink-faint">not stated</span>;

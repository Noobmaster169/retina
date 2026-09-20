import Link from "next/link";

import { GLYPH_OF } from "@/components/graph/glyphs";
import { Icon } from "@/components/ui/icons";
import type { TableSummary } from "@/lib/api/database-schemas";
import type { ObjectTypeSummary } from "@/lib/api/ontology-schemas";

/**
 * The rail carries both halves: things above, tables below.
 *
 * Which is the point of the whole page. A thing is a record the model built
 * out of many rows; a table is those rows. Putting them in one rail, under one
 * segmented control, is what says they are one page and not two products
 * sharing a navigation.
 */

interface SchemaRailProps {
  types: ObjectTypeSummary[];
  tables: TableSummary[];
  runId: string;
  /** What is open: an object type, or a schema-qualified table. */
  activeType: string | null;
  activeTable: string | null;
}

export function SchemaRail({ types, tables, runId, activeType, activeTable }: SchemaRailProps) {
  return (
    <nav aria-label="The schema" className="flex w-[232px] shrink-0 flex-col border-r border-hairline bg-surface">
      <div className="min-h-0 grow overflow-y-auto px-2.5 pt-2">
        <Heading>things</Heading>
        <ul>
          {types.map((type) => (
            <li key={type.type}>
              <ThingRow type={type} runId={runId} active={type.type === activeType} />
            </li>
          ))}
        </ul>

        <Heading className="mt-2.5">tables</Heading>
        <ul>
          {tables.map((table) => {
            const key = `${table.schema}.${table.name}`;
            return (
              <li key={key}>
                <Link
                  href={`/runs/${runId}/database?view=rows&schema=${table.schema}&table=${table.name}`}
                  aria-current={key === activeTable ? "page" : undefined}
                  className={`flex h-[27px] items-center gap-2 rounded-sm px-2 ${
                    key === activeTable ? "bg-active" : "hover:bg-sunken"
                  }`}
                >
                  <Icon name="table" size={13} className={key === activeTable ? "text-ink" : "text-ink-faint"} />
                  <span
                    className={`min-w-0 truncate font-mono text-mono-sm ${
                      key === activeTable ? "font-medium text-ink" : "text-ink-secondary"
                    }`}
                  >
                    {table.name}
                  </span>
                  <span className="grow" />
                  <span className="font-mono text-[10.5px] text-ink-faint">{table.rows.toLocaleString()}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>

      <p className="shrink-0 border-t border-hairline px-[18px] py-3 text-caption leading-[17px] text-ink-faint">
        The same data twice. A thing is a record the model built out of many rows; a table is those rows. Both read
        only.
      </p>
    </nav>
  );
}

function Heading({ children, className = "" }: { children: string; className?: string }) {
  return (
    <div className={`flex h-7 items-center gap-2 px-2 ${className}`}>
      <span className="font-mono text-mono-xs text-ink-faint">{children}</span>
      <span className="h-px grow bg-hairline-faint" />
    </div>
  );
}

function ThingRow({ type, runId, active }: { type: ObjectTypeSummary; runId: string; active: boolean }) {
  const planned = !type.built;
  const shell = `flex h-[27px] items-center gap-2 rounded-sm px-2 ${active ? "bg-active" : planned ? "" : "hover:bg-sunken"}`;
  const body = (
    <>
      <Icon name={GLYPH_OF[type.type]} size={13} className={planned ? "text-hairline-strong" : active ? "text-ink" : "text-ink-faint"} />
      <span
        className={`min-w-0 truncate text-small ${
          planned ? "text-ink-faint" : active ? "font-medium text-ink" : "text-ink-secondary"
        }`}
      >
        {type.label}
      </span>
      <span className="grow" />
      <span className="font-mono text-[10.5px] text-ink-faint">{planned ? "planned" : type.count.toLocaleString()}</span>
    </>
  );

  // A planned type is reachable to read about and has nothing to list, so it
  // is drawn and not linked. Saying so on hover beats a page that 404s.
  if (planned) {
    return (
      <span className={shell} title="Designed and not built: nothing in the organisers' seven fields yields one">
        {body}
      </span>
    );
  }
  return (
    <Link href={`/runs/${runId}/database?view=things&type=${type.type}`} aria-current={active ? "page" : undefined} className={shell}>
      {body}
    </Link>
  );
}

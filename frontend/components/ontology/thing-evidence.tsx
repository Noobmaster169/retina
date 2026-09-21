"use client";

import { useState } from "react";

import { WhereItSits } from "@/components/database/where-it-sits";
import { WrittenTheseWays } from "@/components/database/written-these-ways";
import type { EntityDetail } from "@/lib/api/ontology-schemas";
import { formatWhen } from "@/lib/when";

/**
 * The proof under the meaning: every column stored for this thing, who wrote
 * each, and the spellings judged into it.
 *
 * Closed by default and not hidden. A reader who wants to know what a port is
 * should not have to read `read_from: 10` first, and a reader checking a claim
 * should not have to leave the page to find the row it came from.
 *
 * The tree of link counts is here too, for the same reason: every branch of it
 * is a table this thing is joined to, which is the schema rather than the
 * trade.
 */

export function ThingEvidence({ detail }: { detail: EntityDetail }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="mt-4 border-t border-hairline pt-3">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 text-left text-caption text-ink-tertiary hover:text-ink"
      >
        <span className={`transition-transform ${open ? "rotate-90" : ""}`} aria-hidden="true">
          &rsaquo;
        </span>
        The evidence: {detail.values.length} stored values, {detail.names.length} spellings, and where it sits
      </button>

      {open ? (
        <div className="pt-3">
          <dl>
            {detail.values.map((value) => (
              <div key={value.key} className="border-t border-hairline-faint py-[7px]">
                <dt className="font-mono text-[10.5px] text-ink-faint">
                  {value.key}
                  <span className="ml-1.5 font-sans text-ink-faint">{value.writtenBy}</span>
                </dt>
                <dd className={`mt-[2px] text-small leading-[18px] ${value.value === null ? "text-ink-faint" : "text-ink"}`}>
                  {value.value === null ? "not set" : value.valueType === "date" ? formatWhen(value.value) : value.value}
                </dd>
              </div>
            ))}
          </dl>
          <div className="pt-4">
            <WrittenTheseWays names={detail.names} />
          </div>
          <div className="-mx-[22px] pt-4">
            <WhereItSits detail={detail} />
          </div>
          {detail.profile?.markdown ? (
            <div className="border-t border-hairline-faint pt-3">
              <h3 className="text-caption text-ink-tertiary">The profile as it was written</h3>
              {/* The rendered Markdown as text, headings and all: its headings
                  are the labels a reader needs, and a renderer here would be a
                  second place they could be dropped. */}
              <pre className="mt-2 font-sans text-small leading-[18px] whitespace-pre-wrap text-ink-secondary">
                {detail.profile.markdown}
              </pre>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

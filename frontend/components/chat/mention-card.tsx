"use client";

import useSWR from "swr";

import { HUE_CLASSES, kindOf } from "@/components/business/kind";
import { Flag } from "@/components/ui/flag";
import { Icon } from "@/components/ui/icons";
import { EntityRow } from "@/lib/api/ontology-schemas";
import { flagSrc } from "@/lib/flag";
import { parsedFetcher } from "@/lib/poll";
import { formatWhenShort } from "@/lib/when";

import { previewChips } from "./preview-chips";

/**
 * What a thing is, without leaving the answer.
 *
 * The read is deferred to the hover rather than done with the turn: an answer
 * names two or three things and a reader opens at most one of them, so eight
 * cards fetched with every turn would be seven wasted reads and a slower
 * answer. SWR keeps what it read, so the second hover is instant.
 */

const Preview = EntityRow.nullable();

export function MentionCard({ id }: { id: string }) {
  const { data, error, isLoading } = useSWR(`/api/ontology/entity/${id}/preview`, parsedFetcher(Preview), {
    revalidateOnFocus: false,
    keepPreviousData: false,
  });

  if (isLoading) return <p className="text-small text-ink-tertiary">Reading...</p>;
  if (error) return <p className="text-small text-ink-tertiary">Could not read this one.</p>;
  if (!data) return <p className="text-small text-ink-tertiary">This one is no longer in the data.</p>;

  const kind = kindOf(data.type);
  const hue = HUE_CLASSES[kind.hue];
  const countryCode = data.attributes.countryCode ?? null;
  const chips = previewChips(data.type, data.attributes);

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-2.5">
        <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${hue.tint} ${hue.text}`}>
          {flagSrc(countryCode) ? <Flag code={countryCode} height={16} /> : <Icon name={kind.icon} size={14} />}
        </span>
        <span className="min-w-0">
          <span className={`block truncate text-strong font-medium ${hue.text}`}>{data.name}</span>
          <span className="block text-caption text-ink-tertiary">
            {kind.label}
            {data.lastSeen ? ` · last seen ${formatWhenShort(data.lastSeen)}` : ""}
          </span>
        </span>
      </div>

      <p className="line-clamp-3 text-small leading-[18px] text-ink-secondary">{data.summary ?? "Not profiled yet."}</p>

      {chips.length ? (
        <div className="flex flex-wrap gap-1">
          {chips.map((chip) => (
            <span key={chip} className="inline-flex h-[20px] items-center rounded-sm bg-sunken px-1.5 text-caption text-ink-secondary">
              {chip}
            </span>
          ))}
        </div>
      ) : null}

      <div className="flex gap-4 text-caption text-ink-tertiary">
        <span>
          <span className="font-mono text-mono-sm text-ink">{data.emails}</span> emails
        </span>
        <span>
          <span className="font-mono text-mono-sm text-ink">{data.names}</span> {data.names === 1 ? "spelling" : "spellings"}
        </span>
      </div>
    </div>
  );
}

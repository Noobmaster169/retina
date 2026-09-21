"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { EntityList } from "@/lib/api/ontology-schemas";
import type { EntityKind } from "@/lib/api/semantic-schemas";
import { Flag } from "@/components/ui/flag";
import { parsedFetcher } from "@/lib/poll";

import { hrefFor } from "./kind";

const ACTOR = "the reviewer";

/**
 * Two things that are one. The person picks which other thing this one is,
 * and this one folds into it: its spellings, its appearances and its
 * shipments move across, and the page opens on the survivor.
 */
export function SameAs({ kind, id, name }: { kind: EntityKind; id: string; name: string }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const { data } = useSWR(open ? `/api/ontology/${kind}` : null, parsedFetcher(EntityList));
  const q = query.trim().toLowerCase();
  const others = (data?.entities ?? []).filter((row) => row.id !== id && (!q || row.name.toLowerCase().includes(q))).slice(0, 40);

  async function merge(): Promise<void> {
    if (!chosen) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/ontology/${kind}/${encodeURIComponent(id)}/merge`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ actor: ACTOR, into: chosen.id }),
      });
      if (!response.ok) {
        toast.refuse(((await response.json().catch(() => ({}))) as { error?: string }).error ?? "The merge was refused.");
        return;
      }
      toast.say("Merged", `${name} is now ${chosen.name}`);
      setOpen(false);
      router.push(hrefFor(kind, chosen.id) ?? "/");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} className="h-8">
        <Icon name="graph" size={12} />
        Same as
      </Button>
      <Modal open={open} onOpenChange={setOpen} title={`${name} is the same as`} note="This one folds into the one you pick, and the resolver keeps them together.">
        <div className="space-y-3 p-5">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name"
            className="h-9 w-full rounded-md border border-hairline bg-sunken px-2.5 text-strong text-ink placeholder:text-ink-faint"
          />
          <ul className="max-h-[40vh] overflow-y-auto rounded-md border border-hairline">
            {others.map((row) => {
              const here = chosen?.id === row.id;
              return (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => setChosen({ id: row.id, name: row.name })}
                    aria-pressed={here}
                    className={`flex h-9 w-full items-center gap-2 px-3 text-left text-small ${here ? "bg-accent-tint text-accent" : "hover:bg-sunken"}`}
                  >
                    <span className="flex w-6 shrink-0 items-center"><Flag code={row.attributes.countryCode} height={11} /></span>
                    <span className="min-w-0 grow truncate">{row.name}</span>
                    <span className="font-mono text-mono-sm text-ink-tertiary">{row.emails}</span>
                  </button>
                </li>
              );
            })}
            {data && others.length === 0 ? <li className="px-3 py-3 text-caption text-ink-faint">Nothing else matches.</li> : null}
          </ul>
          <div className="flex items-center justify-end gap-2 pt-1">
            {chosen ? <span className="grow text-small text-ink-secondary">Keep {chosen.name}, fold {name} into it.</span> : null}
            <Button onClick={() => setOpen(false)} variant="quiet" disabled={busy}>
              Cancel
            </Button>
            <Button onClick={() => void merge()} variant="primary" disabled={!chosen || busy}>
              {busy ? "Merging" : "Merge"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

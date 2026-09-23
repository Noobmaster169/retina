"use client";

import { useState } from "react";
import useSWR from "swr";

import { InboxList, type RunSource } from "@/lib/api/runs-schemas";
import { parsedFetcher } from "@/lib/poll";

import { grouped } from "./inbox-scope";
import type { Choice } from "./labelled-select";

/**
 * Which inbox a new run reads, from the ones this deployment actually has.
 *
 * Asked of `/api/inboxes`, which probes each inbox's own server, rather than
 * read off `/health`, which only ever described the one inbox that server had
 * mounted. An inbox that did not answer is not offered: a run started against
 * it would sit at "created" and fail its first ingest.
 *
 * Read once and not polled. Inboxes appear when somebody starts a container,
 * not while a form is open.
 */

export interface InboxChoice {
  /** The inboxes to offer, each named with its size. Empty until the first answer. */
  choices: Choice[];
  source: RunSource;
  setSource(source: RunSource): void;
  /** How many emails the chosen inbox holds. Null before it answers. */
  size: number | null;
  /** Whether it is the organisers' inbox, which is the only one the eval split was made from. */
  organisers: boolean;
}

export function useInboxChoice(): InboxChoice {
  const [source, setSource] = useState<RunSource>("averis");
  const { data } = useSWR("/api/inboxes", parsedFetcher(InboxList), { revalidateOnFocus: false });
  const offered = (data?.inboxes ?? []).filter((inbox) => inbox.reachable);
  const chosen = offered.find((inbox) => inbox.source === source) ?? null;
  return {
    choices: offered.map((inbox) => ({
      value: inbox.source,
      label: inbox.emails === null ? inbox.label : `${inbox.label}, ${grouped(inbox.emails)}`,
      hint: inbox.scoringAvailable ? undefined : "Its answer key is not mounted, so a run of it cannot be scored",
    })),
    source,
    setSource,
    size: chosen?.emails ?? null,
    organisers: source === "averis",
  };
}

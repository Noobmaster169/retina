"use client";

import { useMemo } from "react";
import useSWR from "swr";

import { ReviewQueue } from "@/lib/api/review-schemas";
import { RunEmailsPage } from "@/lib/api/trace-schemas";
import { parsedFetcher } from "@/lib/poll";

import { type InboxRow, mergeRows } from "./inbox-rows";

/**
 * Every email of a run and every case still open against one, as rows.
 *
 * The whole run and not one page of it. Filtering, sorting and searching all
 * happen in the browser, which is the only way a keystroke can be free, and
 * that is only honest if the browser has every row: a list that searched the
 * two hundred it had loaded would quietly answer the wrong question.
 *
 * How often it re-reads is decided by what came back. A run with something
 * still moving is worth four seconds; a finished one is a page that changes
 * when a person changes it, and the case that person is looking at is polled
 * by the pane beside this, not here.
 */

/** The api's own ceiling. A run of 520 is three requests, made at once. */
const PAGE_SIZE = 200;
/** Two polls fire together at this rate, so it buys twice what it says. */
const LIVE_MS = 6000;
const IDLE_MS = 30000;

interface RunInbox {
  rows: InboxRow[];
  /** Every email of the run, which is not `rows.length` while the first page is still arriving. */
  total: number;
  loading: boolean;
}

export function useRunInbox(runId: string, initialList: RunEmailsPage): RunInbox {
  const { data: list = initialList } = useSWR(`/api/runs/${runId}/emails?pageSize=${PAGE_SIZE}`, everyPage, {
    fallbackData: initialList,
    refreshInterval: (latest) => (stillMoving(latest) ? LIVE_MS : IDLE_MS),
    keepPreviousData: true,
  });

  const { data: queue, isLoading } = useSWR(`/api/review?runId=${runId}&status=open`, parsedFetcher(ReviewQueue), {
    refreshInterval: stillMoving(list) ? LIVE_MS : IDLE_MS,
    keepPreviousData: true,
  });

  const cases = useMemo(() => queue?.cases ?? [], [queue]);
  const rows = useMemo(() => mergeRows(list.emails, cases), [list.emails, cases]);

  return { rows, total: list.total, loading: isLoading && list.emails.length === 0 };
}

/** One request for the first page, then the rest at once. The count comes back with the first. */
async function everyPage(url: string): Promise<RunEmailsPage> {
  const read = parsedFetcher(RunEmailsPage);
  const first = await read(`${url}&page=1`);
  const rest = Math.ceil(first.total / PAGE_SIZE) - 1;
  if (rest < 1) return first;
  const pages = await Promise.all(Array.from({ length: rest }, (_, index) => read(`${url}&page=${index + 2}`)));
  return { ...first, emails: pages.reduce((all, page) => all.concat(page.emails), first.emails) };
}

/** Whether anything in the run has yet to reach an outcome. */
function stillMoving(list: RunEmailsPage | undefined): boolean {
  return list?.emails.some((email) => email.outcome === null && email.stage !== "failed") ?? false;
}

"use client";

import { useDeferredValue, useMemo, useState } from "react";

import { PageContext } from "@/components/dock/page-context-announcer";
import { openingLine } from "@/components/email/email-reading";
import { EmailPane } from "@/components/email/email-pane";
import { useEmailDetail } from "@/components/email/use-email-detail";
import { countsOf, narrow, search } from "@/components/inbox/inbox-filters";
import { InboxList } from "@/components/inbox/inbox-list";
import { needsYou } from "@/components/inbox/inbox-rows";
import { NothingOpen } from "@/components/inbox/nothing-open";
import { type InboxParams, useInboxView } from "@/components/inbox/use-inbox-view";
import { useRunInbox } from "@/components/inbox/use-run-inbox";
import { NavCounts } from "@/components/shell/nav-counts";
import type { RunEmailsPage } from "@/lib/api/trace-schemas";

/**
 * The run's emails and whichever one is open: the list down the left and the
 * email beside it. The conversation about it is the dock, which the shell
 * mounts once, so this page announces what it is about rather than carrying a
 * chat column of its own.
 *
 * One screen, because there was never more than one. `Needs a person` was a
 * second page over the same emails with a second idea of what was selected,
 * and it is a chip on this list now. Choosing an email changes state here and
 * nothing else: no route and no server round trip.
 *
 * The pane is keyed on the email so everything per email resets with it. It
 * used to share that key with the chat column beside it, which made them two
 * siblings of one parent carrying one key: React's own warning for that says
 * children "may be duplicated", and they were, which is why choosing three
 * cases in a row left three case panes squeezed side by side.
 *
 * Below 768px there is room for one column, so the list and the email take
 * turns and the pane carries a way back.
 */

interface InboxPageProps {
  runId: string;
  initialList: RunEmailsPage;
  /** The opening screen, as the server settled it from the URL and the cookie. */
  params: InboxParams;
}

export function InboxPage({ runId, initialList, params }: InboxPageProps) {
  const { rows, total, loading } = useRunInbox(runId, initialList);
  const { view, setView, selected, select } = useInboxView(runId, params);
  const [tab, setTab] = useState("check");
  const detail = useEmailDetail(runId, selected);

  // The field takes the keystroke now and the rows catch up on the next frame
  // React can spare, so typing never waits for five hundred of them.
  const query = useDeferredValue(view.query);
  const searched = useMemo(() => search(rows, query), [rows, query]);
  const counts = useMemo(() => countsOf(searched), [searched]);
  const shown = useMemo(() => narrow(searched, view.filter, view.sort), [searched, view.filter, view.sort]);
  // The rail's count is the run's, never the search's: it answers how much is
  // waiting in here, not how much of what you typed is.
  const waiting = useMemo(() => rows.filter(needsYou).length, [rows]);

  const open = selected !== null;
  const trace = open ? detail.trace : undefined;
  const message = open ? detail.message : undefined;

  return (
    <>
      <NavCounts counts={{ inbox: total }} alerts={{ inbox: waiting }} />
      <PageContext
        refs={
          trace && selected
            ? [{ kind: "email", id: selected, title: selected }, { kind: "run", id: runId, title: `run ${runId.slice(0, 8)}` }]
            : [{ kind: "run", id: runId, title: `run ${runId.slice(0, 8)}` }]
        }
        note={trace ? openingLine(trace) : null}
        suggestions={
          trace?.review
            ? ["Why did this need a person?", "What did the parser see?"]
            : trace
              ? ["Why do these two fields differ?", "Has this client differed before?"]
              : []
        }
      />

      <InboxList
        rows={shown}
        total={total}
        selectedId={selected}
        onSelect={select}
        view={view}
        onView={setView}
        counts={counts}
        loading={loading}
        className={open ? "hidden md:flex" : "flex"}
      />

      {trace && message ? (
        <EmailPane
          key={selected}
          trace={trace}
          message={message}
          subject={detail.subject}
          tab={tab}
          onTab={setTab}
          onChanged={detail.reread}
          onBack={() => select(null)}
        />
      ) : (
        <NothingOpen
          runId={runId}
          chosen={open}
          loading={detail.loading}
          waiting={waiting}
          onBack={() => select(null)}
          className={open ? "flex" : "hidden md:flex"}
        />
      )}
    </>
  );
}

"use client";

import { useDeferredValue, useMemo, useState } from "react";

import { ChatRail } from "@/components/email/chat-rail";
import { chatScope, openingLine } from "@/components/email/email-reading";
import { EmailPane } from "@/components/email/email-pane";
import { useEmailDetail } from "@/components/email/use-email-detail";
import { countsOf, narrow, search } from "@/components/inbox/inbox-filters";
import { InboxList } from "@/components/inbox/inbox-list";
import { needsYou } from "@/components/inbox/inbox-rows";
import { NothingOpen } from "@/components/inbox/nothing-open";
import { type InboxParams, useInboxView } from "@/components/inbox/use-inbox-view";
import { useRunInbox } from "@/components/inbox/use-run-inbox";
import { AppShell } from "@/components/shell/app-shell";
import type { RunEmailsPage } from "@/lib/api/trace-schemas";

/**
 * The run's emails and whichever one is open: the list down the left, the
 * email in the middle, and a conversation about it on the right.
 *
 * One screen, because there was never more than one. `Needs a person` was a
 * second page over the same emails with a second idea of what was selected,
 * and it is a chip on this list now. Choosing an email changes state here and
 * nothing else: no route and no server round trip.
 *
 * The two keys below are spelled differently on purpose. Both panes reset per
 * email, and giving them the same key made them two siblings of this shell
 * sharing one: React's own warning for that says children "may be duplicated",
 * and they were, which is why choosing three cases in a row used to leave
 * three case panes squeezed side by side. A key is unique among siblings, not
 * among the things it stands for.
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
    <AppShell active="inbox" runId={runId} counts={{ inbox: total }} alerts={{ inbox: waiting }}>
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
          key={`pane-${selected}`}
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

      {trace && selected ? (
        <ChatRail
          key={`chat-${selected}`}
          runId={runId}
          emailId={selected}
          scope={chatScope(trace)}
          opening={openingLine(trace)}
          suggestions={
            trace.review
              ? ["Why did this need a person?", "What did the parser see?"]
              : ["Why do these two fields differ?", "Has this client differed before?"]
          }
        />
      ) : null}
    </AppShell>
  );
}

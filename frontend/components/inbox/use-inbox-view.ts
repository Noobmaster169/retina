"use client";

import { useCallback, useEffect, useState } from "react";

import { DEFAULT_VIEW, type FilterKey, type InboxView, type SortKey } from "./inbox-filters";
import { rememberInbox } from "./inbox-memory";

/**
 * What the inbox is showing and which email is open.
 *
 * React holds it, so choosing an email repaints and nothing else happens. The
 * URL echoes it, so a screen can be handed to someone. A cookie remembers the
 * shape of it, so coming back from another destination lands where you were.
 *
 * The URL is written with `history.replaceState` and never through the router.
 * A router navigation re-renders the route on the server for something that
 * changed nothing there, and every pane on the screen has to survive that
 * round trip: the case panes that used to pile up side by side were this.
 *
 * Nothing is restored here. The server already merged the cookie into what the
 * address bar said and handed the answer down as `params`, so this hook starts
 * where the screen starts and never has a second opinion about it.
 */

/** The opening screen, as the server settled it. */
export interface InboxParams {
  filter?: FilterKey;
  sort?: SortKey;
  q?: string;
  email?: string;
}

export interface InboxState {
  view: InboxView;
  setView: (next: Partial<InboxView>) => void;
  selected: string | null;
  select: (emailId: string | null) => void;
}

export function useInboxView(runId: string, params: InboxParams): InboxState {
  const [view, setWholeView] = useState<InboxView>({
    filter: params.filter ?? DEFAULT_VIEW.filter,
    sort: params.sort ?? DEFAULT_VIEW.sort,
    query: params.q ?? DEFAULT_VIEW.query,
  });
  const [selected, setSelected] = useState<string | null>(params.email ?? null);

  useEffect(() => {
    window.history.replaceState(null, "", urlFor(view, selected));
  }, [selected, view]);

  // Not the search text, and so not `view`: see inbox-memory.ts.
  useEffect(() => {
    rememberInbox({ runId, filter: view.filter, sort: view.sort, email: selected });
  }, [runId, selected, view.filter, view.sort]);

  const setView = useCallback((next: Partial<InboxView>) => setWholeView((was) => ({ ...was, ...next })), []);
  const select = useCallback((emailId: string | null) => setSelected(emailId), []);

  return { view, setView, selected, select };
}

/** Only what differs from the default reaches the address bar, so a plain inbox has a plain URL. */
function urlFor(view: InboxView, selected: string | null): string {
  const params = new URLSearchParams();
  if (selected) params.set("email", selected);
  if (view.filter !== DEFAULT_VIEW.filter) params.set("filter", view.filter);
  if (view.sort !== DEFAULT_VIEW.sort) params.set("sort", view.sort);
  if (view.query) params.set("q", view.query);
  const query = params.toString();
  return query ? `${window.location.pathname}?${query}` : window.location.pathname;
}

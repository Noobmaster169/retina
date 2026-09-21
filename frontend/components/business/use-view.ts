"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useSyncExternalStore } from "react";

/**
 * Which view a list is in. In the URL, so a link carries it; remembered per
 * list in local storage, so a person who prefers the table gets the table.
 * The URL wins when it says; otherwise what was remembered; otherwise the
 * list's first view.
 */

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

export function useView<V extends string>(listKey: string, views: readonly V[]): [V, (next: V) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const storageKey = `retina.view.${listKey}`;
  const known = (value: string | null): value is V => value !== null && (views as readonly string[]).includes(value);

  const remembered = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return window.localStorage.getItem(storageKey);
      } catch {
        return null;
      }
    },
    () => null,
  );
  const asked = params.get("view");
  const current: V = known(asked) ? asked : known(remembered) ? remembered : views[0];

  const set = useCallback(
    (next: V) => {
      try {
        window.localStorage.setItem(storageKey, next);
      } catch {
        // Nothing to remember in; the URL still carries it.
      }
      const search = new URLSearchParams(params.toString());
      search.set("view", next);
      router.replace(`${pathname}?${search.toString()}`, { scroll: false });
    },
    [params, pathname, router, storageKey],
  );

  return [current, set];
}

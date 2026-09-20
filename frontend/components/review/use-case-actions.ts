"use client";

import { useState } from "react";

import { useToast } from "@/components/ui/toast";
import type { ReviewActionResult } from "@/lib/api/review-schemas";
import { ReviewActionResult as Result } from "@/lib/api/review-schemas";

/**
 * Every write a person makes against a case, in one place, because the action
 * bar and the comparison row both offer them and neither should own the fetch.
 *
 * The refusals matter as much as the successes. The api says why a case is not
 * in a state for an action and what a file is wrong about; this relays that
 * wording rather than inventing a second one.
 */

/** What a caller sends. `kind` and the fields it needs; the actor is added here. */
export type ActionInput =
  | { kind: "confirm"; note?: string }
  | { kind: "correct_field"; field: string; side: "SI" | "BL"; value: string; note?: string }
  | { kind: "reclassify"; category: string; note?: string }
  | { kind: "note"; note: string }
  | { kind: "retry"; note?: string }
  | { kind: "reopen"; note: string };

export interface CaseActions {
  /** The kind in flight, or null. Two writes at once would race the rerun they set off. */
  pending: string | null;
  act(input: ActionInput): Promise<ReviewActionResult | null>;
  upload(file: File, role: "SI" | "BL", note?: string): Promise<ReviewActionResult | null>;
}

/** What a rerun means for the person watching, so the receipt says more than "written". */
const REQUEUED: Record<string, string> = {
  classify: "Sorting it again. The case closes when the rerun settles it.",
  compare: "Checking it again. The case closes when the rerun settles it.",
};

export function useCaseActions(caseId: string | null, actor: string, onChanged: () => void): CaseActions {
  const [pending, setPending] = useState<string | null>(null);
  const toast = useToast();

  async function send(kind: string, url: string, init: RequestInit): Promise<ReviewActionResult | null> {
    if (!caseId) return null;
    setPending(kind);
    try {
      const response = await fetch(url, init);
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message = typeof body === "object" && body !== null && "error" in body ? String(body.error) : `Request failed with ${response.status}`;
        toast.refuse(message);
        return null;
      }
      const parsed = Result.safeParse(body);
      if (!parsed.success) {
        toast.refuse("The server answered something this page does not understand.");
        return null;
      }
      toast.say(parsed.data.wrote, parsed.data.requeued ? REQUEUED[parsed.data.requeued] : undefined);
      onChanged();
      return parsed.data;
    } catch (error) {
      console.error(`[review] ${kind} failed:`, error);
      toast.refuse("Could not reach the server.");
      return null;
    } finally {
      setPending(null);
    }
  }

  return {
    pending,
    act: (input) =>
      send(input.kind, `/api/review/${caseId}/actions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...input, actor }),
      }),
    upload: (file, role, note) => {
      const form = new FormData();
      form.set("file", file);
      form.set("role", role);
      form.set("actor", actor);
      if (note) form.set("note", note);
      return send("upload", `/api/review/${caseId}/upload`, { method: "POST", body: form });
    },
  };
}

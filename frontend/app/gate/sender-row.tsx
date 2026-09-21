"use client";

import { useState } from "react";

import { useToast } from "@/components/ui/toast";
import type { GatePolicy, GateSenderRow as Sender } from "@/lib/api/gate-schemas";

import { POLICIES, pressure, STANDING_LABEL, standingReason } from "./wording";

/**
 * One sender, what it has earned, and the one decision a person may make.
 *
 * The standing is shown with the reason it has that standing, because the
 * whole argument for this design is that a person can check the arithmetic. A
 * row that said only "New" would be a score.
 *
 * The control writes on change, like the clients page: a policy is one choice
 * and a save button would only put a step between the decision and the gate
 * acting on it.
 */

interface Props {
  sender: Sender;
  onSaved: () => void;
}

export function SenderRow({ sender, onSaved }: Props) {
  const toast = useToast();
  const [pending, setPending] = useState(false);

  async function write(policy: GatePolicy) {
    setPending(true);
    try {
      const response = await fetch(`/api/gate/senders/${encodeURIComponent(sender.principal)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scope: sender.scope, policy }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        toast.refuse(body?.error ?? "That could not be saved.");
        return;
      }
      toast.say(said(sender.principal, policy), "It applies to the next email, not to one already queued.");
      onSaved();
    } catch (error) {
      console.error("[gate] saving a policy failed:", error);
      toast.refuse("The backend is not reachable right now.");
    } finally {
      setPending(false);
    }
  }

  const used = pressure(sender.unitsToday, sender.dailyCap);

  return (
    <tr className="border-b border-hairline last:border-b-0">
      <td className="py-2.5 pr-4 align-middle">
        <div className="truncate font-mono text-mono-sm text-ink">{sender.principal}</div>
        <div className="text-caption text-ink-tertiary">{sender.scope === "address" ? "one mailbox" : "a whole domain"}</div>
      </td>

      <td className="py-2.5 pr-4 align-middle">
        <div className="text-strong text-ink">{STANDING_LABEL[sender.standing]}</div>
        <div className="text-caption text-ink-tertiary">{standingReason(sender)}</div>
      </td>

      <td className="py-2.5 pr-4 align-middle">
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-24 shrink-0 rounded-full bg-hairline">
            <div className={`h-full rounded-full ${used >= 1 ? "bg-fault" : used >= 0.8 ? "bg-differ" : "bg-ink"}`} style={{ width: `${used * 100}%` }} />
          </div>
          <span className="font-mono text-mono-xs text-ink-secondary">
            {sender.unitsToday}/{sender.dailyCap}
          </span>
        </div>
        <div className="text-caption text-ink-tertiary">{sender.emailsToday} today, {sender.burstCapacity} units at once</div>
      </td>

      <td className="py-2.5 pr-4 text-right align-middle font-mono text-mono-sm text-ink-secondary">{sender.heldEver}</td>

      <td className="py-2.5 align-middle">
        <select
          aria-label={`What to do with ${sender.principal}`}
          value={sender.policy}
          disabled={pending}
          onChange={(event) => void write(event.target.value as GatePolicy)}
          className="h-8 w-full rounded-md border border-hairline-strong bg-canvas px-2 text-strong text-ink transition-colors duration-150 hover:border-ink disabled:cursor-not-allowed disabled:opacity-50"
        >
          {POLICIES.map((option) => (
            <option key={option.policy} value={option.policy}>
              {option.label}
            </option>
          ))}
        </select>
      </td>
    </tr>
  );
}

function said(principal: string, policy: GatePolicy): string {
  if (policy === "block") return `${principal} will be held from now on.`;
  if (policy === "allow") return `${principal} will always be let through.`;
  return `${principal} is judged on its record again.`;
}

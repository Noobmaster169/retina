"use client";

import { useState } from "react";

import { useToast } from "@/components/ui/toast";
import type { ClientKind, ClientRow as Client } from "@/lib/api/clients-schemas";

import { KINDS, TIERS } from "./tiers";

/**
 * One sender, and the two things a person may decide about it.
 *
 * Both controls write on change. There is no save button because there is
 * nothing to compose: a tier is one choice, and asking someone to confirm it
 * would only add a step between the decision and the queue acting on it.
 *
 * `spam` is in the kind list and means nothing to the pipeline. It is a note a
 * person leaves about a sender. No category is decided here, by this row or by
 * anything that reads it.
 */

interface Props {
  client: Client;
  onSaved: () => void;
}

export function ClientRow({ client, onSaved }: Props) {
  const toast = useToast();
  const [pending, setPending] = useState(false);

  async function write(patch: { tier?: number; kind?: ClientKind }, said: string) {
    setPending(true);
    try {
      const response = await fetch(`/api/clients/${encodeURIComponent(client.domain)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        toast.refuse(body?.error ?? "That could not be saved.");
        return;
      }
      toast.say(said, "Emails already queued keep the tier they came in at.");
      onSaved();
    } catch (error) {
      console.error("[clients] saving a client failed:", error);
      toast.refuse("The backend is not reachable right now.");
    } finally {
      setPending(false);
    }
  }

  const label = TIERS.find((one) => one.tier === client.tier)?.label ?? "Normal";

  return (
    <tr className="border-b border-hairline last:border-b-0">
      <td className="py-2.5 pr-4 align-middle">
        <div className="font-mono text-mono-sm text-ink">{client.domain}</div>
        {client.name ? <div className="text-caption text-ink-tertiary">{client.name}</div> : null}
      </td>

      <td className="py-2.5 pr-4 align-middle">
        <Select
          label={`Tier for ${client.domain}`}
          value={String(client.tier)}
          disabled={pending}
          onChange={(value) => void write({ tier: Number(value) }, `${client.domain} is served ${labelFor(value)}.`)}
          options={TIERS.map((one) => ({ value: String(one.tier), label: one.label }))}
        />
      </td>

      <td className="py-2.5 pr-4 align-middle">
        <Select
          label={`Kind for ${client.domain}`}
          value={client.kind}
          disabled={pending}
          onChange={(value) => void write({ kind: value as ClientKind }, `${client.domain} is labelled ${value}.`)}
          options={KINDS.map((kind) => ({ value: kind, label: kind }))}
        />
      </td>

      <td className="py-2.5 pr-4 text-right align-middle font-mono text-mono-sm text-ink-secondary">{client.emails}</td>
      <td className="py-2.5 pr-4 text-right align-middle font-mono text-mono-sm text-ink-secondary">
        {client.mismatches}
      </td>

      <td className="py-2.5 align-middle text-caption text-ink-tertiary">
        {client.known ? "" : `Nobody has ranked this sender. ${label} is the default.`}
      </td>
    </tr>
  );
}

function labelFor(tier: string): string {
  return (TIERS.find((one) => one.tier === Number(tier))?.label ?? "Normal").toLowerCase();
}

/** The same control as `Field` on the run list, without its stacked caption: the column heading already says what it is. */
function Select({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      className="h-8 w-full rounded-md border border-hairline-strong bg-canvas px-2 text-strong text-ink transition-colors duration-150 hover:border-ink disabled:cursor-not-allowed disabled:opacity-50"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

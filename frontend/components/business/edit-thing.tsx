"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import type { EntityKind } from "@/lib/api/semantic-schemas";

import { changedAttributes, EDIT_FIELDS } from "./edit-fields";

/** There are no accounts in this build; a reviewer types their name once. This is the editor's. */
const ACTOR = "the reviewer";

/**
 * The form a person corrects a thing with: its name and its attributes.
 * Each write goes to the backend as the person made it and the page reloads
 * its data, so what is shown is what was stored, never what was typed.
 */
export function EditThing({ kind, id, name, attributes }: { kind: EntityKind; id: string; name: string; attributes: Record<string, string | null> }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [draftName, setDraftName] = useState(name);
  const [draft, setDraft] = useState<Record<string, string>>(() => Object.fromEntries(EDIT_FIELDS[kind].map((f) => [f.key, attributes[f.key] ?? ""])));
  const [busy, setBusy] = useState(false);

  async function save(): Promise<void> {
    setBusy(true);
    try {
      const changes = changedAttributes(attributes, draft);
      if (Object.keys(changes).length > 0) {
        const response = await fetch(`/api/ontology/${kind}/${encodeURIComponent(id)}/attributes`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ actor: ACTOR, attributes: changes }),
        });
        if (!response.ok) {
          toast.refuse(((await response.json().catch(() => ({}))) as { error?: string }).error ?? "The edit was refused.");
          return;
        }
      }
      if (draftName.trim() !== name && draftName.trim() !== "") {
        const response = await fetch(`/api/ontology/${kind}/${encodeURIComponent(id)}/rename`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ actor: ACTOR, name: draftName.trim() }),
        });
        if (!response.ok) {
          toast.refuse(((await response.json().catch(() => ({}))) as { error?: string }).error ?? "The rename was refused.");
          return;
        }
      }
      toast.say("Saved", `${Object.keys(changes).length} attribute${Object.keys(changes).length === 1 ? "" : "s"}${draftName.trim() !== name ? " and the name" : ""}`);
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} className="h-8">
        <Icon name="field" size={12} />
        Edit
      </Button>
      <Modal open={open} onOpenChange={setOpen} title={`Edit ${name}`} note="What you set here outranks what the model or the reference list wrote.">
        <form
          className="space-y-3 p-5"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <label className="block">
            <span className="text-caption text-ink-tertiary">Name</span>
            <input value={draftName} onChange={(e) => setDraftName(e.target.value)} className="mt-1 h-9 w-full rounded-md border border-hairline bg-canvas px-2.5 text-strong text-ink" />
          </label>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {EDIT_FIELDS[kind].map((field) => (
              <label key={field.key} className="block">
                <span className="text-caption text-ink-tertiary">
                  {field.label}
                  {field.hint ? <span className="text-ink-faint"> · {field.hint}</span> : null}
                </span>
                <input
                  value={draft[field.key] ?? ""}
                  onChange={(e) => setDraft((was) => ({ ...was, [field.key]: e.target.value }))}
                  className="mt-1 h-9 w-full rounded-md border border-hairline bg-canvas px-2.5 text-strong text-ink"
                />
              </label>
            ))}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button onClick={() => setOpen(false)} variant="quiet" disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? "Saving" : "Save"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/chip";
import type { ReviewCaseView } from "@/lib/api/trace-schemas";
import { panel } from "@/lib/motion";

import { FIELD, ReclassifyPanel, UploadPanel } from "./action-panels";
import type { CaseActions } from "./use-case-actions";

/**
 * What a control needs beyond a click, asked above the bar rather than over
 * the case. The case stays on screen while it is answered, which is the same
 * rule that keeps a correction on its comparison row.
 */

export type Armed = "note" | "reclassify" | "upload" | "name" | null;

interface ActionStripProps {
  armed: Armed;
  onClose: () => void;
  actions: CaseActions;
  review: ReviewCaseView;
  /** What is kept against every write. Asked here at the first one rather than as a prompt on arrival. */
  actor: string;
  onName: (name: string) => void;
}

export function ActionStrip({ armed, onClose, actions, review, actor, onName }: ActionStripProps) {
  return (
    <AnimatePresence initial={false}>
      {armed ? (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={panel}
          className="overflow-hidden border-t border-hairline-faint bg-surface"
        >
          <div className="px-6 py-3">
            {armed === "note" ? <NotePanel actions={actions} review={review} onClose={onClose} /> : null}
            {armed === "reclassify" ? <ReclassifyPanel actions={actions} onClose={onClose} /> : null}
            {armed === "upload" ? <UploadPanel actions={actions} onClose={onClose} /> : null}
            {armed === "name" ? <NamePanel actor={actor} onName={onName} onClose={onClose} /> : null}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/**
 * A note, and on a settled case the way back into it. Reopening needs a reason
 * in the api, so the one field serves both and the buttons say which it is for.
 */
function NotePanel({ actions, review, onClose }: { actions: CaseActions; review: ReviewCaseView; onClose: () => void }) {
  const [note, setNote] = useState("");
  const done = () => {
    setNote("");
    onClose();
  };
  return (
    <div>
      <Label>What should be remembered about this email</Label>
      <textarea
        autoFocus
        rows={2}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="A rule rather than a fix reads best here: the next draft of a lesson is written from these."
        className={`mt-1.5 block w-full resize-none py-2 leading-5 ${FIELD} h-auto`}
      />
      <div className="mt-2 flex items-center gap-2">
        <Button
          variant="primary"
          disabled={!note.trim() || actions.pending !== null}
          onClick={() => void actions.act({ kind: "note", note }).then(done)}
        >
          Keep the note
        </Button>
        {review.status === "resolved" ? (
          <Button
            variant="secondary"
            disabled={!note.trim() || actions.pending !== null}
            onClick={() => void actions.act({ kind: "reopen", note }).then(done)}
          >
            Put the case back
          </Button>
        ) : null}
        <Button variant="quiet" onClick={onClose}>
          Cancel
        </Button>
        <span className="grow" />
        <span className="text-caption text-ink-tertiary">A note changes no verdict.</span>
      </div>
    </div>
  );
}

/**
 * Who is writing. There are no accounts in this build and the api requires a
 * name on every action, because a correction nobody signed is not an example
 * phase 11 can learn from. It is kept in this browser and asked for once.
 */
function NamePanel({ actor, onName, onClose }: { actor: string; onName: (name: string) => void; onClose: () => void }) {
  const [name, setName] = useState(actor);
  const keep = () => {
    if (!name.trim()) return;
    onName(name.trim());
    onClose();
  };
  return (
    <div>
      <Label>Your name, kept on this browser and put on everything you record</Label>
      <div className="mt-1.5 flex items-center gap-2">
        <input
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && keep()}
          placeholder="Who is reviewing"
          className={`${FIELD} w-[240px]`}
        />
        <Button variant="primary" disabled={!name.trim()} onClick={keep}>
          Keep it
        </Button>
        <Button variant="quiet" onClick={onClose}>
          Cancel
        </Button>
        <span className="grow" />
        <span className="text-caption text-ink-tertiary">Then press the action again.</span>
      </div>
    </div>
  );
}

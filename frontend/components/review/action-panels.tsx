"use client";

import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/chip";
import { Category } from "@/lib/api/trace-schemas";

import type { CaseActions } from "./use-case-actions";

/**
 * The panel that needs a choice made before it writes: what the email actually
 * is. It opens above the action bar rather than over the case, so what is
 * being corrected stays on screen.
 *
 * A person no longer supplies a replacement file from here. A file that could
 * not be used is answered by a draft to the sender.
 */

/** The one input surface in the review panels. A field is a hairline and ink, never a filled box. */
export const FIELD = "h-[34px] min-w-0 rounded-md border border-hairline-strong bg-canvas px-2.5 text-strong text-ink outline-none focus-visible:border-ink";

/** The organisers' five categories, verbatim. Nothing here may add a sixth. */
export function ReclassifyPanel({ actions, onClose }: { actions: CaseActions; onClose: () => void }) {
  const [category, setCategory] = useState<string>(Category.options[0]);
  return (
    <div>
      <Label>What this email actually is</Label>
      <div className="mt-1.5 flex items-center gap-2">
        <select value={category} onChange={(event) => setCategory(event.target.value)} className={`${FIELD} font-mono text-mono-sm`}>
          {Category.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <Button
          variant="primary"
          disabled={actions.pending !== null}
          onClick={() => void actions.act({ kind: "reclassify", category }).then(onClose)}
        >
          Record it
        </Button>
        <Button variant="quiet" onClick={onClose}>
          Cancel
        </Button>
        <span className="grow" />
        <span className="max-w-[46ch] text-caption text-ink-tertiary">
          A comparison request goes back through the check. Anything else has no pair, and the case closes.
        </span>
      </div>
    </div>
  );
}

/**
 * Kept, and no longer opened. The product used to let a person drop a
 * replacement shipping instruction or bill of lading onto the case. That ask
 * now goes to the original sender as a draft.
 */
export function UploadPanel({ actions, onClose }: { actions: CaseActions; onClose: () => void }) {
  const [role, setRole] = useState<"SI" | "BL">("BL");
  const [file, setFile] = useState<File | null>(null);
  const input = useRef<HTMLInputElement>(null);
  return (
    <div>
      <Label>A copy Retina can read</Label>
      <div className="mt-1.5 flex items-center gap-2">
        <select value={role} onChange={(event) => setRole(event.target.value as "SI" | "BL")} className={`${FIELD} font-mono text-mono-sm`}>
          <option value="SI">SI</option>
          <option value="BL">BL</option>
        </select>
        <input
          ref={input}
          type="file"
          accept=".pdf,.docx,.xlsx,.txt"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          className="hidden"
        />
        <Button variant="secondary" onClick={() => input.current?.click()}>
          {file ? file.name : "Choose a file"}
        </Button>
        <Button
          variant="primary"
          disabled={!file || actions.pending !== null}
          onClick={() => file && void actions.upload(file, role).then(onClose)}
        >
          {actions.pending === "upload" ? "Sending it" : "Use this one"}
        </Button>
        <Button variant="quiet" onClick={onClose}>
          Cancel
        </Button>
        <span className="grow" />
        <span className="text-caption text-ink-tertiary">txt, pdf, docx or xlsx, up to 20 MB.</span>
      </div>
    </div>
  );
}

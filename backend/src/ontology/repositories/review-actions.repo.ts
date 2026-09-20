import type { ComparisonField, ExtractionSide, ReviewActionKind, ReviewActionView } from "../../contracts";
import type { Queryable } from "../../db";

/**
 * Every write a person made against a case, append only. This table is the raw
 * material for phase 11's lesson drafting, so nothing here is ever updated or
 * deleted: a correction that was later reopened is two rows, not one changed one.
 */

export interface NewReviewAction {
  reviewCaseId: string;
  emailRunId: string;
  kind: ReviewActionKind;
  field?: ComparisonField | null;
  side?: ExtractionSide | null;
  oldValue?: string | null;
  newValue?: string | null;
  note?: string | null;
  actor: string;
}

interface ActionRow {
  id: string;
  kind: ReviewActionKind;
  field: ComparisonField | null;
  side: ExtractionSide | null;
  old_value: string | null;
  new_value: string | null;
  note: string | null;
  actor: string;
  created_at: Date;
}

const COLUMNS = "id, kind, field, side, old_value, new_value, note, actor, created_at";

function toView(row: ActionRow): ReviewActionView {
  return {
    id: row.id,
    kind: row.kind,
    field: row.field,
    side: row.side,
    oldValue: row.old_value,
    newValue: row.new_value,
    note: row.note,
    actor: row.actor,
    createdAt: row.created_at.toISOString(),
  };
}

export async function insert(db: Queryable, row: NewReviewAction): Promise<ReviewActionView> {
  const { rows } = await db.query<ActionRow>(
    `insert into core.review_actions
       (review_case_id, email_run_id, kind, field, side, old_value, new_value, note, actor)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     returning ${COLUMNS}`,
    [
      row.reviewCaseId,
      row.emailRunId,
      row.kind,
      row.field ?? null,
      row.side ?? null,
      row.oldValue ?? null,
      row.newValue ?? null,
      row.note ?? null,
      row.actor,
    ],
  );
  return toView(rows[0]);
}

/** One case's history, oldest first, as a history reads. */
export async function listForCase(db: Queryable, reviewCaseId: string): Promise<ReviewActionView[]> {
  const { rows } = await db.query<ActionRow>(
    `select ${COLUMNS} from core.review_actions where review_case_id = $1 order by created_at, id`,
    [reviewCaseId],
  );
  return rows.map(toView);
}

/** Every action against an email run, across its cases. The trace shows it beside the case. */
export async function listForEmailRun(db: Queryable, emailRunId: string): Promise<ReviewActionView[]> {
  const { rows } = await db.query<ActionRow>(
    `select ${COLUMNS} from core.review_actions where email_run_id = $1 order by created_at, id`,
    [emailRunId],
  );
  return rows.map(toView);
}

/**
 * Who last wrote against this case. A rerun resolves the case in the name of
 * whoever set it off, which is why the pipeline can close a case without any
 * person being present when it finishes.
 */
export async function lastActor(db: Queryable, reviewCaseId: string): Promise<string | null> {
  const { rows } = await db.query<{ actor: string }>(
    "select actor from core.review_actions where review_case_id = $1 order by created_at desc, id desc limit 1",
    [reviewCaseId],
  );
  return rows[0]?.actor ?? null;
}

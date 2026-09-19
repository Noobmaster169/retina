/**
 * The frontend's only door to the backend. Server-side only: the shared
 * secret must never reach the browser, so nothing under components/ may
 * import this — pages, route handlers and server actions do.
 *
 * One resource per file under lib/api/. Every response is parsed against a zod
 * schema mirrored by hand from the backend's contracts, so a drift fails here,
 * naming the field, instead of reaching a component as undefined.
 */

export { type ChatMessage, type ChatOutcome, type ChatRequest, type ChatResult, chat, listModels, type ModelInfo } from "./api/chat-client";
export { type Email, type EmailListQuery, type EmailPage, type EmailSummary, fetchAttachment, getEmail, listEmails } from "./api/mail-client";
export {
  cancelRun,
  createRun,
  type CreateRunInput,
  type HeadlineScores,
  type LastSubmission,
  listRuns,
  type LlmUsage,
  pauseRun,
  type QueueCounts,
  resumeRun,
  type RunAction,
  type RunOutcome,
  type RunStatus,
  type RunSummary,
  type Stage,
} from "./api/runs-client";
export { type EvalReport, getEvalReport, type ScoreboardHeadline, type SubmitOutcome, submitRun } from "./api/scoring-client";

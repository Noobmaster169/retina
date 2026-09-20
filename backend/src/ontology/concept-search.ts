import { defineConcept, judgeConcept, type LlmClient } from "../agents";
import { loadPrompt } from "../agents/prompts/registry";
import { config } from "../config";
import type { EntityKind, SemanticReading } from "../contracts";
import type { Queryable } from "../db";
import { childLogger } from "../lib/logger";
import { batches, planJudging } from "../pipeline/ontology";
import { type Concept, conceptCandidates, concepts, type StoredVerdict } from "./repositories";

const log = childLogger({ module: "concept-search" });

const DEFINE_PROMPT = "v1";
const JUDGE_PROMPT = "v1";

/**
 * A term written nowhere in the database, turned into a set of entity ids that
 * SQL can join on.
 *
 * The one shape the whole semantic layer is built to make cheap: define once,
 * judge a bounded number of profiles, keep every verdict, and say plainly how
 * much of the set was judged. An answer never looks complete when it is not.
 *
 * Used by the `find_entities` tool and by the background backfill, which is
 * the same judging with no budget and no reader waiting.
 */

export interface ConceptDeps {
  /** Read and write: the concepts, the verdicts and the llm_calls rows all land here. */
  pool: Queryable;
  llm: LlmClient;
}

export interface ConceptMatch {
  id: number;
  name: string;
  confidence: number;
  rationale: string;
}

export interface ConceptAnswer {
  reading: SemanticReading;
  matches: ConceptMatch[];
  /** The subquery the agent joins on next. It carries no string literal, so the chat's guard passes it. */
  joinSql: string;
}

export interface ConceptQuery {
  kind: EntityKind;
  /** The term as the person wrote it. */
  description: string;
  /** Ids a narrowing query already returned, or null for every thing of the kind. */
  ids: number[] | null;
  /** The reader wants the whole set, so the rest is finished in the background. */
  needComplete: boolean;
}

/** At most this many judge calls in flight at once. The batches are the parallel unit, not the things. */
const AT_ONCE = 3;

async function judgeAll(
  deps: ConceptDeps,
  definition: string,
  kind: EntityKind,
  ids: number[],
): Promise<Map<number, StoredVerdict>> {
  const prompt = loadPrompt("concept-judge", JUDGE_PROMPT, config.LLM_MODEL_CONCEPT_JUDGE);
  const verdicts = new Map<number, StoredVerdict>();
  const groups = batches(ids, config.JUDGE_BATCH);

  for (let at = 0; at < groups.length; at += AT_ONCE) {
    const running = groups.slice(at, at + AT_ONCE).map(async (group) => {
      const subjects = await conceptCandidates.subjects(deps.pool, group);
      if (subjects.length === 0) return;
      const { value } = await judgeConcept(deps, prompt, { definition, kind, subjects });
      for (const subject of subjects) {
        const answer = value[String(subject.id)];
        if (!answer) continue;
        verdicts.set(subject.id, {
          entityId: subject.id,
          verdict: answer.verdict,
          confidence: answer.confidence,
          rationale: answer.rationale,
          profileVersion: 0,
        });
      }
    });
    await Promise.all(running);
  }
  return verdicts;
}

/** Define the term, or reuse a meaning already written for it. */
async function meaningOf(deps: ConceptDeps, query: ConceptQuery) {
  const near = await concepts.near(deps.pool, query.kind, query.description);
  const prompt = loadPrompt("concept-define", DEFINE_PROMPT, config.LLM_MODEL_CONCEPT_DEFINE);
  const { value } = await defineConcept(deps, prompt, {
    phrase: query.description,
    kind: query.kind,
    existing: near.map((concept) => ({ id: concept.id, phrase: concept.phrase, definition: concept.definition })),
  });

  const reused = value.sameAs === null ? null : near.find((concept) => concept.id === value.sameAs);
  if (reused) {
    await concepts.bump(deps.pool, reused.id);
    return reused;
  }
  return concepts.create(deps.pool, {
    entityKind: query.kind,
    phrase: query.description,
    definition: value.definition,
    searchTerms: value.searchTerms,
  });
}

export async function resolveConcept(deps: ConceptDeps, query: ConceptQuery): Promise<ConceptAnswer> {
  return applyConcept(deps, await meaningOf(deps, query), query);
}

/**
 * Judges a concept already defined, which is what the background backfill
 * does: the definition is fixed and re-asking for one would spend a call to
 * risk changing the words a stored verdict was judged against.
 */
export async function continueConcept(deps: ConceptDeps, concept: Concept): Promise<ConceptAnswer> {
  return applyConcept(deps, concept, { kind: concept.entityKind, description: concept.phrase, ids: null, needComplete: false });
}

async function applyConcept(deps: ConceptDeps, concept: Concept, query: ConceptQuery): Promise<ConceptAnswer> {
  const candidates = await conceptCandidates.ranked(deps.pool, query.kind, concept.searchTerms, query.ids, config.CANDIDATE_CAP);
  const held = await concepts.verdictsFor(deps.pool, concept.id, candidates.map((candidate) => candidate.entityId));
  const plan = planJudging(candidates, held, config.JUDGE_BUDGET);

  const fresh = await judgeAll(deps, concept.definition, query.kind, plan.judgeNow);
  const versions = new Map(candidates.map((candidate) => [candidate.entityId, candidate.profileVersion]));
  const written = [...fresh.values()].map((verdict) => ({ ...verdict, profileVersion: versions.get(verdict.entityId) ?? 0 }));
  if (written.length > 0) await concepts.saveVerdicts(deps.pool, concept.id, written);

  // A concept asked twice, or asked for a total, is worth finishing in the
  // background. A one-off phrase costs one budget and stops.
  if (plan.deferred.length > 0 && (query.needComplete || concept.askedCount > 1)) {
    await concepts.wantBackfill(deps.pool, concept.id);
  }

  const known = new Map<number, StoredVerdict>([...held.map((verdict) => [verdict.entityId, verdict] as const), ...fresh]);
  const matches = await namesOf(deps, [...known.values()].filter((verdict) => verdict.verdict === "yes"));
  const unknown = [...known.values()].filter((verdict) => verdict.verdict === "unknown").length;

  log.info(
    { conceptId: concept.id, phrase: concept.phrase, judged: plan.judgeNow.length, reused: plan.reuse.length, deferred: plan.deferred.length },
    "answered a concept",
  );

  return {
    reading: {
      conceptId: concept.id,
      phrase: concept.phrase,
      definition: concept.definition,
      entityKind: query.kind,
      matched: matches.length,
      judged: plan.judgeNow.length,
      reused: plan.reuse.length,
      unknown,
      deferred: plan.deferred.length,
      complete: plan.deferred.length === 0,
    },
    matches,
    joinSql: `select entity_id from core.concept_verdicts where concept_id = ${concept.id} and matched`,
  };
}

async function namesOf(deps: ConceptDeps, verdicts: StoredVerdict[]): Promise<ConceptMatch[]> {
  const subjects = await conceptCandidates.subjects(deps.pool, verdicts.map((verdict) => verdict.entityId));
  const names = new Map(subjects.map((subject) => [subject.id, subject.name]));
  return verdicts.map((verdict) => ({
    id: verdict.entityId,
    name: names.get(verdict.entityId) ?? String(verdict.entityId),
    confidence: verdict.confidence,
    rationale: verdict.rationale,
  }));
}

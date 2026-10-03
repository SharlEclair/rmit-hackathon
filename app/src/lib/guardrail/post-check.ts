/**
 * L5 OUTPUT POST-CHECK (`05-AI-GUARDRAILS.md` section 3.2.3).
 *
 * **Why this layer exists at all.** L1-L4 constrain the *request*; L5 constrains the *answer*.
 * A model that was correctly allowed to explain a term can still emit a code block, an evaluation
 * of the student's work, or a technology nobody mentioned. Each of those turns an allowed turn
 * into the prohibited outcome it was supposed to avoid, so a trip replaces the answer with
 * `T-REFUSE` in full -- `05` section 3.1 is explicit that there is no "answer but with a caveat".
 *
 * **Every check is deterministic**, because a post-check that needed a model would be a second
 * thing to fail open. The checks are necessarily conservative: a trip costs the student one
 * rephrase, and letting a `POST_*` answer through is the failure this whole layer exists to
 * prevent.
 *
 * **Content is not retained.** The tripped answer is kept as a sha-256 hash plus the trip id
 * (`05` section 3.2.3, `N4`); the text itself is never persisted by this layer.
 *
 * **Pure.** No I/O; `node:crypto` for the answer hash, as in `normalise.ts`.
 */

import { createHash } from 'node:crypto';

import type { NormalisedTurn } from './normalise';
import { REASON_CODES, type ReasonCode } from './reasons';
import type { GuardrailDecision } from './types';

export interface PostCheckInput {
  /** The generated answer, before persistence or display. */
  answerMarkdown: string;
  studentTurn: NormalisedTurn;
  /** The decision that allowed the answer. Its verdict must be ALLOW or ALLOW_WITH_SCOPE. */
  decision: GuardrailDecision;
  /** Chunk ids the retrieval step supplied for this turn. */
  retrievedChunkIds: readonly string[];
  /** Chunk ids the answer's citations point at. */
  citedChunkIds: readonly string[];
}

export interface PostCheckTrip {
  ruleId: 'POST_CODE' | 'POST_SOLUTION' | 'POST_UNSOURCED' | 'POST_TECH' | 'POST_EVAL' | 'POST_ECHO' | 'POST_LEAK';
  reasonCode: ReasonCode;
  /** Which cited platform rule the trip maps to (`05` section 3.2.3's "Replacement" column). */
  citedRule: string;
}

export interface PostCheckResult {
  trip: PostCheckTrip | null;
  /** sha-256 of the answer. Present only when the answer was replaced. */
  answerHash: string | null;
  /** The second decision record's rules: the original decision's ids plus the trip (`05` 3.2.3). */
  secondRecordRules: string[];
}

/** A fenced code block, or a code-shaped multi-line span, or a single strongly syntactic line. */
const CODE_FENCE = /(```|~~~)/;
// `return` alone is deliberately absent: "the endpoint will return the error envelope" is English
// prose, and a post-check that trips on it would refuse permitted explanations. A statement-ending
// semicolon, an arrow, a declaration or a query keyword are what actually distinguish code here.
const CODE_LINE = /(^\s{4,}\S)|(=>)|(\bfunction\s*\()|(\bdef\s+\w+\s*\()|(\bSELECT\b[\s\S]{0,40}\bFROM\b)|(;\s*$)/m;

/** An imperative sentence naming an assessed artefact ("Add a validation layer to the endpoint"). */
const SOLUTION_IMPERATIVE =
  /\b(add|use|create|implement|write|build|replace|remove|insert|configure|update|change|set|call|store|validate|wrap|extend)\b[^.!?]{0,60}\b(function|class|method|query|endpoint|api|schema|table|column|index|field|validation|queue|cache|timeout|parameter|variable|dictionary|array|loop)\b/i;

/** Evaluative language about the student's work (`P4`). */
const EVAL_LANGUAGE =
  /\b(your (approach|code|design|draft|solution|implementation|report|answer) (is|looks|seems)|you(?:'re| are) on the right track|this (will|should) work|your code is (fine|good|correct)|well done|good (start|job|progress)|almost there|that(?:'s| is) (correct|right))\b/i;

/** Internal vocabulary that must never reach a student (`N12`, `R11`). */
const INTERNAL_VOCABULARY =
  /\b(ALLOW_WITH_SCOPE|ESCALATE_TO_TUTOR|NEEDS_REVIEW|guardrail-v\d|promptVersion|systemPrefixId|POL_ABSENT|POL_RESTRICT|SYS_[A-Z_]+|POST_[A-Z_]+|INJ\d|DE\d+|UP\d|AMB\d|ESC\d|RET_NO_MATCH)\b/;

const VERDICT_WORDS = /\b(REFUSE|CLARIFY|ALLOW)\b/;

/** The house technology vocabulary for `POST_TECH`: a name the student did not use and no source states. */
const TECH_TERMS =
  /\b(redis|kafka|rabbitmq|graphql|grpc|postgres|postgresql|mysql|mongodb|dynamodb|docker|kubernetes|rails|django|flask|fastapi|spring|express|next\.js|react|vue|angular|svelte|typescript|webpack|vite|nginx|terraform|kinesis|sqs|sns)\b/gi;

const NUMERIC_PARAMETER = /\b\d+(\.\d+)?\s*(ms|milliseconds|seconds|s|minutes|retries|attempts|tries|threads|connections)\b/gi;

function hash(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** Token window of 13 words, which is `05` section 3.2.3's "longer than 12 tokens". */
function repeatedSpanFromStudent(answer: string, turn: NormalisedTurn): boolean {
  const words = turn.match.split(/\s+/).filter((word) => word.length > 0);
  if (words.length < 13) return false;
  const answerText = answer.toLowerCase();
  for (let i = 0; i + 13 <= words.length; i += 1) {
    const window = words.slice(i, i + 13).join(' ');
    if (answerText.includes(window)) return true;
  }
  return false;
}

function unsourcedAssertion(input: PostCheckInput): boolean {
  // A general terminology answer (`A5`) is the one permitted zero-citation shape, and it must say
  // so (`05` section 5.1 rule 2). Every other allowed answer that is about the assignment carries
  // a citation, and a citation that was not retrieved is unsourced by definition.
  const citesOutsideRetrieved = input.citedChunkIds.some(
    (id) => !input.retrievedChunkIds.includes(id),
  );
  if (citesOutsideRetrieved) return true;

  const isGeneralExplanation = input.decision.rules.includes('A5');
  if (isGeneralExplanation) return false;

  return input.citedChunkIds.length === 0;
}

function introducesUnnamedTechnology(answer: string, turn: NormalisedTurn, chunks: readonly string[]): boolean {
  const studentText = turn.match;
  const sourceText = chunks.join(' ').toLowerCase();

  for (const match of answer.matchAll(TECH_TERMS)) {
    const term = match[0].toLowerCase();
    if (studentText.includes(term)) continue;
    if (sourceText.includes(term)) continue;
    return true;
  }
  for (const match of answer.matchAll(NUMERIC_PARAMETER)) {
    const parameter = match[0].toLowerCase();
    if (studentText.includes(parameter)) continue;
    if (sourceText.includes(parameter)) continue;
    return true;
  }
  return false;
}

/**
 * Run every post-check in the table's order and return the first trip.
 *
 * The order is the document's, so the recorded trip id is the one a reader of the spec expects.
 */
export function runPostCheck(input: PostCheckInput, sourceChunkTexts: readonly string[] = []): PostCheckResult {
  const { answerMarkdown: answer, studentTurn: turn } = input;
  const trips: PostCheckTrip[] = [];

  if (CODE_FENCE.test(answer) || CODE_LINE.test(answer)) {
    trips.push({ ruleId: 'POST_CODE', reasonCode: REASON_CODES.CODE_GENERATION_REQUESTED, citedRule: 'P2' });
  }
  if (SOLUTION_IMPERATIVE.test(answer)) {
    trips.push({ ruleId: 'POST_SOLUTION', reasonCode: REASON_CODES.CODE_GENERATION_REQUESTED, citedRule: 'P2' });
  }
  if (unsourcedAssertion(input)) {
    trips.push({ ruleId: 'POST_UNSOURCED', reasonCode: REASON_CODES.REQUIREMENT_PARAPHRASE_REQUESTED, citedRule: 'P9' });
  }
  if (introducesUnnamedTechnology(answer, turn, sourceChunkTexts)) {
    trips.push({ ruleId: 'POST_TECH', reasonCode: REASON_CODES.DESIGN_DECISION_REQUESTED, citedRule: 'P8' });
  }
  if (EVAL_LANGUAGE.test(answer)) {
    trips.push({ ruleId: 'POST_EVAL', reasonCode: REASON_CODES.STUDENT_WORK_EVALUATION_REQUESTED, citedRule: 'P4' });
  }
  if (repeatedSpanFromStudent(answer, turn)) {
    trips.push({ ruleId: 'POST_ECHO', reasonCode: REASON_CODES.DERIVED_EFFORT_REFUSED, citedRule: 'P1' });
  }
  if (INTERNAL_VOCABULARY.test(answer) || VERDICT_WORDS.test(answer)) {
    trips.push({ ruleId: 'POST_LEAK', reasonCode: REASON_CODES.INSTRUCTION_OVERRIDE_ATTEMPTED, citedRule: 'P11' });
  }

  const trip = trips[0] ?? null;
  if (!trip) return { trip: null, answerHash: null, secondRecordRules: [...input.decision.rules] };

  return {
    trip,
    answerHash: hash(answer),
    // `05` section 3.2.3: "logged as a second decision record (the original verdict and the trip,
    // both retained)". Both are retained by keeping the original ids and appending the trip id.
    secondRecordRules: [...new Set([...input.decision.rules, trip.ruleId])],
  };
}

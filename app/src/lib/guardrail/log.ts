/**
 * Decision logging (`05-AI-GUARDRAILS.md` section 8, `N4`, `AGENTS.md` section 6.5).
 *
 * **The distinction that makes this practical: decisions are logged in full, content is logged as
 * a hash.** `05` section 8.2 forbids the student's message text, extracted upload text, code, file
 * names, tokens or the raw prompt from any field, at any log level, in any environment. So this
 * module's input type simply has no field for content: the only content-derived value it accepts
 * is `turnContentHash`. That is a type-level guarantee (`C7`, `N4`), not a review convention.
 *
 * **Table A versus Table B.** The durable audit row is `guardrail_logs` (`06` section 7.6.2) and
 * its columns are Table A; Table B is the structured application log. `05` section 8.1 says
 * promoting a Table B field into `guardrail_logs` is a decision, not an edit, so both are emitted
 * as one record here and the caller decides where each half goes. The split is preserved by
 * `POST_CHECK_TRIPS`/`dripSequenceTurnCount`/`uploadClassification`/token counts being the Table B
 * tail.
 *
 * **Pure.** No I/O: the caller owns the sink.
 */

import type { DecisionLayer, GuardrailDecision, GuardrailLogRecord, ScopeToken, UploadClassificationCode } from './types';

export interface BuildLogInput {
  decision: GuardrailDecision;
  layer: DecisionLayer;
  assignmentId: string;
  /** The assistant session id, not the student (`05` section 8.1). */
  assistantSessionId: string;
  /** Null for a pre-model refusal with no message row. */
  assistantMessageId?: string | null;
  /** 32 hex characters, the one-way subject reference of `06` section 4.7.1. */
  subjectRef: string;
  /** The only content-derived value on the row. */
  turnContentHash: string;
  /** `ai_policy_rules.id` when an approved rule was consulted; null means `POL_ABSENT` (D47). */
  policyRuleId?: string | null;
  citedTiers?: readonly string[];
  latencyMs: number;
  postCheckTrips?: readonly string[];
  dripSequenceTurnCount?: number;
  uploadClassification?: readonly UploadClassificationCode[] | null;
  tokens?: { input?: number; cachedInput?: number; output?: number };
  capability?: string;
}

/** Build the log record. Every field is either an identifier, an enum, or a hash. */
export function buildGuardrailLogRecord(input: BuildLogInput): GuardrailLogRecord {
  const decision = input.decision;
  const scope: ScopeToken | null = decision.scope ?? null;

  return {
    event: 'guardrail.decision',
    assignmentId: input.assignmentId,
    assistantSessionId: input.assistantSessionId,
    assistantMessageId: input.assistantMessageId ?? null,
    subjectRef: input.subjectRef,
    turnContentHash: input.turnContentHash,
    capability: input.capability ?? 'student_assistant',
    verdict: decision.verdict,
    reasonCode: decision.reasonCode,
    rules: [...decision.rules],
    deterministic: decision.deterministic,
    layer: input.layer,
    scope,
    policyRuleId: input.policyRuleId ?? null,
    citedTiers: [...(input.citedTiers ?? [])],
    promptVersion: decision.promptVersion,
    modelId: decision.modelId ?? null,
    latencyMs: input.latencyMs,
    inputTokens: input.tokens?.input ?? 0,
    cachedInputTokens: input.tokens?.cachedInput ?? 0,
    outputTokens: input.tokens?.output ?? 0,
    postCheckTrips: [...(input.postCheckTrips ?? [])],
    refusalTemplateId: decision.refusalTemplateId ?? null,
    dripSequenceTurnCount: input.dripSequenceTurnCount ?? 0,
    uploadClassification: input.uploadClassification ? [...input.uploadClassification] : null,
  };
}

/**
 * Fields that must never exist on a decision record or a log row, for a test to assert against.
 * Kept beside the builder so the two cannot drift: adding a content field above without adding it
 * here is a reviewable diff.
 */
export const FORBIDDEN_LOG_FIELDS: readonly string[] = [
  'turnText',
  'text',
  'body',
  'message',
  'prompt',
  'completion',
  'answer',
  'answerMarkdown',
  'extractedText',
  'fileName',
  'content',
  'code',
];

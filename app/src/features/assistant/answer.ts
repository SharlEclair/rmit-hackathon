/**
 * The assistant turn: guardrail first, then one provider call, then the post-check
 * (`06-DATA-MODEL.md` section 5.5.9, `05-AI-GUARDRAILS.md` sections 5, 7.4, 12).
 *
 * **The order is the contract, and it is why this module exists rather than living in the route.**
 *
 * ```text
 * (a) published policy rows             -> decide() as { kind: 'rows' }  (L2 reads PUBLISHED only)
 * (b) decide()                          -> picker, L2, L1, L3, L4
 * (c) !mayGenerate(verdict)             -> ZERO provider calls, refusal returned
 * (d) one call, capability student_assistant, structured output
 * (e) runPostCheck on the generated answer -> a trip REPLACES the answer with T-REFUSE
 * (f) citations resolved against the grounding set by index -> unresolvable ones dropped
 * ```
 *
 * **Three rules a "helpful" refactor would break.**
 *
 * 1. **The post-check is consumed, never re-implemented.** `runPostCheck` runs on every generated
 *    answer; its trips are not restated here and a trip cannot be downgraded to a warning. The
 *    tripped answer survives only as `answerHash` inside the guardrail's own result.
 * 2. **A schema-invalid answer is a refusal with no retry** (`D16`, `06` section 5.5.9 rule 6). The
 *    provider is called once; a second attempt would be "retry until the model complies", which
 *    `04` section 5.7 forbids in as many words.
 * 3. **Zero provider calls for a verdict that may not generate** (`I1`). The refusal branch returns
 *    before `buildAssistantRequest` is ever reached.
 *
 * **Where `AssistantResponse` lives, and why that is reported rather than hidden.** `05` section
 * 7.4 defines the `AssistantResponse` schema the answer must satisfy, and `03-INVARIANTS.md`
 * standing agreement 12 says every structured-output schema belongs in `src/lib/llm/schema.ts`. That
 * file is frozen at Phase 2 (`docs/handoff/04-INTERFACES.md` section 6.1), contains no
 * `student_assistant` schema, and this phase may not add one there. The zod schema below is the
 * `05` section 7.4 contract declared in the feature so the feature can run, and it reuses the frozen
 * `toResponseFormat` transform rather than re-deriving the provider-subset reduction of trap T30.
 * Moving it into `schema.ts` is an interface change with a `05-ISSUES.md` row, not a code edit.
 *
 * **What this module does not do.** It opens no transaction (the route owns persistence and the
 * analytics event of trap T7), reads no database, and streams nothing. It is a function of its
 * inputs plus one injected provider, which is what lets `tests/assistant` assert call counts with no
 * network, no key and no database.
 */

import { z } from 'zod';

import type { ErrorCode } from '@/lib/api/errors';
import type { AssistantCitation, TruthTierApi } from '@/lib/api/types';
import { decide, mayGenerate } from '@/lib/guardrail';
import type { GuardrailClassifierPort } from '@/lib/guardrail/classifier';
import { buildGuardrailLogRecord } from '@/lib/guardrail/log';
import { normaliseTurn } from '@/lib/guardrail/normalise';
import { policyFromRows, type PolicyRuleRow } from '@/lib/guardrail/policy-source';
import { runPostCheck, type PostCheckTrip } from '@/lib/guardrail/post-check';
import { REASON_CODES } from '@/lib/guardrail/reasons';
import { renderDecision } from '@/lib/guardrail/templates';
import {
  SCOPE_TOKENS,
  type DecisionLayer,
  type GuardrailDecision,
  type GuardrailLogRecord,
  type SessionState,
} from '@/lib/guardrail/types';
import { assembleMessages, renderStableJson } from '@/lib/llm/prompt';
import { toResponseFormat } from '@/lib/llm/schema';
import type { LlmProvider, LlmRequest, LlmResponse, LlmResponseFormat } from '@/lib/llm/types';

import type { VisiblePolicyRule } from '@/lib/db/queries/student-visibility';
import {
  groundingAsSourceChunks,
  groundingTiers,
  renderGrounding,
  resolveCitedRefs,
  type GroundingSet,
} from './context';

/** `<capability>-v<n>` (`05` section 5.4). The first assistant prompt is `v1`. */
export const ASSISTANT_PROMPT_VERSION = 'assistant-system-v1';

/** The stable schema name sent to the provider (`05` section 7.4's `AssistantResponse`). */
export const ASSISTANT_ANSWER_SCHEMA_NAME = 'assistant_answer_v1';

/**
 * The answer ceiling. `answerMarkdown` is capped at 2500 characters by the schema, so the ceiling
 * exists to fit thinking *plus* the JSON body (trap T32): at a `medium` thinking level the body is a
 * few hundred tokens and the thinking is the rest.
 */
export const ASSISTANT_MAX_OUTPUT_TOKENS = 4096;

export const ASSISTANT_TIMEOUT_MS = 120_000;

/** `07` section 4.7.2 rule 7 and `06` section 5.5.9: a turn is 1..4000 characters. */
export const ASSISTANT_MAX_TURN_CHARS = 4000;

/** How much uploaded-extraction text one turn may carry (`05` section 5.2: student input). */
export const ASSISTANT_MAX_ATTACHED_CHARS = 4000;

/** The largest number of uploads one request may attach (a turn is one question, not a folder). */
export const ASSISTANT_MAX_UPLOADS = 5;

/**
 * `toResponseFormat` is name-agnostic at runtime; only its parameter type is keyed to the frozen
 * `STRUCTURED_SCHEMAS`. See the file header: this states that once instead of duplicating trap
 * T30's provider-subset reduction.
 */
const providerResponseFormat = toResponseFormat as unknown as (
  name: string,
  schema: z.ZodType,
) => LlmResponseFormat;

/**
 * Block A of `05` section 5.3: the static platform block, identical for every request and free of
 * assignment and student content. Bumping any byte of it is a prompt-version bump (`05` S5.4).
 */
export const ASSISTANT_STATIC_PLATFORM = [
  'You are the Assignment Assistant for a university assignment. You are a study coach, not a',
  'solver. You never do the assignment for the student.',
  '',
  'Answer ONLY from the grounding chunks in the message. They are the assignment documents and the',
  'tutor-approved structure. If the chunks do not cover the question, say plainly that the',
  'assignment documents do not cover it, instead of guessing.',
  '',
  'Hard rules:',
  '1. Quote requirement and rubric wording verbatim from the chunks. Never paraphrase a requirement',
  '   and present the paraphrase as the requirement.',
  '2. Cite every assignment-specific statement with the bracketed position of the chunk you used,',
  '   for example [#2]. Report those positions in groundingChunkIds and in citations.',
  '3. Never write code, pseudocode, SQL, a query, a command, or a step-by-step implementation plan.',
  '4. Never evaluate, grade, review, correct or improve the student work, and never say whether an',
  '   approach is right or wrong.',
  '5. Never choose a technology, pattern, library, formula or design for the student.',
  '6. Never predict or estimate a mark. Grading, extensions and special consideration belong to the',
  '   student tutor.',
  '7. Explaining a general term or concept is allowed. Explaining what a rubric criterion or a',
  '   requirement asks for is allowed. Locating wording is allowed.',
  '8. Keep answerMarkdown under 2500 characters. Plain prose, no fenced code blocks.',
  '9. policyNote states the boundary you applied, in one short sentence.',
  '10. Return only the structured object the schema declares, with no extra fields.',
].join('\n');

/**
 * The request's inputs, in one object so a test can build exactly the request the pipeline sends.
 *
 * This matters for the offline path: `mockResponseKey` is a hash of the request, so a test registers
 * a fixture by building the same request (`04` section 5.8 rule 5, D90).
 */
export interface AssistantRequestInput {
  readonly assignmentId: string;
  readonly assistantSessionId: string;
  readonly modelId: string;
  readonly turnText: string;
  readonly attachedText?: readonly string[];
  readonly milestoneTitle: string | null;
  readonly policyRows: readonly VisiblePolicyRule[];
  readonly grounding: GroundingSet;
  readonly maxOutputTokens?: number;
  readonly timeoutMs?: number;
}

/** `05` section 7.4's `AssistantResponse`, field for field. */
const assistantCitationSchema = z.strictObject({
  /** The `[#N]` position the grounding block gave the chunk (`D93`). */
  chunkId: z.string().min(1).max(120),
  documentId: z.string().max(120),
  pageFrom: z.number().int().min(1),
  pageTo: z.number().int().min(1),
  quote: z.string().min(1).max(400),
});

export const assistantResponseSchema = z.strictObject({
  answerMarkdown: z.string().max(2500),
  groundingChunkIds: z.array(z.string().max(120)).max(24),
  citations: z.array(assistantCitationSchema).max(24),
  policyNote: z.string().max(240),
  scopeUsed: z.enum(SCOPE_TOKENS).nullable().optional(),
  offeredAlternatives: z.array(z.string().max(200)).max(8).optional(),
});

export type AssistantResponse = z.infer<typeof assistantResponseSchema>;

/** Block B: the published policy as data, so the prompt states the boundary the code enforced. */
export function buildPolicyBlock(input: {
  readonly assignmentId: string;
  readonly rows: readonly VisiblePolicyRule[];
}): string {
  const parsed = policyFromRows(toPolicyRuleRows(input.rows), { assignmentId: input.assignmentId });
  const allowed = parsed.status === 'POL_APPROVED' ? parsed.overlay.effectiveAllowed : [];
  const prohibited = parsed.status === 'POL_APPROVED' ? parsed.overlay.effectiveProhibited : [];

  return [
    'ASSIGNMENT AI USAGE POLICY (approved by the tutor; it can only restrict the platform floor):',
    renderStableJson([
      ['allowed', [...allowed].join(', ')],
      ['prohibited', [...prohibited].join(', ')],
    ]),
  ].join('\n');
}

/** Block D: variable content last, and the student's own turn last of all (`04` section 5.5). */
function variableBlock(input: AssistantRequestInput, composedTurn: string): string {
  const milestone =
    input.milestoneTitle === null
      ? 'CURRENT MILESTONE: none selected.'
      : `CURRENT MILESTONE: ${input.milestoneTitle}`;

  return [milestone, '', 'STUDENT TURN:', composedTurn].join('\n');
}

/**
 * Compose the turn the guardrail classifies and the model answers, including any attachment text
 * that already passed its scan.
 *
 * **Why the attachment text is part of the turn rather than a separate field.** `06` section 7.3.6
 * with `D68`/trap T16 puts extraction at upload time, so by the time a turn carries an upload the
 * extraction is terminal and the scan is `clear`. The extracted text is student input (`05` section
 * 5.2) and it must reach the same guard as a typed turn: an image containing "write my solution" is
 * refused for the same reason the typed sentence is (C6). `decide()` is given no `uploads`, because
 * extraction has already happened and re-extracting would be a second model call on the same bytes.
 */
export function composeTurnText(
  turnText: string,
  attachedText: readonly string[],
  maxAttachedChars: number = ASSISTANT_MAX_ATTACHED_CHARS,
): string {
  const trimmed = turnText.trim();
  if (attachedText.length === 0) return trimmed;

  const joined = attachedText
    .map((text) => text.trim())
    .filter((text) => text.length > 0)
    .join('\n---\n')
    .slice(0, maxAttachedChars);
  if (joined === '') return trimmed;

  return [trimmed, '', 'ATTACHED UPLOAD EXCERPTS (student input):', joined].join('\n');
}

/** Build the one request the pipeline sends. Exported so a test can register its mock fixture. */
export function buildAssistantRequest(input: AssistantRequestInput): LlmRequest {
  const composed = composeTurnText(input.turnText, input.attachedText ?? []);

  return {
    capability: 'student_assistant',
    modelId: input.modelId,
    systemPrefixId: ASSISTANT_PROMPT_VERSION,
    messages: assembleMessages({
      systemPrefixId: ASSISTANT_PROMPT_VERSION,
      staticPlatform: ASSISTANT_STATIC_PLATFORM,
      staticPolicy: buildPolicyBlock({ assignmentId: input.assignmentId, rows: input.policyRows }),
      grounding: renderGrounding(input.grounding),
      variable: variableBlock(input, composed),
    }),
    responseFormat: providerResponseFormat(ASSISTANT_ANSWER_SCHEMA_NAME, assistantResponseSchema),
    // Deterministic: a coach that answers the same permitted question differently on a retry is a
    // worse product, and `04` section 5.2 keeps classifying and answer calls at 0.
    temperature: 0,
    maxOutputTokens: input.maxOutputTokens ?? ASSISTANT_MAX_OUTPUT_TOKENS,
    timeoutMs: input.timeoutMs ?? ASSISTANT_TIMEOUT_MS,
    // The budget unit is the assistant session (`06` section 7.3.3, D92).
    sessionId: input.assistantSessionId,
  };
}

/** A `VisiblePolicyRule` in the row shape `decide()` and `policyFromRows` consume. */
export function toPolicyRuleRows(rows: readonly VisiblePolicyRule[]): PolicyRuleRow[] {
  return rows.map((row) => ({
    ruleId: row.id,
    ruleCode: row.ruleCode,
    ruleText: row.ruleText,
    effect: row.effect as PolicyRuleRow['effect'],
    appliesTo: row.appliesTo as PolicyRuleRow['appliesTo'],
    // The read that produced these rows filters `publication_status = 'PUBLISHED'`
    // (`listVisiblePolicyRules`), which is the only status `policyFromRows` acts on.
    publicationStatus: 'PUBLISHED',
    displayOrder: row.displayOrder,
  }));
}

/** The tutor-approved sentence behind a cited rule id, for the refusal that quotes it (`05` 3.3.1). */
export function policyRuleTextFor(
  rows: readonly VisiblePolicyRule[],
  policyRuleId: string | null,
): string | null {
  if (policyRuleId === null) return null;
  return rows.find((row) => row.id === policyRuleId)?.ruleText ?? null;
}

export interface AssistantTurnInput extends AssistantRequestInput {
  readonly subjectRef: string;
  readonly session: SessionState;
  readonly retrievedChunkIds: readonly string[];
  readonly classifier?: GuardrailClassifierPort | null;
  readonly classifierCallsRemaining?: number;
  /** Injected: `getLlmClient()` in the route, a counting fake or the mock in a test. */
  readonly client: LlmProvider;
}

export interface TurnUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly latencyMs: number;
}

export interface AssistantTurnSuccess {
  readonly ok: true;
  /** The guardrail's own decision, exactly as `decide()` returned it. Never rewritten. */
  readonly decision: GuardrailDecision;
  readonly layer: DecisionLayer;
  readonly logRecord: GuardrailLogRecord;
  /** The second record of `05` section 3.2.3, present only when the post-check tripped. */
  readonly postCheckLogRecord: GuardrailLogRecord | null;
  readonly classifierCalls: number;
  /**
   * The decision that governs this turn's persisted rows and its `guardrail` event. It equals
   * `decision` except when generation failed (schema or post-check), where it is the refusal that
   * replaced the answer -- which is what the client must see first (`06` 5.5.9 rule 1). A client
   * that did not receive REFUSE here would wait for tokens that will never arrive.
   */
  readonly persistedDecision: GuardrailDecision;
  /** The student-facing text: the answer for a permitted turn, the template otherwise. */
  readonly body: string;
  readonly generated: boolean;
  readonly citations: AssistantCitation[];
  readonly citedChunkIds: string[];
  readonly groundingIds: string[];
  readonly faqEntryIds: string[];
  /** The tiers the answer cited (`assistant_messages.cited_tiers`). */
  readonly citedTiers: TruthTierApi[];
  /** The tiers this turn's grounding set covered (`GuardrailEvent.citedTiers`, R4). */
  readonly evaluatedTiers: TruthTierApi[];
  readonly postCheckTrips: string[];
  readonly droppedRefs: string[];
  readonly usage: TurnUsage;
  readonly modelId: string | null;
  /** True when the answer hit the output ceiling; reported rather than silently accepted (T32). */
  readonly truncated: boolean;
  /**
   * Set when the turn must also emit the stream's `error` event. `LLM_OUTPUT_INVALID` is the only
   * member today (`06` section 5.5.9 rule 6); the turn is still persisted as a refusal.
   */
  readonly streamError: { readonly code: ErrorCode; readonly message: string } | null;
  readonly errors: string[];
}

export interface AssistantTurnFailure {
  readonly ok: false;
  /** A provider or configuration failure before any answer existed: nothing is persisted. */
  readonly code: ErrorCode;
  readonly message: string;
  readonly retryAfterSeconds?: number;
}

export type AssistantTurnResult = AssistantTurnSuccess | AssistantTurnFailure;

/**
 * Run one assistant turn.
 *
 * Returns a value in every branch: a refusal is `ok: true` with a refusal-shaped result (I4, T13),
 * and only a provider or configuration failure is `ok: false`. Nothing here writes.
 */
export async function runAssistantTurn(input: AssistantTurnInput): Promise<AssistantTurnResult> {
  const composedTurn = composeTurnText(input.turnText, input.attachedText ?? []);
  const sourceChunkTexts = input.grounding.refs.map((ref) => ref.text);
  const evaluatedTiers = groundingTiers(input.grounding);

  const decided = await decide(
    {
      turnText: composedTurn,
      assignmentId: input.assignmentId,
      assistantSessionId: input.assistantSessionId,
      subjectRef: input.subjectRef,
      policy: { kind: 'rows', rows: toPolicyRuleRows(input.policyRows) },
      sources: groundingAsSourceChunks(input.grounding),
      session: input.session,
      retrievedChunkIds: [...input.retrievedChunkIds],
      capability: 'student_assistant',
    },
    {
      classifier: input.classifier ?? null,
      classifierCallsRemaining: input.classifierCallsRemaining,
    },
  );

  const refusal: AssistantTurnSuccess = {
    ok: true,
    decision: decided.decision,
    layer: decided.layer,
    logRecord: decided.logRecord,
    postCheckLogRecord: null,
    classifierCalls: decided.classifierCalls,
    persistedDecision: decided.decision,
    body: decided.rendered,
    generated: false,
    citations: [],
    citedChunkIds: [],
    groundingIds: [],
    faqEntryIds: [],
    citedTiers: evaluatedTiers,
    evaluatedTiers,
    postCheckTrips: [],
    droppedRefs: [],
    usage: { inputTokens: 0, outputTokens: 0, latencyMs: 0 },
    modelId: decided.decision.modelId ?? null,
    truncated: false,
    streamError: null,
    errors: [...decided.errors],
  };

  /* (c) A verdict that may not generate: zero provider calls, refusal returned. */
  if (!mayGenerate(decided.decision.verdict)) return refusal;

  /* (d) exactly one call. */
  const request = buildAssistantRequest(input);
  const maxOutputTokens = input.maxOutputTokens ?? ASSISTANT_MAX_OUTPUT_TOKENS;
  let response: LlmResponse;
  try {
    response = await input.client.complete(request);
  } catch (error) {
    return classifyProviderFailure(error);
  }

  const usage: TurnUsage = {
    inputTokens: response.usage.inputTokens,
    outputTokens: response.usage.outputTokens,
    latencyMs: response.latencyMs,
  };
  const truncated = response.finishReason === 'length' || response.usage.outputTokens >= maxOutputTokens;

  /* (d, failure) A payload that is not the schema is a refusal, and there is no retry (D16). */
  const parsed = assistantResponseSchema.safeParse(response.json);
  if (!parsed.success) {
    return unusableAnswer(
      refusal,
      input,
      decided,
      usage,
      truncated,
      parsed.error.issues.slice(0, 10).map((issue) => {
        const path = issue.path.length === 0 ? '<root>' : issue.path.join('.');
        return `${path}: ${issue.message}`;
      }),
    );
  }

  /*
   * An empty answer is schema-valid and still not an answer. `06` section 7.3.4's `body` is
   * `not null`, and a stored assistant row whose body is empty is the row this phase is told never
   * to create -- so an empty answer takes the same refusal path as a malformed one rather than
   * becoming a blank turn. The safe direction is to answer nothing, not to answer emptily.
   */
  if (parsed.data.answerMarkdown.trim() === '') {
    return unusableAnswer(refusal, input, decided, usage, truncated, [
      'answerMarkdown: the model returned no answer',
    ]);
  }

  /* (f) Resolve citations against the grounding set, by index, dropping what does not resolve. */
  const citedRefs = [
    ...parsed.data.groundingChunkIds,
    ...parsed.data.citations.map((citation) => citation.chunkId),
  ];
  const resolved = resolveCitedRefs(input.grounding, citedRefs);
  const citedTiers = [...new Set(resolved.citations.map((citation) => citation.truthTier))];

  /* (e) The post-check runs on every generated answer, and a trip replaces it. */
  const postCheck = runPostCheck(
    {
      answerMarkdown: parsed.data.answerMarkdown,
      studentTurn: normaliseTurn(composedTurn),
      decision: decided.decision,
      retrievedChunkIds: [...input.retrievedChunkIds],
      citedChunkIds: resolved.citedChunkIds,
    },
    sourceChunkTexts,
  );

  if (postCheck.trip !== null) {
    const trip: PostCheckTrip = postCheck.trip;
    const tripped = postCheckRefusal(decided.decision, postCheck.secondRecordRules, trip);
    const postCheckLogRecord = buildGuardrailLogRecord({
      decision: tripped,
      layer: 'L5',
      assignmentId: input.assignmentId,
      assistantSessionId: input.assistantSessionId,
      subjectRef: input.subjectRef,
      policyRuleId: decided.logRecord.policyRuleId,
      citedTiers,
      latencyMs: response.latencyMs,
      postCheckTrips: [trip.ruleId],
      tokens: { input: usage.inputTokens, output: usage.outputTokens },
      // The only content-derived value on the row: the hash of the turn the post-check judged
      // (`05` section 8.2 -- content is logged as a hash, never as text).
      turnContentHash: normaliseTurn(composedTurn).hash,
    });

    return {
      ...refusal,
      persistedDecision: tripped,
      postCheckLogRecord,
      body: renderDecision(tripped, {
        policyRuleText: policyRuleTextFor(input.policyRows, decided.logRecord.policyRuleId),
      }),
      generated: true,
      citations: resolved.citations,
      citedChunkIds: resolved.citedChunkIds,
      groundingIds: resolved.groundingIds,
      faqEntryIds: resolved.faqEntryIds,
      citedTiers,
      postCheckTrips: [trip.ruleId],
      droppedRefs: resolved.droppedRefs,
      usage,
      truncated,
      errors: [...refusal.errors, `post-check trip ${trip.ruleId} replaced the answer`],
    };
  }

  /* A permitted answer. ALLOW_WITH_SCOPE carries its scope note on the rendered body. */
  const body =
    decided.decision.verdict === 'ALLOW_WITH_SCOPE'
      ? renderDecision(decided.decision, { answer: parsed.data.answerMarkdown })
      : parsed.data.answerMarkdown;

  return {
    ...refusal,
    body,
    generated: true,
    citations: resolved.citations,
    citedChunkIds: resolved.citedChunkIds,
    groundingIds: resolved.groundingIds,
    faqEntryIds: resolved.faqEntryIds,
    citedTiers,
    droppedRefs: resolved.droppedRefs,
    usage,
    modelId: response.modelId === '' ? input.modelId : response.modelId,
    truncated,
  };
}

/**
 * The refusal that replaces an answer the schema (or the empty-body rule) rejected.
 *
 * `06` section 5.5.9 rule 6 makes this case both a persisted refusal and a stream `error`, so the
 * result is `ok: true` with `streamError` set: the transcript keeps the refusal, and the client is
 * told the answer could not be produced.
 */
function unusableAnswer(
  base: AssistantTurnSuccess,
  input: AssistantTurnInput,
  decided: { decision: GuardrailDecision; logRecord: GuardrailLogRecord },
  usage: TurnUsage,
  truncated: boolean,
  problems: readonly string[],
): AssistantTurnSuccess {
  const refusalDecision = schemaRefusal(decided.decision);
  return {
    ...base,
    persistedDecision: refusalDecision,
    body: renderDecision(refusalDecision, {
      policyRuleText: policyRuleTextFor(input.policyRows, decided.logRecord.policyRuleId),
    }),
    generated: true,
    usage,
    truncated,
    streamError: {
      code: 'LLM_OUTPUT_INVALID',
      message: 'The Assistant could not produce a reliable answer, so it did not answer.',
    },
    errors: [...base.errors, ...problems],
  };
}

/**
 * The `SYS_SCHEMA_INVALID` refusal of `05` section 12.2, built from the decision it replaces.
 *
 * `deterministic: false` with the model id retained is deliberate: the check is code, but what it
 * judged was model output, and `05` section 8.4 rule 5 wants a non-deterministic decision
 * identifiable by its model id.
 */
function schemaRefusal(decision: GuardrailDecision): GuardrailDecision {
  return {
    verdict: 'REFUSE',
    rules: ['SYS_SCHEMA_INVALID'],
    reasonCode: REASON_CODES.SCHEMA_VALIDATION_FAILED,
    deterministic: false,
    confidence: 'high',
    scope: null,
    clarifyingQuestion: null,
    policyRef: decision.policyRef ?? null,
    refusalTemplateId: 'T-REFUSE',
    promptVersion: decision.promptVersion,
    modelId: decision.modelId ?? null,
  };
}

/**
 * The `REFUSE` that replaces a tripped answer (`05` section 3.2.3).
 *
 * Both records are retained: `rules` starts with the trip id, which is the rule that decided the
 * outcome and which selects the refusal copy class, and the original decision's ids follow it.
 */
export function postCheckRefusal(
  decision: GuardrailDecision,
  secondRecordRules: readonly string[],
  trip: Pick<PostCheckTrip, 'ruleId' | 'reasonCode'>,
): GuardrailDecision {
  return {
    verdict: 'REFUSE',
    rules: [...new Set([trip.ruleId, ...secondRecordRules])],
    reasonCode: trip.reasonCode,
    deterministic: false,
    confidence: 'high',
    scope: null,
    clarifyingQuestion: null,
    policyRef: decision.policyRef ?? null,
    refusalTemplateId: 'T-REFUSE',
    promptVersion: decision.promptVersion,
    modelId: decision.modelId ?? null,
  };
}

/**
 * Map a thrown provider failure to the route's error code, and never to an answer.
 *
 * `LLM_UNAVAILABLE` (503) and `RATE_LIMITED` (429) are the two `06` section 5.4 lists for this
 * route. The turn is not persisted for either: nothing was decided and nothing was generated, so a
 * stored refusal would tell the student they had asked something prohibited when they had not.
 */
export function classifyProviderFailure(error: unknown): AssistantTurnFailure {
  if (errorCodeOf(error) === 'BUDGET_EXCEEDED') {
    return {
      ok: false,
      code: 'RATE_LIMITED',
      message: "You have reached the Assistant's limit for now.",
      retryAfterSeconds: 60,
    };
  }
  return {
    ok: false,
    code: 'LLM_UNAVAILABLE',
    message: 'The Assistant is unavailable right now.',
  };
}

function errorCodeOf(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const record = error as { code?: unknown };
  return typeof record.code === 'string' ? record.code : null;
}

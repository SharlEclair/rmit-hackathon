/**
 * The L4 classifier adapter: the one place the guardrail reaches the provider
 * (`05-AI-GUARDRAILS.md` section 12.1, D87, `docs/handoff/04-INTERFACES.md` section 5.3).
 *
 * **Why this is a separate file and not a change to `classifier.ts`.** Phase 3 froze
 * `classifier.ts` and declared the seam as a port (`GuardrailClassifierPort`) precisely because
 * `src/lib/llm/` did not exist when it was written. Phase 5 wires the port here, which keeps the
 * frozen declaration untouched and keeps the one-file rule of section 12.1 intact in the only
 * form that is still true: **exactly one file under `src/lib/guardrail/` imports `src/lib/llm/`,
 * and it is this one.** `tests/guardrail/imports.test.ts` asserts that list, by name.
 *
 * **Validation belongs to `classifyWithModel`, and this file does not second-guess it.** The
 * provider seam returns untrusted JSON (`classifier.ts` line 51 says so). This file DOES run
 * `validateGuardrailDecision` so a malformed payload is never mistaken for a decision here, but it
 * returns the raw value when validation fails rather than throwing. Throwing would make
 * `classifyWithModel` report `SYS_MODEL_UNAVAILABLE` (a provider fault) where `05` section 12.2
 * requires `SYS_SCHEMA_INVALID` / `SCHEMA_VALIDATION_FAILED` (a schema fault). The two are
 * different failures with different causes, and collapsing them would hide a prompt bug.
 *
 * **No retry, ever.** One call, one answer, and a failure is a refusal (D16, `N3`).
 *
 * **The provider schema is a hint; the zod schema is the contract** (D91, trap T30). The request's
 * `responseFormat` is produced by the frozen `toResponseFormat`, which is what keeps the provider
 * from ever being sent a `minLength`/`minimum` keyword its subset refuses. That function's
 * signature is keyed to the frozen `STRUCTURED_SCHEMAS` names; the guardrail's own schema
 * deliberately lives in `types.ts` (section 12.1) and is not one of them, so the transform is
 * reached through the narrow adapter below rather than copied. A second copy of the
 * provider-subset reduction is exactly the drift trap T30 warns about.
 */

import { z } from 'zod';

import { getConfig } from '@/lib/config';
import { getLlmClient } from '@/lib/llm';
import { assembleMessages, renderStableJson } from '@/lib/llm/prompt';
import { toResponseFormat } from '@/lib/llm/schema';
import type { LlmProvider, LlmRequest, LlmResponseFormat } from '@/lib/llm/types';

import { GUARDRAIL_PROMPT_VERSION, type ClassifierInput, type GuardrailClassifierPort } from './classifier';
import { GuardrailDecisionSchema, validateGuardrailDecision } from './types';

/**
 * The stable schema name sent to the provider. Part of the provider-side cache key, so it must not
 * drift without a prompt-version bump.
 */
export const GUARDRAIL_DECISION_SCHEMA_NAME = 'guardrail_decision_v1';

/**
 * The output ceiling for one classification.
 *
 * The decision record is small (a verdict, rule ids, a reason code and at most one question), so
 * `04` section 5.2's classifying capability does not need the Analyst's 65,536 ceiling of trap T32.
 * It is still 4,096 rather than something tighter because thinking tokens are billed as output
 * (D73, T32) and a `high` thinking level can consume a small ceiling before the JSON is emitted.
 */
export const GUARDRAIL_MAX_OUTPUT_TOKENS = 4096;

/** One classification must not hold an assistant turn open longer than this. */
export const GUARDRAIL_TIMEOUT_MS = 60_000;

/**
 * `toResponseFormat` is name-agnostic at runtime; only its parameter type is keyed to the frozen
 * `STRUCTURED_SCHEMAS`. This adapter states that fact once instead of duplicating the transform.
 */
const providerResponseFormat = toResponseFormat as unknown as (
  name: string,
  schema: z.ZodType,
) => LlmResponseFormat;

export interface GuardrailClassifierPortDeps {
  /** Injectable so a test can drive the adapter without a provider (and without a config read). */
  readonly client?: LlmProvider;
  /** Overrides `config.llmModelReasoning`. Never a literal at a call site (`04` section 5.2). */
  readonly modelId?: string;
  /** Defaults to `GUARDRAIL_PROMPT_VERSION`, which is what `classifyWithModel` records. */
  readonly promptVersion?: string;
  readonly maxOutputTokens?: number;
  readonly timeoutMs?: number;
}

/** The model that answers a classifying call: the reasoning model, never the multimodal one. */
export function resolveGuardrailModelId(configModelReasoning: string | null): string {
  // `mock` is the offline identity of last resort (`04` section 5.8 rule 6). A misconfigured
  // provider key is already fatal in `config.ts`; this fallback exists so `LLM_PROVIDER=mock`
  // needs no model id at all.
  return configModelReasoning ?? 'mock';
}

/**
 * Block A of `05` section 5.3: the static platform block. Identical for every request in every
 * assignment, credentials-free, and containing no assignment or student content.
 *
 * Bumping the wording here is a prompt-version bump (`05` section 5.4 rule 1), and the version is
 * `GUARDRAIL_PROMPT_VERSION`, owned by the frozen `classifier.ts`.
 */
export const GUARDRAIL_STATIC_PLATFORM = [
  'You are the classification layer of an assignment assistant for university students.',
  'Classify ONE student turn against the assignment AI Usage Policy given in the next block.',
  '',
  'Return only the structured decision object. Do not answer the student, do not add prose, and do',
  'not add fields the schema does not declare.',
  '',
  'Rules:',
  '1. Cite only rule ids from these namespaces: A1-A12, P1-P16, DE1-DE15, INJ1-INJ3, POL_APPROVED,',
  '   POL_ABSENT, POL_RESTRICT, POL_INVALID, POL_SCOPE, AMB1-AMB5, ESC1-ESC4, RET_NO_MATCH, UP1-UP5,',
  '   CL1-CL6. A rule id outside those namespaces is invalid and the whole decision is discarded.',
  '2. REFUSE requires refusalTemplateId "T-REFUSE". ESCALATE_TO_TUTOR requires "T-ESCALATE".',
  '   CLARIFY requires a clarifyingQuestion. ALLOW and ALLOW_WITH_SCOPE require',
  '   refusalTemplateId null, and ALLOW_WITH_SCOPE requires a non-null scope.',
  '3. Set deterministic to false. Never claim a deterministic decision and never invent a model id.',
  '4. Prefer the more restrictive verdict when the request is ambiguous. A request to produce,',
  '   debug, evaluate, edit or choose part of the assessed work is REFUSE, never ALLOW.',
  '5. confidence is "high", "medium" or "low". A non-high confidence is treated as CLARIFY, so use',
  '   "high" only when the policy block clearly settles the verdict.',
].join('\n');

/** Block B: the approved policy for this assignment, rendered in a fixed key order (`04` 5.5). */
function policyBlock(input: ClassifierInput): string {
  return [
    'ASSIGNMENT AI USAGE POLICY (approved by the tutor):',
    renderStableJson([
      ['effectiveAllowed', input.effectiveAllowed.join(', ')],
      ['effectiveProhibited', input.effectiveProhibited.join(', ')],
      ['policyNotes', input.policyText],
    ]),
  ].join('\n');
}

/** Block D: the variable last, because nothing derived from a student turn may precede it. */
function variableBlock(input: ClassifierInput): string {
  return [
    'RESIDUAL STUDENT TURN (the deterministic layers could not decide this):',
    input.residualText,
  ].join('\n');
}

/**
 * Build the adapter.
 *
 * Construction is lazy on purpose: `getConfig()` throws when a required variable is missing, and a
 * factory that threw at import time would take the whole route module with it. A config problem
 * surfaces on the call and becomes a refusal, which is the fail-closed direction (`05` 12.2).
 */
export function createGuardrailClassifierPort(
  deps: GuardrailClassifierPortDeps = {},
): GuardrailClassifierPort {
  const promptVersion = deps.promptVersion ?? GUARDRAIL_PROMPT_VERSION;

  const modelId = (): string =>
    deps.modelId ?? resolveGuardrailModelId(getConfig().llmModelReasoning);

  return {
    capability: 'policy_guard',
    get modelId(): string {
      return modelId();
    },
    promptVersion,

    async classify(input: ClassifierInput): Promise<unknown> {
      const client = deps.client ?? getLlmClient();
      const resolvedModelId = modelId();

      const request: LlmRequest = {
        capability: 'policy_guard',
        modelId: resolvedModelId,
        // The port's own id is the `systemPrefixId`, so the audit row and the prompt-cache key
        // name the same thing (`04` section 5.5 rule 3, `05` section 8.4).
        systemPrefixId: promptVersion,
        messages: assembleMessages({
          systemPrefixId: promptVersion,
          staticPlatform: GUARDRAIL_STATIC_PLATFORM,
          staticPolicy: policyBlock(input),
          // The classifier is given no assignment chunks: it classifies the turn against the
          // policy, and grounding is the answer pipeline's concern, not the guard's.
          grounding: '',
          variable: variableBlock(input),
        }),
        responseFormat: providerResponseFormat(GUARDRAIL_DECISION_SCHEMA_NAME, GuardrailDecisionSchema),
        // Every classifying capability runs at temperature 0 (`04` section 5.2).
        temperature: 0,
        maxOutputTokens: deps.maxOutputTokens ?? GUARDRAIL_MAX_OUTPUT_TOKENS,
        timeoutMs: deps.timeoutMs ?? GUARDRAIL_TIMEOUT_MS,
        // The budget unit is the assistant session, which is what `LLM_MAX_CALLS_PER_SESSION`
        // counts and what `assistant_sessions.llm_call_count` records (`06` section 7.3.3).
        sessionId: input.assistantSessionId,
      };

      const response = await client.complete(request);
      return untrustedDecision(response.json);
    },
  };
}

/**
 * A validated decision when the payload is one, and the raw payload when it is not.
 *
 * Returning the raw value is deliberate: `classifyWithModel` runs the same validator and turns a
 * failure into `SYS_SCHEMA_INVALID` with `SCHEMA_VALIDATION_FAILED`. This function's job is only to
 * ensure that a payload which *does* satisfy the schema is not thrown away or reshaped.
 */
function untrustedDecision(json: unknown): unknown {
  const validated = validateGuardrailDecision(json);
  return validated.ok ? validated.value : json;
}

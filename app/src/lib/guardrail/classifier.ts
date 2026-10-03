/**
 * L4 MODEL CLASSIFIER (`05-AI-GUARDRAILS.md` lines 98-104 of section 3.2, sections 7.1, 7.2, 12.2).
 *
 * **This is the only file in `src/lib/guardrail/` that may reach the provider.** `05` section 12.1
 * makes that a one-file rule on purpose ("pure except for the one file decays quickly").
 *
 * **The seam is a port, and that is a Phase-ordering decision, not a preference.** `18` section
 * 5.1 makes Phases 2 and 3 file-disjoint except for one line in `src/lib/llm/types.ts`, which
 * Phase 2 owns; at the time of writing `src/lib/llm/` does not exist. So the classifier declares
 * the *shape* it needs (`GuardrailClassifierPort`) and takes it as a dependency instead of
 * importing an adapter that does not exist yet. Phase 2/5 wire the adapter to this port; the
 * signature here is frozen at Phase 3 (`docs/handoff/04-INTERFACES.md`).
 *
 * **Failure is always a refusal, and never a retry.** `N3`/D16: a response that fails schema
 * validation is `SYS_SCHEMA_INVALID`, and the confidence downgrade of section 7.2's constraint
 * table turns a low-confidence `ALLOW` into `CLARIFY`/`AMB4`. Nothing in this file can turn a
 * failure into an answer, and nothing here re-asks the model to "try again".
 */

import { REASON_CODES, type ReasonCode } from './reasons';
import { validateGuardrailDecision, type GuardrailDecision } from './types';

/** The prompt id of `05` section 5.4. Bump it whenever the classifier's prefix changes. */
export const GUARDRAIL_PROMPT_VERSION = 'guardrail-v1';

/** What the classifier is given. The student's turn is content; nothing here is logged. */
export interface ClassifierInput {
  assignmentId: string;
  assistantSessionId: string;
  /** The student's turn, verbatim. The model sees it; the log never does (`05` section 8.2). */
  turnText: string;
  /** What L1-L3 could not decide, after L0 normalisation and frame stripping. */
  residualText: string;
  effectiveAllowed: readonly string[];
  effectiveProhibited: readonly string[];
  /** The approved policy text the model is shown as block B (`05` section 5.3). */
  policyText: string;
  promptVersion: string;
}

/**
 * The provider seam. A Phase 2/5 adapter satisfies this structurally; `AiCapability` gains
 * `policy_guard` on the adapter's side (D68 added `attachment_extraction`; the enum change is
 * Phase 2's, per `18` section 5.1).
 */
export interface GuardrailClassifierPort {
  readonly capability: 'policy_guard';
  /** The configured model id, recorded on every non-deterministic decision (`05` section 8.4). */
  readonly modelId: string;
  readonly promptVersion: string;
  /** Returns untrusted JSON. Validation happens here, not in the adapter. */
  classify(input: ClassifierInput): Promise<unknown>;
}

export interface ClassifyDeps {
  classifier?: GuardrailClassifierPort | null;
  /** `LLM_MAX_CALLS_PER_SESSION`'s remaining count for this session (`05` section 3.4). */
  classifierCallsRemaining?: number;
}

export interface ClassifyResult {
  decision: GuardrailDecision;
  classifierCalls: number;
  problems: string[];
}

function refusal(rules: string[], reasonCode: ReasonCode, promptVersion: string): GuardrailDecision {
  return {
    verdict: 'REFUSE',
    rules,
    reasonCode,
    deterministic: true,
    confidence: 'high',
    scope: null,
    clarifyingQuestion: null,
    policyRef: null,
    refusalTemplateId: 'T-REFUSE',
    promptVersion,
    modelId: null,
  };
}

/**
 * Run L4. Returns a valid decision in every branch, including every failure branch.
 */
export async function classifyWithModel(
  input: ClassifierInput,
  deps: ClassifyDeps,
): Promise<ClassifyResult> {
  const promptVersion = deps.classifier?.promptVersion ?? input.promptVersion;

  if (!deps.classifier) {
    return {
      decision: refusal(['SYS_MODEL_UNAVAILABLE'], REASON_CODES.MODEL_UNAVAILABLE, promptVersion),
      classifierCalls: 0,
      problems: ['no guardrail classifier is configured'],
    };
  }

  if (typeof deps.classifierCallsRemaining === 'number' && deps.classifierCallsRemaining <= 0) {
    return {
      decision: refusal(['SYS_BUDGET_EXCEEDED'], REASON_CODES.BUDGET_EXCEEDED, promptVersion),
      classifierCalls: 0,
      problems: ['classifier budget exhausted before L4'],
    };
  }

  let raw: unknown;
  let classifierCalls = 1;
  try {
    raw = await deps.classifier.classify({ ...input, promptVersion });
  } catch (error) {
    return {
      decision: refusal(['SYS_MODEL_UNAVAILABLE'], REASON_CODES.MODEL_UNAVAILABLE, promptVersion),
      classifierCalls,
      problems: [`classifier threw: ${error instanceof Error ? error.message : String(error)}`],
    };
  }

  const validated = validateGuardrailDecision(raw);
  if (!validated.ok) {
    return {
      decision: refusal(['SYS_SCHEMA_INVALID'], REASON_CODES.SCHEMA_VALIDATION_FAILED, promptVersion),
      classifierCalls,
      problems: validated.problems,
    };
  }

  // The model's own promptVersion and modelId are not authoritative: the code knows which prefix
  // it sent and which model answered, and a model that misreports either would corrupt the very
  // provenance the decision log exists to provide.
  const decision: GuardrailDecision = {
    ...validated.value,
    promptVersion,
    deterministic: false,
    modelId: deps.classifier.modelId,
  };

  const downgraded = applyConfidenceDowngrade(decision);
  if (downgraded) {
    return {
      decision: downgraded.decision,
      classifierCalls,
      problems: downgraded.problems,
    };
  }

  return { decision, classifierCalls, problems: [] };
}

/**
 * `05` section 7.2: `confidence != "high"` with `verdict = ALLOW` is downgraded to `CLARIFY` with
 * rule `AMB4`. The clarifying question is required by the consistency table, so one is supplied:
 * a downgrade that produced an invalid `CLARIFY` would itself be a schema failure.
 */
export function applyConfidenceDowngrade(
  decision: GuardrailDecision,
): { decision: GuardrailDecision; problems: string[] } | null {
  if (decision.verdict !== 'ALLOW') return null;
  const confidence = decision.confidence ?? 'high';
  if (confidence === 'high') return null;

  return {
    decision: {
      ...decision,
      verdict: 'CLARIFY',
      rules: [...new Set([...decision.rules, 'AMB4'])],
      reasonCode: REASON_CODES.ALLOW_CONFIDENCE_TOO_LOW,
      scope: null,
      refusalTemplateId: 'T-CLARIFY',
      clarifyingQuestion:
        'I am not confident I know which part of the assignment this is about. Which requirement, milestone, or rubric criterion do you mean?',
      confidence,
    },
    problems: [`ALLOW at confidence "${confidence}" downgraded to CLARIFY (AMB4)`],
  };
}

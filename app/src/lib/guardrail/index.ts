/**
 * `decide()` -- the only public entry to the guardrail (`05-AI-GUARDRAILS.md` section 12.1).
 *
 * **The layer order and where each one is enforced.** L0 normalise, L1 deterministic rules, L2
 * policy overlay, L3 scope resolution, L4 model classifier, L5 post-check. L5 is *not* called
 * here: it runs on a generated answer, and generation belongs to the Assistant route (Phase 5).
 * `runPostCheck` is exported so that route consumes exactly this implementation rather than
 * re-deriving the trips.
 *
 * **No path from a student turn to a model call skips L1-L3.** That is the reviewer question in
 * `05` section 12.3 and the property the golden set proves for the `DET` cases: the classifier
 * port is consulted only when L1-L3 returned no outcome at all.
 *
 * **Three failure shapes, all refusals.**
 * - An unreadable or low-confidence attachment is `UP4 -> CLARIFY` (`05` section 6.4), which
 *   D69 counts as a refusal.
 * - An extraction port that *throws* is `SYS_MODEL_UNAVAILABLE`: the component failed rather than
 *   the file being unreadable, and `05` section 1.3 makes a thrown layer a refusal.
 * - Anything thrown anywhere else is caught and returned as `SYS_GUARDRAIL_ERROR`, with the throw
 *   kept in `errors` so it stays visible (`05` section 12.2: "the throw is a bug and must be
 *   visible"). A caught throw never becomes an answer.
 */

import { classifyWithModel, GUARDRAIL_PROMPT_VERSION, type GuardrailClassifierPort } from './classifier';
import { buildGuardrailLogRecord } from './log';
import { normaliseTurn } from './normalise';
import { applyPolicyOverlay, capabilityForOutcome, resolveScope } from './policy';
import {
  capabilitiesForPolicyRuleCode,
  overlayForView,
  policyFromRows,
  validatePolicyView,
  type PolicyOverlay,
  type PolicyRuleRow,
} from './policy-source';
import { REASON_CODES, type ReasonCode } from './reasons';
import { evaluateDeterministic, type RuleOutcome } from './rules';
import { renderDecision } from './templates';
import {
  mayGenerate,
  type AiUsagePolicyView,
  type DecisionLayer,
  type DeclaredUpload,
  type GuardrailDecision,
  type GuardrailLogRecord,
  type SessionState,
  type SourceChunk,
  type UploadClassification,
  type UploadClassificationCode,
} from './types';

/** O11: images, PDF and plain text ship; audio and video are refused at the picker. */
export const SUPPORTED_UPLOAD_MIME_TYPES: readonly string[] = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'application/pdf',
  'text/plain',
  'text/markdown',
];

export interface UploadExtractorPort {
  readonly capability: 'attachment_extraction';
  extract(file: DeclaredUpload): Promise<{ classification: 'UP1' | 'UP2' | 'UP3' | 'UP4'; confidence: number; text?: string }>;
}

export type PolicyInput =
  | { kind: 'rows'; rows: readonly PolicyRuleRow[]; meta?: { policyId?: string; version?: number } }
  | { kind: 'view'; view: unknown };

export interface DecideInput {
  /** The student's turn, verbatim. Never logged here beyond its hash. */
  turnText: string;
  assignmentId: string;
  assistantSessionId: string;
  /** 32 hex characters (`06` section 4.7.1). */
  subjectRef: string;
  assistantMessageId?: string | null;
  policy: PolicyInput;
  sources: readonly SourceChunk[];
  session: SessionState;
  uploads?: readonly DeclaredUpload[];
  retrievedChunkIds?: readonly string[];
  latencyMs?: number;
  capability?: string;
}

export interface DecideDeps {
  classifier?: GuardrailClassifierPort | null;
  extractor?: UploadExtractorPort | null;
  /** `LLM_MAX_CALLS_PER_SESSION`'s remaining count, checked by L4 (`05` section 3.4). */
  classifierCallsRemaining?: number;
}

export interface DecideResult {
  decision: GuardrailDecision;
  layer: DecisionLayer;
  /** The student-facing text for this decision's template. Empty for `ALLOW`. */
  rendered: string;
  logRecord: GuardrailLogRecord;
  classifierCalls: number;
  extractionCalls: number;
  uploadClassifications: UploadClassification[];
  /** True when the turn was refused before the guard ran (`05` section 6.4 rule 8). */
  pickerRefusal: boolean;
  /** `DE` ids recorded from laundering frames; never a decision on their own (`H4`). */
  frames: string[];
  /** Non-empty only when something threw or a model response failed validation. Never fatal to the caller. */
  errors: string[];
  /**
   * Policy-row notes that are not failures -- an upload-scoped rule that contributes no assistant
   * capability, for instance. Kept apart from `errors` because a valid policy that happens to
   * carry such a rule must not look like a broken one.
   */
  warnings: string[];
  /** True when L1 deliberately handed the turn to L4 (a documented reason, not a miss). */
  handedToClassifier: boolean;
}

/** Split declared uploads into what the picker accepts and what it refuses with `UP5`. */
export function gateUploads(declared: readonly DeclaredUpload[]): {
  accepted: DeclaredUpload[];
  refused: DeclaredUpload[];
} {
  const accepted: DeclaredUpload[] = [];
  const refused: DeclaredUpload[] = [];
  for (const upload of declared) {
    if (SUPPORTED_UPLOAD_MIME_TYPES.includes(upload.declaredMimeType.toLowerCase())) {
      accepted.push(upload);
    } else {
      refused.push(upload);
    }
  }
  return { accepted, refused };
}

function isPolicyView(value: unknown): value is AiUsagePolicyView {
  return typeof value === 'object' && value !== null && 'ruleRefs' in value && 'permitted' in value;
}

function refusalDecision(
  rules: string[],
  reasonCode: ReasonCode,
  promptVersion: string,
  policyRef: GuardrailDecision['policyRef'] = null,
): GuardrailDecision {
  return {
    verdict: 'REFUSE',
    rules,
    reasonCode,
    deterministic: true,
    confidence: 'high',
    scope: null,
    clarifyingQuestion: null,
    policyRef,
    refusalTemplateId: 'T-REFUSE',
    promptVersion,
    modelId: null,
  };
}

function toDecision(
  outcome: RuleOutcome,
  options: {
    deterministic: boolean;
    promptVersion: string;
    modelId: string | null;
    policyRef: GuardrailDecision['policyRef'];
  },
): GuardrailDecision {
  const template =
    outcome.verdict === 'REFUSE'
      ? 'T-REFUSE'
      : outcome.verdict === 'CLARIFY'
        ? 'T-CLARIFY'
        : outcome.verdict === 'ESCALATE_TO_TUTOR'
          ? 'T-ESCALATE'
          : outcome.verdict === 'ALLOW_WITH_SCOPE'
            ? 'T-SCOPE'
            : null;

  return {
    verdict: outcome.verdict,
    rules: [...new Set(outcome.rules)],
    reasonCode: outcome.reasonCode,
    deterministic: options.deterministic,
    confidence: 'high',
    scope: outcome.scope ?? null,
    clarifyingQuestion: outcome.clarifyingQuestion ?? null,
    policyRef: options.policyRef,
    refusalTemplateId: template,
    promptVersion: options.promptVersion,
    modelId: options.modelId,
  };
}

/**
 * The approved policy sentence for a decision, when an approved rule covers the capability the
 * decision is about (`05` section 3.3.1: `rule_text` is quoted verbatim in a refusal). Returns
 * `null` when no approved rule covers it, in which case the platform sentence is used.
 */
export function policyRuleTextForDecision(
  decision: GuardrailDecision,
  view: AiUsagePolicyView,
  restrictedCapability: string | null,
): string | null {
  const prohibited = view.ruleRefs.filter((rule) => rule.effect === 'PROHIBIT');

  if (restrictedCapability) {
    for (const rule of prohibited) {
      const capabilities = capabilitiesForPolicyRuleCode(rule.ruleCode) ?? [];
      if (capabilities.includes(restrictedCapability)) return rule.ruleText;
    }
  }

  const escalates = decision.verdict === 'ESCALATE_TO_TUTOR';
  if (escalates) {
    const escalationRule = view.ruleRefs.find((rule) => rule.effect === 'ESCALATE_TO_TUTOR');
    return escalationRule?.ruleText ?? null;
  }

  return null;
}

/**
 * Decide one student turn.
 *
 * Never throws: every failure becomes a refusal-shaped decision, because a guardrail that crashes
 * the request it was protecting is a guardrail that has failed open at the call site.
 */
export async function decide(input: DecideInput, deps: DecideDeps = {}): Promise<DecideResult> {
  const promptVersion = deps.classifier?.promptVersion ?? GUARDRAIL_PROMPT_VERSION;
  const turn = normaliseTurn(input.turnText);
  const errors: string[] = [];
  const policyWarnings: string[] = [];
  const policyRefFor = (view: AiUsagePolicyView | null): GuardrailDecision['policyRef'] =>
    view ? { policyId: view.policyId, version: view.version } : null;

  const log = (
    decision: GuardrailDecision,
    layer: DecisionLayer,
    extra: {
      policyRuleId?: string | null;
      uploadClassification?: UploadClassificationCode[] | null;
      postCheckTrips?: string[];
    } = {},
  ): GuardrailLogRecord =>
    buildGuardrailLogRecord({
      decision,
      layer,
      assignmentId: input.assignmentId,
      assistantSessionId: input.assistantSessionId,
      assistantMessageId: input.assistantMessageId ?? null,
      subjectRef: input.subjectRef,
      turnContentHash: turn.hash,
      policyRuleId: extra.policyRuleId ?? null,
      latencyMs: input.latencyMs ?? 0,
      uploadClassification: extra.uploadClassification ?? null,
      postCheckTrips: extra.postCheckTrips ?? [],
      capability: input.capability ?? 'student_assistant',
    });

  const finish = (
    decision: GuardrailDecision,
    layer: DecisionLayer,
    extra: Parameters<typeof log>[2] & { renderedOverride?: string; restrictedCapability?: string | null; view?: AiUsagePolicyView | null } = {},
  ): DecideResult => {
    const policyRuleText = extra.view
      ? policyRuleTextForDecision(decision, extra.view, extra.restrictedCapability ?? null)
      : null;
    const rendered =
      extra.renderedOverride ??
      renderDecision(decision, { policyRuleText, answer: '' });
    return {
      decision,
      layer,
      rendered,
      logRecord: log(decision, layer, extra),
      classifierCalls: 0,
      extractionCalls: 0,
      uploadClassifications: [],
      pickerRefusal: false,
      frames: [],
      errors: [],
      warnings: [],
      handedToClassifier: false,
    };
  };

  try {
    /* ---------------- picker gate (before the guard and before storage) ---------------- */
    const declared = input.uploads ?? [];
    const { accepted, refused } = gateUploads(declared);
    if (refused.length > 0) {
      const decision = refusalDecision(
        ['UP5'],
        REASON_CODES.UNSUPPORTED_MODALITY_REFUSED_AT_PICKER,
        promptVersion,
      );
      const result = finish(decision, 'PICKER', {
        uploadClassification: refused.map(() => 'UP5' as UploadClassificationCode),
      });
      return {
        ...result,
        pickerRefusal: true,
        uploadClassifications: refused.map((upload) => ({
          uploadId: upload.uploadId,
          code: 'UP5' as UploadClassificationCode,
          confidence: 1,
        })),
      };
    }

    /* ---------------- extraction (capability `attachment_extraction`, D68) ---------------- */
    const uploadClassifications: UploadClassification[] = [];
    let extractionCalls = 0;
    if (accepted.length > 0) {
      if (!deps.extractor) {
        const decision = refusalDecision(['SYS_CONFIG_INVALID'], REASON_CODES.CONFIG_INVALID, promptVersion);
        return { ...finish(decision, 'L1'), errors: ['an upload was declared but no extractor is configured'] };
      }
      for (const upload of accepted) {
        extractionCalls += 1;
        try {
          const extracted = await deps.extractor.extract(upload);
          uploadClassifications.push({
            uploadId: upload.uploadId,
            code: extracted.classification,
            confidence: extracted.confidence,
            text: extracted.text,
          });
        } catch (error) {
          const decision = refusalDecision(['SYS_MODEL_UNAVAILABLE'], REASON_CODES.MODEL_UNAVAILABLE, promptVersion);
          return {
            ...finish(decision, 'L1'),
            extractionCalls,
            errors: [
              `extraction threw for an accepted upload: ${
                error instanceof Error ? error.message : String(error)
              }`,
            ],
          };
        }
      }
    }

    /* ---------------- policy overlay input (L2's data) ---------------- */
    let view: AiUsagePolicyView;
    let overlay: PolicyOverlay;

    if (input.policy.kind === 'rows') {
      const parsed = policyFromRows(input.policy.rows, {
        assignmentId: input.assignmentId,
        policyId: input.policy.meta?.policyId,
        version: input.policy.meta?.version,
      });
      switch (parsed.status) {
        case 'POL_ABSENT': {
          const decision = refusalDecision(['POL_ABSENT'], REASON_CODES.POLICY_ABSENT, promptVersion);
          return { ...finish(decision, 'L2'), extractionCalls, uploadClassifications };
        }
        case 'POL_INVALID': {
          const decision = refusalDecision(['POL_INVALID'], REASON_CODES.POLICY_INVALID, promptVersion);
          return {
            ...finish(decision, 'L2'),
            extractionCalls,
            uploadClassifications,
            errors: parsed.problems,
          };
        }
        case 'POL_APPROVED': {
          view = parsed.policy;
          overlay = parsed.overlay;
          if (parsed.warnings.length > 0) policyWarnings.push(...parsed.warnings);
          break;
        }
      }
    } else {
      if (!isPolicyView(input.policy.view)) {
        const decision = refusalDecision(['POL_INVALID'], REASON_CODES.POLICY_INVALID, promptVersion);
        return {
          ...finish(decision, 'L2'),
          extractionCalls,
          uploadClassifications,
          errors: ['policy view is not an AiUsagePolicyView'],
        };
      }
      const validated = validatePolicyView(input.policy.view);
      if (!validated.ok) {
        const decision = refusalDecision(['POL_INVALID'], REASON_CODES.POLICY_INVALID, promptVersion);
        return {
          ...finish(decision, 'L2'),
          extractionCalls,
          uploadClassifications,
          errors: validated.problems,
        };
      }
      view = validated.value;
      overlay = overlayForView(view);
    }

    /* ---------------- L1 ---------------- */
    const layerOne = evaluateDeterministic({
      turn,
      uploads: uploadClassifications,
      session: input.session,
      sources: [...input.sources],
      policy: view,
    });

    if (layerOne.outcome) {
      const withFrames: RuleOutcome = {
        ...layerOne.outcome,
        rules: [...new Set([...layerOne.outcome.rules, ...layerOne.frames])],
      };
      const capability = capabilityForOutcome(withFrames);
      const restricted = applyPolicyOverlay(withFrames, overlay); // L2
      const scoped = resolveScope(restricted); // L3
      const decision = toDecision(scoped, {
        deterministic: true,
        promptVersion,
        modelId: null,
        policyRef: policyRefFor(view),
      });
      const isRestricted = scoped.rules.includes('POL_RESTRICT');
      const policyRuleText = policyRuleTextForDecision(decision, view, capability);
      const result = finish(decision, 'L1', {
        view,
        restrictedCapability: isRestricted ? capability : null,
        policyRuleId: policyRuleIdFor(view, policyRuleText),
      });
      return {
        ...result,
        rendered: renderDecision(decision, { policyRuleText, answer: '' }),
        extractionCalls,
        uploadClassifications,
        frames: layerOne.frames,
        handedToClassifier: false,
        errors: [...errors, ...result.errors],
        warnings: [...result.warnings, ...policyWarnings],
      };
    }

    /* ---------------- L4 ---------------- */
    const classified = await classifyWithModel(
      {
        assignmentId: input.assignmentId,
        assistantSessionId: input.assistantSessionId,
        turnText: input.turnText,
        residualText: turn.match,
        effectiveAllowed: overlay.effectiveAllowed,
        effectiveProhibited: overlay.effectiveProhibited,
        policyText: view.notesForStudents,
        promptVersion,
      },
      { classifier: deps.classifier, classifierCallsRemaining: deps.classifierCallsRemaining },
    );

    const withFrames: GuardrailDecision = {
      ...classified.decision,
      rules: [...new Set([...classified.decision.rules, ...layerOne.frames])],
      policyRef: classified.decision.policyRef ?? policyRefFor(view),
    };
    const policyRuleText = policyRuleTextForDecision(withFrames, view, null);
    const result = finish(withFrames, 'L4', {
      view,
      policyRuleId: policyRuleIdFor(view, policyRuleText),
    });

    return {
      ...result,
      rendered: renderDecision(withFrames, { policyRuleText, answer: '' }),
      classifierCalls: classified.classifierCalls,
      extractionCalls,
      uploadClassifications,
      frames: layerOne.frames,
      handedToClassifier: layerOne.handedToClassifier,
      errors: [...errors, ...classified.problems],
      warnings: [...result.warnings, ...policyWarnings],
    };
  } catch (error) {
    // `05` section 12.2: a guardrail module that throws is a bug and must be visible. It is
    // returned as a refusal *with* the message, never swallowed, and never as an answer.
    const decision = refusalDecision(['SYS_GUARDRAIL_ERROR'], REASON_CODES.GUARDRAIL_ERROR, promptVersion);
    const logRecord = log(decision, 'L1');
    return {
      decision,
      layer: 'L1',
      rendered: renderDecision(decision, { answer: '' }),
      logRecord,
      classifierCalls: 0,
      extractionCalls: 0,
      uploadClassifications: [],
      pickerRefusal: false,
      frames: [],
      errors: [`guardrail threw: ${error instanceof Error ? error.message : String(error)}`],
      warnings: [],
      handedToClassifier: false,
    };
  }
}

/** The `ai_policy_rules.id` behind a quoted policy sentence, for the audit row. */
function policyRuleIdFor(view: AiUsagePolicyView, policyRuleText: string | null): string | null {
  if (!policyRuleText) return null;
  const match = view.ruleRefs.find((rule) => rule.ruleText === policyRuleText);
  return match?.ruleId ?? null;
}

/** Re-exported so a caller does not import from four files, and so `mayGenerate` is not duplicated. */
export { mayGenerate };
export type {
  AiUsagePolicyView,
  DeclaredUpload,
  GuardrailDecision,
  GuardrailLogRecord,
  PolicyRuleRow,
  SessionState,
  SourceChunk,
  UploadClassification,
};

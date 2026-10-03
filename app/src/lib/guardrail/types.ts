/**
 * The guardrail's contract: the verdict enum, the scope tokens, the decision record, and the
 * rule-id registry.
 *
 * **Authority.** `05-AI-GUARDRAILS.md` sections 3.1 (verdicts), 3.2.1 (rule-id namespaces),
 * 3.3.3 (scope tokens), 7.2 (the `GuardrailDecision` schema). `docs/handoff/04-INTERFACES.md`
 * section 1 declares this file's contents **frozen at Phase 3**, so a later phase that needs a
 * new verdict, scope, or rule-id namespace raises it in `05-ISSUES.md` first.
 *
 * **Why the schema lives beside the type.** `05` section 12.1 gives this file "verdict enum +
 * decision types" and names no separate `schema.ts`, while section 7.1 requires the decision to
 * be schema-validated in `src/lib/guardrail/` before any side effect. Deriving the type from one
 * zod schema is the only arrangement in which the runtime check and the compile-time type cannot
 * drift, so both live here. zod performs no I/O, so the purity rules of section 12.1 hold.
 *
 * **What is deliberately NOT here.** No reason-code constants (`reasons.ts`), no rendering
 * (`templates.ts`), and no classification logic. Those are separate files because
 * `05` section 12.1 makes the import graph itself part of the contract.
 */

import { z } from 'zod';

/** The five verdicts of `05` section 3.1. This union is the only source of these strings. */
export const VERDICTS = [
  'ALLOW',
  'ALLOW_WITH_SCOPE',
  'CLARIFY',
  'REFUSE',
  'ESCALATE_TO_TUTOR',
] as const;

export type Verdict = (typeof VERDICTS)[number];

/**
 * `05` section 3.1's severity order: `REFUSE > ESCALATE_TO_TUTOR > CLARIFY > ALLOW_WITH_SCOPE >
 * ALLOW`. Higher wins.
 *
 * Every combinator in the guardrail goes through `moreRestrictive`. The order is a policy
 * property, not a presentation choice, and it is the mechanism behind three separate rules:
 * multi-file uploads (`05` section 6.4 rule 5), multi-intent turns, and the drip handling of
 * section 4.4.
 */
export const VERDICT_SEVERITY: Readonly<Record<Verdict, number>> = {
  ALLOW: 0,
  ALLOW_WITH_SCOPE: 1,
  CLARIFY: 2,
  ESCALATE_TO_TUTOR: 3,
  REFUSE: 4,
};

/** The more restrictive of two verdicts. Ties return the first, so callers must not rely on order for equals. */
export function moreRestrictive(a: Verdict, b: Verdict): Verdict {
  return VERDICT_SEVERITY[a] >= VERDICT_SEVERITY[b] ? a : b;
}

/** `05` section 3.1: only these two verdicts may proceed to generation. */
export function mayGenerate(verdict: Verdict): boolean {
  return verdict === 'ALLOW' || verdict === 'ALLOW_WITH_SCOPE';
}

/** The scope tokens of `05` section 3.3.3. `ALLOW_WITH_SCOPE` carries exactly one. */
export const SCOPE_TOKENS = [
  'SCOPE_LOCATE',
  'SCOPE_TERM',
  'SCOPE_RUBRIC',
  'SCOPE_POLICY',
  'SCOPE_PROGRESS',
] as const;

export type ScopeToken = (typeof SCOPE_TOKENS)[number];

/** `05` section 10.1's template ids. `null` means "no refusal-shaped payload". */
export const REFUSAL_TEMPLATE_IDS = ['T-REFUSE', 'T-SCOPE', 'T-CLARIFY', 'T-ESCALATE'] as const;

export type RefusalTemplateId = (typeof REFUSAL_TEMPLATE_IDS)[number];

export type Confidence = 'high' | 'medium' | 'low';

/**
 * Every rule id the spec defines, by namespace, from `05` sections 3.2.1, 4.2, 6.1, 6.2, 6.3,
 * 6.4, 9.2, and 12.2.
 *
 * **Why an explicit registry rather than the schema's prefix pattern.** `05` section 7.1 rule 4
 * makes "a rule id not in the known namespace" a validation failure, and the schema in section
 * 7.2 can only express the *prefix* half of that (its `pattern`). An injection or a model slip
 * that cites `P99` or `SYS_WHATEVER` would satisfy the pattern and be recorded as an authority
 * the code never consulted. The registry is the other half. A rule id absent here is a
 * validation failure, which is a refusal.
 */
const RULE_ID_GROUPS: readonly string[][] = [
  Array.from({ length: 12 }, (_, i) => `A${i + 1}`),
  Array.from({ length: 16 }, (_, i) => `P${i + 1}`),
  Array.from({ length: 15 }, (_, i) => `DE${i + 1}`),
  ['INJ1', 'INJ2', 'INJ3'],
  ['POL_APPROVED', 'POL_ABSENT', 'POL_RESTRICT', 'POL_INVALID', 'POL_SCOPE'],
  Array.from({ length: 5 }, (_, i) => `AMB${i + 1}`),
  Array.from({ length: 4 }, (_, i) => `ESC${i + 1}`),
  ['RET_NO_MATCH'],
  Array.from({ length: 5 }, (_, i) => `UP${i + 1}`),
  Array.from({ length: 6 }, (_, i) => `CL${i + 1}`),
  ['POST_CODE', 'POST_SOLUTION', 'POST_UNSOURCED', 'POST_TECH', 'POST_EVAL', 'POST_ECHO', 'POST_LEAK'],
  ['SYS_SCHEMA_INVALID', 'SYS_MODEL_UNAVAILABLE', 'SYS_BUDGET_EXCEEDED', 'SYS_CONFIG_INVALID', 'SYS_GUARDRAIL_ERROR'],
];

export const KNOWN_RULE_IDS: ReadonlySet<string> = new Set(RULE_ID_GROUPS.flat());

export function isKnownRuleId(id: string): boolean {
  return KNOWN_RULE_IDS.has(id);
}

/** `05` section 7.2's `GuardrailDecision`. Every field the spec marks required is required here. */
export interface GuardrailDecision {
  verdict: Verdict;
  /** At least one id; all must be in `KNOWN_RULE_IDS`. In evaluation order. */
  rules: string[];
  /** Stable machine code, e.g. `STUDENT_CODE_DIAGNOSIS_REQUESTED`. Never student-facing. */
  reasonCode: string;
  /** True when L1-L3 decided. A deterministic decision carries no model id. */
  deterministic: boolean;
  confidence?: Confidence;
  scope: ScopeToken | null;
  clarifyingQuestion?: string | null;
  policyRef?: { policyId: string; version: number } | null;
  refusalTemplateId?: RefusalTemplateId | null;
  /** `systemPrefixId`, e.g. `guardrail-v3`. Never student-visible (`R11`, `N12`). */
  promptVersion: string;
  modelId?: string | null;
}

const RuleIdSchema = z.string().regex(/^(A|P|DE|INJ|POL_|AMB|ESC|RET_|UP|CL|POST_|SYS_)[A-Z0-9_]*$/);

export const GuardrailDecisionSchema = z.strictObject({
  verdict: z.enum(VERDICTS),
  rules: z.array(RuleIdSchema).min(1),
  reasonCode: z.string().min(3),
  deterministic: z.boolean(),
  confidence: z.enum(['high', 'medium', 'low']).optional(),
  scope: z.enum(SCOPE_TOKENS).nullable(),
  clarifyingQuestion: z.string().max(300).nullable().optional(),
  policyRef: z
    .strictObject({ policyId: z.string(), version: z.number().int() })
    .nullable()
    .optional(),
  refusalTemplateId: z.enum(REFUSAL_TEMPLATE_IDS).nullable().optional(),
  promptVersion: z.string(),
  modelId: z.string().nullable().optional(),
});

/**
 * Validate an untrusted value against `05` section 7.2 **and** the consistency table beneath it.
 *
 * The table is not expressible in JSON Schema, so it is checked here in the same function that
 * checks the schema: a caller must never be able to pass validation with `verdict: ALLOW` and a
 * non-null `refusalTemplateId`, or `verdict: REFUSE` with no `T-REFUSE`, because the renderer
 * keys off exactly those pairings (`05` section 10.1).
 *
 * Returns every problem rather than the first, so a log line can name all of them.
 */
export function validateGuardrailDecision(
  raw: unknown,
): { ok: true; value: GuardrailDecision } | { ok: false; problems: string[] } {
  const parsed = GuardrailDecisionSchema.safeParse(raw);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => {
      const path = issue.path.join('.');
      return path === '' ? issue.message : `${path}: ${issue.message}`;
    });
    return { ok: false, problems };
  }

  const decision = parsed.data as GuardrailDecision;
  const problems: string[] = [];

  const unknownRules = decision.rules.filter((id) => !isKnownRuleId(id));
  if (unknownRules.length > 0) {
    problems.push(`rules: unknown rule id(s) ${unknownRules.join(', ')}`);
  }

  const scope = decision.scope ?? null;
  const template = decision.refusalTemplateId ?? null;

  switch (decision.verdict) {
    case 'ALLOW':
      if (scope !== null) problems.push('verdict ALLOW requires scope = null');
      if (template !== null) problems.push('verdict ALLOW requires refusalTemplateId = null');
      break;
    case 'ALLOW_WITH_SCOPE':
      if (scope === null) problems.push('verdict ALLOW_WITH_SCOPE requires a non-null scope');
      break;
    case 'CLARIFY':
      if (!decision.clarifyingQuestion) {
        problems.push('verdict CLARIFY requires a non-null clarifyingQuestion');
      }
      break;
    case 'REFUSE':
      if (template !== 'T-REFUSE') {
        problems.push('verdict REFUSE requires refusalTemplateId = "T-REFUSE"');
      }
      break;
    case 'ESCALATE_TO_TUTOR':
      if (template !== 'T-ESCALATE') {
        problems.push('verdict ESCALATE_TO_TUTOR requires refusalTemplateId = "T-ESCALATE"');
      }
      break;
  }

  // `05` section 7.2: a deterministic decision cannot carry a model id. The reverse is not
  // asserted -- a model-assisted decision that recorded no model id is a logging gap, not a
  // policy violation, and refusing it here would hide the decision instead of recording it.
  if (decision.deterministic && (decision.modelId ?? null) !== null) {
    problems.push('deterministic = true requires modelId = null');
  }

  if (problems.length > 0) return { ok: false, problems };
  return { ok: true, value: decision };
}

/** Which layer decided. `PICKER` is the pre-guard upload refusal of `05` section 6.4 rule 8. */
export type DecisionLayer = 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'PICKER';

/** One approved chunk the assistant may ground on, or the student's own upload extraction. */
export interface SourceChunk {
  chunkId: string;
  documentId: string;
  /** `05` section 5.1: `T1` official, `T2` tutor-approved, `T3` structure. `T4`/`T5` never ground. */
  tier: 'T1' | 'T2' | 'T3';
  pageFrom: number;
  text: string;
}

/**
 * Per-session state read on every turn (`05` section 4.4). Held in `guardrail_logs` in the
 * deployed system; passed in here so the guardrail stays a pure function of its inputs.
 */
export interface SessionState {
  /** Prior turns, oldest first. `verdict` is the recorded verdict, `text` the student's own turn. */
  turns: Array<{ turnId: string; text: string; verdict: Verdict; rules: string[] }>;
  currentMilestoneTitle?: string | null;
  completedItemCount?: number;
}

/** A declared upload, before any check. `declaredMimeType` is what the picker reported. */
export interface DeclaredUpload {
  uploadId: string;
  fileName: string;
  declaredMimeType: string;
  byteLength: number;
  /** Absolute path to the stored bytes. Read only by the extraction port, never logged. */
  path: string;
}

/** `05` section 6.4's classification codes, plus `UP5` for the picker refusal. */
export type UploadClassificationCode = 'UP1' | 'UP2' | 'UP3' | 'UP4' | 'UP5';

export interface UploadClassification {
  uploadId: string;
  code: UploadClassificationCode;
  /** Extraction confidence, `0`-`1`. Only `UP4` depends on it, but it is always recorded. */
  confidence: number;
  /** Extraction text, treated as student content: never logged, never persisted by the guardrail. */
  text?: string;
}

/** `05` section 3.3.1's `AiUsagePolicyView`, narrowed to the fields the guardrail consumes. */
export interface AiUsagePolicyView {
  policyId: string;
  assignmentId: string;
  version: number;
  publicationStatus: 'AI_GENERATED' | 'NEEDS_REVIEW' | 'EDITED' | 'APPROVED' | 'PUBLISHED' | 'REJECTED';
  permitted: string[];
  prohibited: string[];
  modality: { image: string; audio: string; video: string; pdf: string };
  notesForStudents: string;
  extractedFromChunkIds: string[];
  ruleRefs: Array<{
    ruleId: string;
    ruleCode: string;
    effect: 'PROHIBIT' | 'ALLOW' | 'ESCALATE_TO_TUTOR' | 'CLARIFY';
    ruleText: string;
    sourceChunkId?: string | null;
  }>;
  approvedBy?: string | null;
  approvedAt?: string | null;
}

/** `05` section 8.1 Table A (durable) plus Table B (structured log), in one record. */
export interface GuardrailLogRecord {
  event: 'guardrail.decision';
  assignmentId: string;
  assistantSessionId: string;
  assistantMessageId: string | null;
  subjectRef: string;
  turnContentHash: string;
  capability: string;
  verdict: Verdict;
  reasonCode: string;
  rules: string[];
  deterministic: boolean;
  layer: DecisionLayer;
  scope: ScopeToken | null;
  policyRuleId: string | null;
  citedTiers: string[];
  promptVersion: string;
  modelId: string | null;
  latencyMs: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  postCheckTrips: string[];
  refusalTemplateId: RefusalTemplateId | null;
  dripSequenceTurnCount: number;
  uploadClassification: UploadClassificationCode[] | null;
}

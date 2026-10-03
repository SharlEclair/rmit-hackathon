/**
 * `05-AI-GUARDRAILS.md` section 3.3: the approved AI Usage Policy as **data**, and the algebra
 * that turns it into enforceable rule inputs (D9).
 *
 * **Two jobs, one file.** WP-08 names this file for "parses the approved per-assignment AI Usage
 * Policy into enforceable rule inputs". `policy.ts` owns L2/L3 (the overlay and scope resolution)
 * because `05` section 12.1 names it for exactly that. The split is: this file converts rows and
 * validates the view; `policy.ts` executes the algebra.
 *
 * **The gap this file closes, and why it is a decision rather than an invention.**
 * `06-DATA-MODEL.md` section 7.2.11 gives `ai_policy_rules.rule_code` only a shape
 * (`^[a-z][a-z0-9_]{2,63}$`) -- it is free-form, and the seeded demo policy uses semantic codes
 * such as `no_ai_evaluation_of_work`. `05` section 3.3.2, on the other hand, computes with a
 * **closed capability vocabulary** (`generate_answers`, `evaluate_student_work`, ...). Nothing in
 * either document maps one to the other, and `05` section 3.3.1 is explicit about what must
 * happen when a mapping is missing: "the policy fails validation as `POL_INVALID` and the
 * assistant refuses for that assignment. Fail closed, never guess."
 *
 * `CAPABILITIES_BY_RULE_CODE` below is therefore the mapping, and an assistant-applicable rule
 * code absent from it is a hard `POL_INVALID` -- never a silent no-op. It is recorded as
 * **D83** in `docs/01-DECISIONS.md` and as an open item for WP-05 (the Assignment Analyst should
 * emit codes from this table rather than inventing new ones) in `docs/handoff/05-ISSUES.md`.
 *
 * **Why `applies_to` matters.** `05` section 3.3.1 contributes a rule to `permitted`/
 * `prohibited` only when `applies_to` includes `assistant`. Upload-scoped and discussion-scoped
 * rules are enforced elsewhere (the upload sub-guard of section 6.4, moderation of section 9), so
 * an unmapped upload-only code is a warning, not an invalidity -- and mapping an upload-scoped
 * ALLOW into the assistant's permitted list would widen the floor, which `N6` forbids.
 *
 * **Pure.** No I/O. zod is a validator, not a data source.
 */

import { z } from 'zod';

import type { AiUsagePolicyView } from './types';

/** The rows this file consumes, in the shape `06` section 7.2.11 stores them. */
export interface PolicyRuleRow {
  /** `ai_policy_rules.id`. */
  ruleId: string;
  ruleCode: string;
  /** Tutor-approved wording, quoted verbatim in a refusal (`05` section 3.3.1). */
  ruleText: string;
  effect: 'PROHIBIT' | 'ALLOW' | 'ESCALATE_TO_TUTOR' | 'CLARIFY';
  appliesTo: 'assistant' | 'uploads' | 'discussion' | 'all';
  publicationStatus: string;
  sourceChunkId?: string | null;
  displayOrder?: number;
}

/** `05` section 3.3.2, `platformFloor.allowed`. The vocabulary is closed. */
export const FLOOR_ALLOWED: readonly string[] = [
  'explain_terminology',
  'interpret_rubric',
  'navigate_structure',
  'quote_source_verbatim',
  'locate_source',
  'explain_ai_policy',
  'self_check_prompts',
  'summarise_own_progress',
  'explain_constraints',
];

/** `05` section 3.3.2, `platformFloor.prohibited`. A policy can never remove a member. */
export const FLOOR_PROHIBITED: readonly string[] = [
  'generate_answers',
  'generate_code',
  'debug_student_code',
  'evaluate_student_work',
  'edit_student_work',
  'choose_implementation',
  'paraphrase_requirements',
  'predict_grade',
  'complete_deliverable',
];

/**
 * Policy rule code to capability. See the header for why this table is unavoidable.
 *
 * Every code the seeded demo policy uses is here, because that policy is the one the Phase 3
 * harness reads back from a fixture and the one the demo depends on. A new code an Analyst pass
 * invents is `POL_INVALID` until it is added deliberately, which is the fail-closed direction.
 */
const CAPABILITIES_BY_RULE_CODE: Readonly<Record<string, readonly string[]>> = {
  /* Prohibitions */
  no_answer_generation: ['generate_answers', 'complete_deliverable'],
  no_ai_authored_artefacts: ['generate_code', 'edit_student_work'],
  no_ai_evaluation_of_work: ['evaluate_student_work'],
  no_ai_debugging: ['debug_student_code'],
  no_implementation_choice: ['choose_implementation'],
  no_requirement_paraphrase: ['paraphrase_requirements'],
  no_grade_prediction: ['predict_grade'],
  no_answer_sharing: ['complete_deliverable'],

  /* Permissions */
  explain_general_concepts: ['explain_terminology'],
  explain_assessment_documents: ['interpret_rubric', 'locate_source'],
  quote_requirements_verbatim: ['quote_source_verbatim', 'locate_source'],
  point_to_requirement: ['locate_source'],
  explain_ai_policy: ['explain_ai_policy'],
  navigate_structure: ['navigate_structure'],
  self_check_questions: ['self_check_prompts'],
  summarise_progress: ['summarise_own_progress'],
  explain_constraints: ['explain_constraints'],

  /* Upload- and discussion-scoped rules: enforced elsewhere, so only a warning when unmapped. */
  no_third_party_disclosure: [],
  mechanical_editing_only: [],
  moderate_discussion_tone: [],
};

/**
 * Escalation and clarification subjects, the third closed vocabulary `05` section 3.3.1 implies
 * but never lists. A rule with `effect = ESCALATE_TO_TUTOR` or `CLARIFY` must name one of these;
 * anything else is `POL_INVALID`, because an escalation override for an unknown subject would be
 * a rule the guardrail cannot consult.
 */
const SUBJECTS_BY_RULE_CODE: Readonly<Record<string, string>> = {
  route_uncertain_requests_to_tutor: 'uncertain',
  escalate_welfare_requests: 'welfare',
  escalate_administrative_requests: 'administrative',
  escalate_grading_questions: 'grading',
  clarify_ambiguous_requests: 'ambiguous',
};

const ALL_KNOWN_SUBJECTS: readonly string[] = ['uncertain', 'welfare', 'administrative', 'grading', 'ambiguous'];

/** `05` section 3.3.1's `AiUsagePolicyView`, exactly as its JSON Schema states it. */
const AiUsagePolicyViewSchema = z.strictObject({
  policyId: z.string(),
  assignmentId: z.string(),
  version: z.number().int().min(1),
  publicationStatus: z.enum(['AI_GENERATED', 'NEEDS_REVIEW', 'EDITED', 'APPROVED', 'PUBLISHED', 'REJECTED']),
  permitted: z.array(z.enum(FLOOR_ALLOWED as [string, ...string[]])),
  prohibited: z.array(z.enum(FLOOR_PROHIBITED as [string, ...string[]])),
  modality: z.strictObject({
    image: z.enum(['locate_source_only', 'prohibited_for_review']),
    audio: z.enum(['transcribe_then_guard']),
    video: z.enum(['transcribe_then_guard']),
    pdf: z.enum(['locate_source_only', 'prohibited_for_review']),
  }),
  notesForStudents: z.string().max(600),
  extractedFromChunkIds: z.array(z.string()),
  ruleRefs: z
    .array(
      z.strictObject({
        ruleId: z.string(),
        ruleCode: z.string().regex(/^[a-z][a-z0-9_]{2,63}$/),
        effect: z.enum(['PROHIBIT', 'ALLOW', 'ESCALATE_TO_TUTOR', 'CLARIFY']),
        ruleText: z.string().min(10).max(600),
        sourceChunkId: z.string().nullable().optional(),
      }),
    )
    .min(1),
  approvedBy: z.string().nullable().optional(),
  approvedAt: z.string().nullable().optional(),
});

/** The default modality posture of `05` section 6.4 / O11, used when rows carry none. */
const DEFAULT_MODALITY = {
  image: 'locate_source_only',
  audio: 'transcribe_then_guard',
  video: 'transcribe_then_guard',
  pdf: 'locate_source_only',
} as const;

export interface PolicyOverlay {
  /** `05` section 3.3.2: `policy.permitted INTERSECT platformFloor.allowed`. */
  effectiveAllowed: readonly string[];
  /** `05` section 3.3.2: `policy.prohibited UNION platformFloor.prohibited`. */
  effectiveProhibited: readonly string[];
  escalationSubjects: readonly string[];
  clarifySubjects: readonly string[];
}

export type PolicySourceResult =
  | { status: 'POL_APPROVED'; policy: AiUsagePolicyView; overlay: PolicyOverlay; warnings: string[] }
  | { status: 'POL_ABSENT' | 'POL_INVALID'; policy: null; overlay: null; problems: string[]; warnings: string[] };

/** Validate an assembled view (`05` section 3.3.1's schema), e.g. one loaded from a fixture. */
export function validatePolicyView(
  raw: unknown,
): { ok: true; value: AiUsagePolicyView } | { ok: false; problems: string[] } {
  const parsed = AiUsagePolicyViewSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      problems: parsed.error.issues.map((issue) =>
        issue.path.length === 0 ? issue.message : `${issue.path.join('.')}: ${issue.message}`,
      ),
    };
  }
  return { ok: true, value: parsed.data as AiUsagePolicyView };
}

/**
 * Build the enforceable policy from published rows (`05` section 3.3.4).
 *
 * Returns `POL_ABSENT` when no row is `PUBLISHED` (D47: the assistant is unavailable, never
 * permissive) and `POL_INVALID` when a published rule cannot be enforced.
 */
export function policyFromRows(
  rows: readonly PolicyRuleRow[],
  meta: { assignmentId: string; policyId?: string; version?: number },
): PolicySourceResult {
  const published = rows.filter((row) => row.publicationStatus === 'PUBLISHED');
  if (published.length === 0) {
    return {
      status: 'POL_ABSENT',
      policy: null,
      overlay: null,
      problems: ['no ai_policy_rules row is PUBLISHED for this assignment'],
      warnings: [],
    };
  }

  const problems: string[] = [];
  const warnings: string[] = [];
  const permitted = new Set<string>();
  const prohibited = new Set<string>();
  const escalationSubjects = new Set<string>();
  const clarifySubjects = new Set<string>();
  const ruleRefs: AiUsagePolicyView['ruleRefs'] = [];

  for (const row of published) {
    const appliesToAssistant = row.appliesTo === 'assistant' || row.appliesTo === 'all';
    const capabilities = CAPABILITIES_BY_RULE_CODE[row.ruleCode];
    // An ALLOW/PROHIBIT rule is enforced through the capability algebra; an ESCALATE/CLARIFY rule
    // is enforced through a named subject. Requiring the wrong one of the two would make a valid
    // policy `POL_INVALID` -- which is how the seeded demo policy's escalation rule was first
    // rejected in this phase's own test run.
    const isCapabilityRule = row.effect === 'ALLOW' || row.effect === 'PROHIBIT';

    if (isCapabilityRule && capabilities === undefined) {
      if (appliesToAssistant) {
        problems.push(`assistant-applicable rule code "${row.ruleCode}" has no capability mapping`);
      } else {
        warnings.push(
          `rule code "${row.ruleCode}" is ${row.appliesTo}-scoped and contributes no assistant capability`,
        );
      }
      ruleRefs.push(toRuleRef(row));
      continue;
    }

    switch (row.effect) {
      case 'ALLOW': {
        if (appliesToAssistant) {
          for (const capability of capabilities ?? []) {
            if (FLOOR_PROHIBITED.includes(capability)) {
              problems.push(
                `rule code "${row.ruleCode}" permits the floor-prohibited capability "${capability}"`,
              );
              continue;
            }
            if (!FLOOR_ALLOWED.includes(capability)) {
              problems.push(`rule code "${row.ruleCode}" maps to unknown capability "${capability}"`);
              continue;
            }
            permitted.add(capability);
          }
        } else {
          warnings.push(
            `rule code "${row.ruleCode}" allows ${row.appliesTo}-scoped behaviour; the assistant's permitted set is unchanged`,
          );
        }
        break;
      }
      case 'PROHIBIT': {
        if (appliesToAssistant) {
          for (const capability of capabilities ?? []) {
            if (!FLOOR_PROHIBITED.includes(capability) && !FLOOR_ALLOWED.includes(capability)) {
              problems.push(`rule code "${row.ruleCode}" maps to unknown capability "${capability}"`);
              continue;
            }
            prohibited.add(capability);
          }
        }
        break;
      }
      case 'ESCALATE_TO_TUTOR': {
        if (appliesToAssistant) {
          const subject = SUBJECTS_BY_RULE_CODE[row.ruleCode];
          if (!subject) {
            problems.push(`escalation rule code "${row.ruleCode}" names no known subject`);
          } else {
            escalationSubjects.add(subject);
          }
        }
        break;
      }
      case 'CLARIFY': {
        if (appliesToAssistant) {
          const subject = SUBJECTS_BY_RULE_CODE[row.ruleCode];
          if (!subject) {
            problems.push(`clarification rule code "${row.ruleCode}" names no known subject`);
          } else {
            clarifySubjects.add(subject);
          }
        }
        break;
      }
    }

    ruleRefs.push(toRuleRef(row));
  }

  if (problems.length > 0) {
    return { status: 'POL_INVALID', policy: null, overlay: null, problems, warnings };
  }

  const overlay: PolicyOverlay = {
    effectiveAllowed: [...permitted].filter((capability) => FLOOR_ALLOWED.includes(capability)),
    effectiveProhibited: [...new Set([...FLOOR_PROHIBITED, ...prohibited])],
    escalationSubjects: [...escalationSubjects],
    clarifySubjects: [...clarifySubjects],
  };

  const policy: AiUsagePolicyView = {
    policyId: meta.policyId ?? `policy:${meta.assignmentId}`,
    assignmentId: meta.assignmentId,
    version: meta.version ?? 1,
    publicationStatus: published.some((row) => row.publicationStatus === 'PUBLISHED') ? 'PUBLISHED' : 'APPROVED',
    permitted: [...permitted],
    prohibited: [...prohibited],
    modality: { ...DEFAULT_MODALITY },
    notesForStudents: '',
    extractedFromChunkIds: [
      ...new Set(published.map((row) => row.sourceChunkId).filter((id): id is string => typeof id === 'string')),
    ],
    ruleRefs,
  };

  return { status: 'POL_APPROVED', policy, overlay, warnings };
}

function toRuleRef(row: PolicyRuleRow): AiUsagePolicyView['ruleRefs'][number] {
  return {
    ruleId: row.ruleId,
    ruleCode: row.ruleCode,
    effect: row.effect,
    ruleText: row.ruleText,
    sourceChunkId: row.sourceChunkId ?? null,
  };
}

/** Build the overlay for an already-validated view (the harness and the fixture path). */
export function overlayForView(view: AiUsagePolicyView): PolicyOverlay {
  // `05` section 3.3.2 is the algebra, and a view states its own `permitted`/`prohibited`: the
  // intersection and the union are taken from those arrays. `ruleRefs` are the history behind
  // them and are used for the refusal sentence, never as a second vote on the boundary.
  const permitted = view.permitted.filter((capability) => FLOOR_ALLOWED.includes(capability));

  return {
    effectiveAllowed: [...new Set(permitted)],
    effectiveProhibited: [...new Set([...FLOOR_PROHIBITED, ...view.prohibited])],
    escalationSubjects: [
      ...new Set(
        view.ruleRefs
          .filter((rule) => rule.effect === 'ESCALATE_TO_TUTOR')
          .map((rule) => SUBJECTS_BY_RULE_CODE[rule.ruleCode] ?? 'uncertain'),
      ),
    ],
    clarifySubjects: [
      ...new Set(
        view.ruleRefs
          .filter((rule) => rule.effect === 'CLARIFY')
          .map((rule) => SUBJECTS_BY_RULE_CODE[rule.ruleCode] ?? 'ambiguous'),
      ),
    ],
  };
}

/** The known escalation/clarification subjects, exported for tests that assert the closed set. */
export const KNOWN_POLICY_SUBJECTS: readonly string[] = ALL_KNOWN_SUBJECTS;

/**
 * The capabilities a policy rule code maps to, or `undefined` when the code is unmapped.
 * Exported because the refusal renderer needs a rule's own `rule_text` for the capability a
 * decision is about (`05` section 3.3.1), and duplicating this table anywhere would let the two
 * drift.
 */
export function capabilitiesForPolicyRuleCode(code: string): readonly string[] | undefined {
  return CAPABILITIES_BY_RULE_CODE[code];
}

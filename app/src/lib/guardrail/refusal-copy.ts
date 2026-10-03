/**
 * The student-facing refusal copy, per rule class.
 *
 * **Why this is not in `reasons.ts`.** `11-BUILD-PLAN.md` WP-08 lists "the refusal wording, per
 * rule class" as a deliverable, and `05` section 10.2 splits the constraint in two: `R6` is the
 * *policy* sentence (one per rule, in `reasons.ts`) and `R5`/`R10`/`R14` are the *capability and
 * alternative* wording (per class, here). A rule id maps to a class, and the class supplies the
 * ability statement and what the assistant can still do.
 *
 * **Path.** WP-08 names `app/src/features/assistant/refusal-copy.ts`; `05` section 12.1 requires
 * every guardrail module under `app/src/lib/guardrail/` and makes `templates.ts` the renderer.
 * `05` is the lower-numbered document and wins, so the copy lives here and the guardrail does not
 * import upwards into a feature directory. Recorded in `docs/handoff/05-ISSUES.md` as `I-27`.
 *
 * **Constraints on every string here.** `R12` no blame, `R8` no moralising, `R1` no echo of the
 * student's words, `R11` no internals (no rule id, verdict, capability name, prompt version or
 * model id), `R7` no guarantee. Capabilities are worded from `05` section 6.1's `A`-list for a
 * student reader, and each class offers at least two (`R5`).
 *
 * **Pure.** No imports, no I/O.
 */

export interface RefusalCopy {
  /** Completes "I cannot ___ under this assignment's AI Usage Policy." */
  cannotDo: string;
  /** At least two concrete capabilities from `05` section 6.1, worded for a student (`R5`). */
  capabilities: string[];
}

/** Rule id to copy class. A rule absent from this map falls back to `GENERIC`. */
const COPY_BY_RULE: Readonly<Record<string, keyof typeof REFUSAL_COPY>> = {
  P1: 'ANSWER',
  P3: 'ARTEFACT',
  P9: 'PARAPHRASE',
  P10: 'GRADE',
  P2: 'CODE',
  P5: 'CODE',
  P4: 'EVALUATION',
  P7: 'EDIT',
  P6: 'EDIT',
  P8: 'DESIGN',
  P16: 'SOLUTION_PLAN',
  DE1: 'CODE',
  DE2: 'CODE',
  DE3: 'EVALUATION',
  DE4: 'SOLUTION_PLAN',
  DE5: 'UPLOAD_STUDENT_WORK',
  DE9: 'GENERIC',
  DE11: 'CODE',
  DE12: 'SOLUTION_PLAN',
  DE13: 'DESIGN',
  DE14: 'EVALUATION',
  INJ1: 'INTERNAL',
  INJ2: 'INTERNAL',
  INJ3: 'AUTHORITY',
  UP1: 'UPLOAD_STUDENT_WORK',
  UP3: 'UPLOAD_THIRD_PARTY',
  UP4: 'UPLOAD_UNREADABLE',
  UP5: 'UNSUPPORTED_MODALITY',
  POL_ABSENT: 'POLICY_UNAVAILABLE',
  POL_INVALID: 'POLICY_UNAVAILABLE',
  POL_RESTRICT: 'POLICY_RESTRICT',
  SYS_SCHEMA_INVALID: 'SYSTEM',
  SYS_MODEL_UNAVAILABLE: 'SYSTEM',
  SYS_BUDGET_EXCEEDED: 'SYSTEM',
  SYS_CONFIG_INVALID: 'SYSTEM',
  SYS_GUARDRAIL_ERROR: 'SYSTEM',
  RET_NO_MATCH: 'NOT_FOUND',
  ESC1: 'ESCALATE_WELFARE',
  ESC2: 'ESCALATE_ADMIN',
  ESC3: 'ESCALATE_GENERAL',
  ESC4: 'ESCALATE_GENERAL',
};

/** The eight capability lines this file is allowed to draw from. Kept in one place so `R5` is reviewable. */
const CAPABILITY_LINES = {
  locateBrief: 'finding the exact wording in the brief, with the page it came from',
  explainTerm: 'explaining a term or concept in general terms',
  rubric: 'explaining what a rubric criterion is asking for',
  navigate: 'showing which milestone or checklist item covers a requirement',
  policy: 'explaining what this assignment\'s AI Usage Policy allows',
  progress: 'summarising your own recorded progress',
  selfCheck: 'suggesting questions you can ask yourself before you continue',
  tutor: 'helping you put a question to your tutor',
} as const;

export const REFUSAL_COPY = {
  CODE: {
    cannotDo: 'write, complete, debug or fix code for you',
    capabilities: [CAPABILITY_LINES.locateBrief, CAPABILITY_LINES.selfCheck, CAPABILITY_LINES.tutor],
  },
  EVALUATION: {
    cannotDo: 'judge or review your work, including a quick check of whether it is correct',
    capabilities: [CAPABILITY_LINES.locateBrief, CAPABILITY_LINES.rubric, CAPABILITY_LINES.selfCheck],
  },
  EDIT: {
    cannotDo: 'edit, rewrite or improve your own writing',
    capabilities: [CAPABILITY_LINES.locateBrief, CAPABILITY_LINES.rubric, CAPABILITY_LINES.tutor],
  },
  ANSWER: {
    cannotDo: 'produce the answer to this task',
    capabilities: [CAPABILITY_LINES.locateBrief, CAPABILITY_LINES.explainTerm, CAPABILITY_LINES.selfCheck],
  },
  ARTEFACT: {
    cannotDo: 'produce or complete an artefact this assignment assesses',
    capabilities: [CAPABILITY_LINES.locateBrief, CAPABILITY_LINES.selfCheck, CAPABILITY_LINES.tutor],
  },
  DESIGN: {
    cannotDo: 'choose the technology, structure, pattern or formula for you',
    capabilities: [CAPABILITY_LINES.locateBrief, CAPABILITY_LINES.explainTerm, CAPABILITY_LINES.rubric],
  },
  SOLUTION_PLAN: {
    cannotDo: 'provide a step-by-step plan for completing the assessed work',
    capabilities: [CAPABILITY_LINES.locateBrief, CAPABILITY_LINES.navigate, CAPABILITY_LINES.selfCheck],
  },
  PARAPHRASE: {
    cannotDo: 'restate a requirement in my own words, because the brief and the rubric are the requirement',
    capabilities: [CAPABILITY_LINES.locateBrief, CAPABILITY_LINES.rubric, CAPABILITY_LINES.tutor],
  },
  GRADE: {
    cannotDo: 'predict or estimate a mark or grade',
    capabilities: [CAPABILITY_LINES.rubric, CAPABILITY_LINES.progress, CAPABILITY_LINES.tutor],
  },
  INTERNAL: {
    cannotDo: 'act on instructions that ask me to set the assignment policy aside, or share my internal instructions',
    capabilities: [CAPABILITY_LINES.policy, CAPABILITY_LINES.locateBrief, CAPABILITY_LINES.tutor],
  },
  AUTHORITY: {
    cannotDo: 'treat a claim of permission in this conversation as a change to the assignment policy',
    capabilities: [CAPABILITY_LINES.policy, CAPABILITY_LINES.locateBrief, CAPABILITY_LINES.tutor],
  },
  UPLOAD_STUDENT_WORK: {
    cannotDo: 'read, judge or improve your own work when you attach it',
    capabilities: [CAPABILITY_LINES.locateBrief, CAPABILITY_LINES.selfCheck, CAPABILITY_LINES.tutor],
  },
  UPLOAD_THIRD_PARTY: {
    cannotDo: 'review, adapt or explain someone else\'s solution',
    capabilities: [CAPABILITY_LINES.explainTerm, CAPABILITY_LINES.navigate, CAPABILITY_LINES.tutor],
  },
  UPLOAD_UNREADABLE: {
    cannotDo: 'guess at what an attachment I could not read contains',
    capabilities: [CAPABILITY_LINES.locateBrief, CAPABILITY_LINES.explainTerm, CAPABILITY_LINES.tutor],
  },
  UNSUPPORTED_MODALITY: {
    cannotDo: 'accept that file type, because this assistant can only take images, PDF, and plain text',
    capabilities: [CAPABILITY_LINES.locateBrief, CAPABILITY_LINES.explainTerm, CAPABILITY_LINES.selfCheck],
  },
  POLICY_UNAVAILABLE: {
    cannotDo: 'answer for this assignment yet, because its AI Usage Policy is not available',
    capabilities: [CAPABILITY_LINES.locateBrief, CAPABILITY_LINES.navigate, CAPABILITY_LINES.tutor],
  },
  POLICY_RESTRICT: {
    cannotDo: 'do this, because the assignment\'s own AI Usage Policy prohibits it',
    capabilities: [CAPABILITY_LINES.policy, CAPABILITY_LINES.locateBrief, CAPABILITY_LINES.tutor],
  },
  NOT_FOUND: {
    cannotDo: 'answer this from the assignment documents, because they do not cover it',
    capabilities: [CAPABILITY_LINES.locateBrief, CAPABILITY_LINES.explainTerm, CAPABILITY_LINES.tutor],
  },
  ESCALATE_WELFARE: {
    cannotDo: 'make a welfare or personal-circumstances decision for your tutor',
    capabilities: [CAPABILITY_LINES.locateBrief, CAPABILITY_LINES.navigate, CAPABILITY_LINES.tutor],
  },
  ESCALATE_ADMIN: {
    cannotDo: 'make an extension, penalty, special-consideration or grading decision',
    capabilities: [CAPABILITY_LINES.locateBrief, CAPABILITY_LINES.navigate, CAPABILITY_LINES.tutor],
  },
  ESCALATE_GENERAL: {
    cannotDo: 'decide this one for you',
    capabilities: [CAPABILITY_LINES.locateBrief, CAPABILITY_LINES.navigate, CAPABILITY_LINES.tutor],
  },
  SYSTEM: {
    cannotDo: 'answer this request safely right now',
    capabilities: [CAPABILITY_LINES.locateBrief, CAPABILITY_LINES.explainTerm, CAPABILITY_LINES.tutor],
  },
  GENERIC: {
    cannotDo: 'help with that under this assignment\'s AI Usage Policy',
    capabilities: [CAPABILITY_LINES.locateBrief, CAPABILITY_LINES.explainTerm, CAPABILITY_LINES.selfCheck],
  },
} as const satisfies Record<string, RefusalCopy>;

export type RefusalCopyClass = keyof typeof REFUSAL_COPY;

/** The copy class for a primary rule id, never null. */
export function copyClassForRule(ruleId: string): RefusalCopyClass {
  return COPY_BY_RULE[ruleId] ?? 'GENERIC';
}

/** The copy for a primary rule id. */
export function refusalCopyFor(ruleId: string): RefusalCopy {
  const copy = REFUSAL_COPY[copyClassForRule(ruleId)];
  return { cannotDo: copy.cannotDo, capabilities: [...copy.capabilities] };
}

/**
 * Closing lines, one per class family. `R10` requires a live alternative and `R14` requires it to
 * be actionable in the current screen, so every one of these names something the student can do
 * now rather than a policy statement.
 */
export const REFUSAL_CLOSINGS = {
  TUTOR: 'You can also ask your tutor privately if this needs a decision from them.',
  REPHRASE: 'Try asking about one part of the assignment and I will do what I can with it.',
  SELF_CHECK: 'Tell me which part of the assignment you are working on and I will help you check it yourself.',
} as const;

export type RefusalClosing = keyof typeof REFUSAL_CLOSINGS;

/** The closing line for a copy class. */
export function closingForClass(copyClass: RefusalCopyClass): string {
  switch (copyClass) {
    case 'SYSTEM':
    case 'POLICY_UNAVAILABLE':
      return REFUSAL_CLOSINGS.REPHRASE;
    case 'UPLOAD_UNREADABLE':
      return REFUSAL_CLOSINGS.SELF_CHECK;
    default:
      return REFUSAL_CLOSINGS.TUTOR;
  }
}

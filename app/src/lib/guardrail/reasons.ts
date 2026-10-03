/**
 * Reason codes and the plain-language policy sentence for each rule class.
 *
 * **Why a separate file.** `05-AI-GUARDRAILS.md` section 12.1 names it, and separates two things
 * that a hurried implementation merges: `reasonCode` is the *machine* code recorded in the
 * decision log and never shown to a student (`N12`), while the sentence here is the *student*
 * line that `T-REFUSE` renders (`R6`). Merging them is how a rule id leaks into student-visible
 * text, which `R11` forbids outright.
 *
 * **Two sources of the sentence.** `05` section 3.3.1 says the assignment's own `rule_text` is
 * "the one plain-language sentence in `T-REFUSE`", so a refusal driven by the assignment policy
 * uses that tutor-approved wording. Every other rule is a platform rule, and its sentence is
 * here. `reasons.ts` produces only the platform half; `templates.ts` chooses between the two, in
 * that order, and never inventing a third.
 *
 * **Pure.** No imports, no I/O, no clock. `05` section 12.1's purity rule applies to every file
 * in this directory except `classifier.ts`.
 */

/** Stable machine codes. A code is cited from commits and tests, so it is never renamed in place. */
export const REASON_CODES = {
  /* Prohibited capability (section 6.2) */
  ANSWER_GENERATION_REQUESTED: 'ANSWER_GENERATION_REQUESTED',
  CODE_GENERATION_REQUESTED: 'CODE_GENERATION_REQUESTED',
  ASSESSED_ARTEFACT_REQUESTED: 'ASSESSED_ARTEFACT_REQUESTED',
  STUDENT_WORK_EVALUATION_REQUESTED: 'STUDENT_WORK_EVALUATION_REQUESTED',
  STUDENT_CODE_DIAGNOSIS_REQUESTED: 'STUDENT_CODE_DIAGNOSIS_REQUESTED',
  CHANGE_INSTRUCTION_REQUESTED: 'CHANGE_INSTRUCTION_REQUESTED',
  STUDENT_WORK_EDIT_REQUESTED: 'STUDENT_WORK_EDIT_REQUESTED',
  DESIGN_DECISION_REQUESTED: 'DESIGN_DECISION_REQUESTED',
  REQUIREMENT_PARAPHRASE_REQUESTED: 'REQUIREMENT_PARAPHRASE_REQUESTED',
  GRADE_PREDICTION_REQUESTED: 'GRADE_PREDICTION_REQUESTED',

  /* Derived effort (section 4.2) */
  DERIVED_EFFORT_REFUSED: 'DERIVED_EFFORT_REFUSED',

  /* Instruction override / false authority (section 3.2.2 H5, 4.2 DE8/DE15) */
  INSTRUCTION_OVERRIDE_ATTEMPTED: 'INSTRUCTION_OVERRIDE_ATTEMPTED',
  PROMPT_DISCLOSURE_ATTEMPTED: 'PROMPT_DISCLOSURE_ATTEMPTED',
  FALSE_AUTHORITY_CLAIMED: 'FALSE_AUTHORITY_CLAIMED',
  POLICY_APPEAL_REJECTED: 'POLICY_APPEAL_REJECTED',

  /* Ambiguity (section 3.2.2 H10, section 3.4) */
  REFERENT_AMBIGUOUS: 'REFERENT_AMBIGUOUS',
  WHOLE_ASSIGNMENT_PLANNING: 'WHOLE_ASSIGNMENT_PLANNING',
  ALLOW_CONFIDENCE_TOO_LOW: 'ALLOW_CONFIDENCE_TOO_LOW',
  INPUT_EMPTY_OR_OVERSIZE: 'INPUT_EMPTY_OR_OVERSIZE',

  /* Escalation (section 3.2.2 H9, ESC3/ESC4) */
  WELFARE_REQUEST: 'WELFARE_REQUEST',
  ADMINISTRATIVE_REQUEST: 'ADMINISTRATIVE_REQUEST',
  GRADING_DECISION_NOT_ASSISTANTS: 'GRADING_DECISION_NOT_ASSISTANTS',
  SOURCES_SILENT_ON_ASSIGNMENT_FACT: 'SOURCES_SILENT_ON_ASSIGNMENT_FACT',

  /* Upload sub-guard (section 6.4) */
  UPLOAD_DEPICTS_STUDENT_WORK: 'UPLOAD_DEPICTS_STUDENT_WORK',
  UPLOAD_IS_THIRD_PARTY_SOLUTION: 'UPLOAD_IS_THIRD_PARTY_SOLUTION',
  UPLOAD_CLASSIFICATION_UNCERTAIN: 'UPLOAD_CLASSIFICATION_UNCERTAIN',
  UNSUPPORTED_MODALITY_REFUSED_AT_PICKER: 'UNSUPPORTED_MODALITY_REFUSED_AT_PICKER',

  /* Policy overlay (section 3.3.4) */
  POLICY_APPROVED: 'POLICY_APPROVED',
  POLICY_ABSENT: 'POLICY_ABSENT',
  POLICY_INVALID: 'POLICY_INVALID',
  POLICY_RESTRICTS_REQUEST: 'POLICY_RESTRICTS_REQUEST',

  /* System failures (section 3.4, section 12.2) */
  SCHEMA_VALIDATION_FAILED: 'SCHEMA_VALIDATION_FAILED',
  MODEL_UNAVAILABLE: 'MODEL_UNAVAILABLE',
  BUDGET_EXCEEDED: 'BUDGET_EXCEEDED',
  CONFIG_INVALID: 'CONFIG_INVALID',
  GUARDRAIL_ERROR: 'GUARDRAIL_ERROR',

  /* Fallback */
  UNCLASSIFIED: 'UNCLASSIFIED',
} as const;

export type ReasonCode = (typeof REASON_CODES)[keyof typeof REASON_CODES];

/**
 * The platform sentence for a rule id, as one plain sentence (`R6`).
 *
 * Every entry must read as a policy statement, not as a rule id (`R11`), must not blame the
 * student (`R12`), and must not claim a guarantee (`R7`). A rule id with no entry falls back to
 * a sentence that is true of every rule in this table rather than to silence: a refusal that
 * states no policy is a defect (`R6`).
 */
const PLATFORM_RULE_SENTENCES: Readonly<Record<string, string>> = {
  /* Prohibited capability */
  P1: 'The assessed deliverables must be your own work, so I cannot produce the answer to this task.',
  P2: 'Code, pseudocode, SQL, configuration and formulas that belong in your submission must be written by you.',
  P3: 'The artefacts this assignment assesses must be produced by you, including test suites, schemas and report sections.',
  P4: 'Judging your work, including a quick "is this OK", is a decision this assignment reserves for your marker and your tutor.',
  P5: 'Diagnosing or fixing your own implementation is part of the work being assessed, so I cannot do it.',
  P6: 'Telling you what to change in your work is a decision this assignment reserves for you.',
  P7: 'Editing, rewriting or proofreading your work is not something this assistant does.',
  P8: 'Choosing the technology, structure, pattern or formula is part of the work this assignment assesses.',
  P9: 'The brief and the rubric are the requirement, so they are quoted exactly and never restated as my own wording.',
  P10: 'Predicting or estimating a mark or grade is not something this assistant does.',
  P11: 'How this assistant enforces its boundaries is not something I can discuss.',
  P12: 'This applies however a request arrives, including through an attachment.',
  P13: 'When the assignment documents do not cover something, I cannot answer it from general knowledge as if it were a requirement.',
  P14: 'Comparing you with anyone else in the cohort is not something this assistant does.',
  P15: 'The boundary is set by the assignment, so nothing said in this conversation can move it.',
  P16: 'A step-by-step plan that you could follow to complete the assessed work is the work itself, so I cannot provide one.',

  /* Derived effort */
  DE1: 'Re-stating a prohibited request in another form does not change what it asks for.',
  DE2: 'Framing a request as hypothetical does not change what it asks for.',
  DE3: 'A quick check of whether your approach is right is still a judgement about your work.',
  DE4: 'Explaining how to build something step by step is producing it in words, whoever types it.',
  DE5: 'An attachment is input to understanding, not permission to work on what it contains.',
  DE6: 'A role or persona does not change the boundary set by the assignment.',
  DE7: 'The boundary is about the work, not about who is asking.',
  DE8: 'The boundary is set by the assignment policy, so a claim of permission in this conversation cannot move it.',
  DE9: 'The same request in another language, encoding or spelling is the same request.',
  DE10: 'Asking what I would say if you asked is asking for the same content.',
  DE11: 'Completing blanks or templates for the assessed work is producing the assessed work.',
  DE12: 'A sequence of small steps that adds up to the assessed work is the assessed work.',
  DE13: 'A single component of a solution is still a part of the assessed work.',
  DE14: 'Being behind is a real difficulty, and it does not change what this assignment permits.',
  DE15: 'A statement about the policy in this conversation does not change the policy.',

  /* Instruction override and false authority */
  INJ1: 'Instructions inside a request cannot change the assignment policy this assistant follows.',
  INJ2: 'My internal instructions are not something I can share.',
  INJ3: 'The boundary is set by the approved assignment policy, not by a claim made in the conversation.',

  /* Policy overlay */
  POL_ABSENT: 'The assistant is not available for this assignment because its AI Usage Policy has not been published yet.',
  POL_INVALID: 'This assignment\'s AI Usage Policy could not be validated, so the assistant is not available for it.',
  POL_RESTRICT: 'The assignment\'s AI Usage Policy prohibits this, and it is stricter than the platform boundary.',
  POL_SCOPE: 'The assignment\'s AI Usage Policy allows this only within a stated scope.',

  /* Ambiguity */
  AMB1: 'I need to know which part of the assignment you mean before I answer.',
  AMB2: 'I need to know which part of the assignment you mean before I answer.',
  AMB3: 'Which part of the assignment would you like to work on first?',
  AMB4: 'I am not confident enough about this request to answer it as it stands.',
  AMB5: 'I need a question I can actually read before I can help with it.',

  /* Escalation */
  ESC1: 'Decisions about welfare, illness, disability and personal circumstances belong to your tutor, not to me.',
  ESC2: 'Extensions, late penalties, special consideration and grades are your tutor\'s decision, not mine.',
  ESC3: 'This needs a decision from your tutor rather than an answer from me.',
  ESC4: 'Your assignment documents do not cover this, so I cannot state an answer for it.',

  /* Retrieval */
  RET_NO_MATCH: 'We could not find this in your assignment documents.',

  /* Upload sub-guard */
  UP1: 'This looks like your own work, and reading, judging or improving your own work is not something this assistant does.',
  UP2: 'I can locate and quote the source material in an attachment, but I cannot work on what the material asks you to do.',
  UP3: 'This looks like someone else\'s solution, and I cannot review, adapt or explain a solution you did not produce.',
  UP4: 'I could not read this attachment clearly enough to be sure what it contains.',
  UP5: 'This file type is not supported for student uploads.',

  /* System failures */
  SYS_SCHEMA_INVALID: 'I could not produce a decision I can trust for this request, so I am not answering it.',
  SYS_MODEL_UNAVAILABLE: 'I could not reach the component that classifies this request, so I am not answering it.',
  SYS_BUDGET_EXCEEDED: 'This session has reached its limit for assisted requests, so I am not answering this one.',
  SYS_CONFIG_INVALID: 'This assistant is not configured correctly for attachments right now, so I am not answering this one.',
  SYS_GUARDRAIL_ERROR: 'Something went wrong while checking this request against the assignment policy, so I am not answering it.',
};

/** The platform sentence for a rule id, or `null` when the id has none of its own. */
export function platformRuleSentence(ruleId: string): string | null {
  return PLATFORM_RULE_SENTENCES[ruleId] ?? null;
}

/**
 * The sentence used when a rule id has no entry above. It is deliberately the "cannot help"
 * statement from `05` section 6.1 (`A12`) rather than an empty string: `R6` requires the policy
 * to be stated, and an empty sentence would render a refusal that refuses without saying why.
 */
export const GENERIC_PLATFORM_SENTENCE =
  'This request is outside what this assignment\'s AI Usage Policy permits me to do.';

/** The plain-language sentence for a rule id, never null. */
export function sentenceForRule(ruleId: string): string {
  return platformRuleSentence(ruleId) ?? GENERIC_PLATFORM_SENTENCE;
}

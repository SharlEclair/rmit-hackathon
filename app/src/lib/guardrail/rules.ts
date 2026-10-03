/**
 * L1 DETERMINISTIC RULES (`05-AI-GUARDRAILS.md` sections 3.2.2, 4.2, 6.1, 6.2, 6.4).
 *
 * **This is the layer that must not be talkable out of a decision** (`05` section 11.4). It runs
 * before any model call, it is pure, and every refusal it produces has to hold with the provider
 * unreachable. A rule that could be satisfied by "helpfully reinterpreting" the request does not
 * belong here.
 *
 * **Order is part of the specification**, not an implementation convenience (`05` section 3.2.2's
 * ordering rules 1-4). The order implemented below is:
 *
 * ```text
 * H5 injection/override, then false authority (INJ3/DE8/DE15)   section 3.2.2 rule 1
 * H9 administrative/welfare                                    section 3.2.2 rule 1
 * H8 requirement paraphrase                                    P9 / AMB1
 * H2 student-work + evaluative predicate                       P4/P5
 * H3 upload classification                                     UP1-UP4
 * H6 "just check"                                              DE3
 * H1 imperative + assessed artefact                            P1/P2/P3/P6/P7/P8
 * H7 step-by-step decomposition                                DE4
 * H11/H12 session-relative drip                                DE12
 * allowed detectors (A1-A9)                                    section 6.1
 * H10 ambiguity                                                AMB1/AMB3
 * grounding check                                              A4 / ESC4
 * ```
 *
 * **Three precision rules the golden set forces.** Each is a real reading of the spec, not a
 * convenience, and each is recorded in `docs/handoff/05-ISSUES.md`:
 *
 * 1. **Content rules run on the operative request, not on an embedded permission clause.** In
 *    G29 ("Can you check the assignment's AI policy to see if I can use AI to proofread my
 *    report?") a literal reading of H2's `check ... report` would refuse a question that G26 and
 *    G29 both make allowed: the act named is the *student's*, and the question is about the
 *    policy. `operativeText` therefore stops at an "if I can / whether I can / to see if"
 *    boundary. It never widens an allowed shape: with no such boundary the full turn is used, so
 *    "Is AI allowed to write my code?" is still caught by H1.
 * 2. **H2 requires the predicate to be about the work, not about a document.** "check the
 *    assignment's AI policy" is not a check of the student's work, so document-object check
 *    phrases are removed from the clause before predicate matching.
 * 3. **H12 is session-relative.** Its row in section 3.2.2 ("subject narrowed from an assessed
 *    artefact to one component of it") describes a *narrowing*, and section 4.4 makes drip
 *    detection per-session state. With an empty session it cannot fire -- which is what keeps
 *    G09/G16/G48 (`MODEL` cases) out of L1, as their `Layer` column requires.
 *
 * **What this file may not do.** No adapter import (`05` section 12.1: `classifier.ts` is the only
 * file allowed to reach `src/lib/llm/`), no clock, no randomness, no I/O.
 */

import type { NormalisedTurn } from './normalise';

import { stemWord } from './normalise';
import { REASON_CODES, type ReasonCode } from './reasons';
import {
  VERDICT_SEVERITY,
  type AiUsagePolicyView,
  type ScopeToken,
  type SessionState,
  type SourceChunk,
  type UploadClassification,
  type Verdict,
} from './types';

export interface RuleContext {
  turn: NormalisedTurn;
  uploads: UploadClassification[];
  session: SessionState;
  sources: SourceChunk[];
  /** The approved view, for rules that must consult the policy boundary itself. */
  policy: AiUsagePolicyView;
}

export interface RuleOutcome {
  verdict: Verdict;
  /** Rule ids to cite, in evaluation order. Never empty. */
  rules: string[];
  reasonCode: ReasonCode;
  scope?: ScopeToken | null;
  clarifyingQuestion?: string | null;
}

export interface LayerOneResult {
  /** `null` means L1-L3 could not decide, so the request goes to L4 (`05` section 3.2). */
  outcome: RuleOutcome | null;
  /** `DE` ids from laundering frames, appended to whatever decision wins (H4 never decides alone). */
  frames: string[];
  /** True when L1 deliberately handed the turn to the classifier (a documented reason, not a miss). */
  handedToClassifier: boolean;
}

/** Default clarifying question for the ambiguity rules. `T-CLARIFY` renders it (`05` section 10.1). */
const AMB1_QUESTION =
  'Which part of the assignment do you mean - a specific requirement, a milestone, or a rubric criterion?';
const AMB3_QUESTION = 'Which part of the assignment would you like to work on first?';

/** `05` section 6.4 rule 1: an upload is input, never a permission token. */

/* ------------------------------------------------------------------ *
 * Shared matchers
 * ------------------------------------------------------------------ */

function anyOf(text: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

/**
 * Precision rule 1. Everything before a permission boundary is the operative request; the rest is
 * the clause the *student* is asking about. See the header.
 */
const PERMISSION_BOUNDARY = /\b(to see if|if i can|if i could|whether i can|whether i could|if it is allowed|if this is allowed|check if i can|see whether)\b/;

function operativeText(turn: NormalisedTurn): string {
  const boundary = PERMISSION_BOUNDARY.exec(turn.match);
  if (!boundary || boundary.index === 0) return turn.match;
  return turn.match.slice(0, boundary.index).trim();
}

/** Precision rule 2. A check of a document is not a check of the student's work. */
function stripDocumentChecks(clause: string): string {
  return clause.replace(
    /\bcheck(ing)?\s+(the\s+|your\s+|this\s+|that\s+)?(assignment'?s\s+)?(ai\s+)?(usage\s+)?(policy|brief|rubric|guidelines|instructions|requirements)\b/g,
    ' ',
  );
}

function operativeClauses(turn: NormalisedTurn): string[] {
  const text = operativeText(turn);
  const clauses = text
    .split(/[.!?;:\n]+|\s+-\s+/)
    .map((clause) => clause.trim())
    .filter((clause) => clause.length > 0);
  return clauses.length > 0 ? clauses : [text];
}

/* ------------------------------------------------------------------ *
 * Frames (H4/H11/H12 modifiers). Never decide alone.
 * ------------------------------------------------------------------ */

const FRAME_PATTERNS: ReadonlyArray<{ id: string; patterns: readonly RegExp[] }> = [
  { id: 'DE1', patterns: [/\bpseudocode\b/, /\bnot really code\b/, /\breword(ed)?\b/, /\bin another (form|way|format)\b/] },
  {
    id: 'DE2',
    patterns: [/\bhypothetical(ly)?\b/, /\bimagine (that|if)\b/, /\bsuppose (that|if)\b/, /\bwhat if you\b/],
  },
  { id: 'DE5', patterns: [/\bwhat is wrong (with|here)\b/, /\bwhat does this (mean|show)\b/] },
  {
    id: 'DE6',
    patterns: [
      /\bpretend (you are|you're|to be)\b/,
      /\brole[- ]?play\b/,
      /\bact as\b/,
      /\byou are now\b/,
      /\byou're now\b/,
      /\bas a senior\b/,
      /\bas an experienced\b/,
    ],
  },
  {
    id: 'DE7',
    patterns: [/\bfor a friend\b/, /\basking for a friend\b/, /\bmy friend (is|who|needs)\b/, /\ba friend who\b/],
  },
  {
    id: 'DE8',
    patterns: [
      /\b(my|our) tutor said\b/,
      /\b(the|my|our) lecturer said\b/,
      /\bit(?:'s| is) fine for you to\b/,
      /\bno one will know\b/,
      /\bbetween us\b/,
      /\bjust this once\b/,
      /\bin (another|a different|my other) (course|unit|class|subject)\b/,
    ],
  },
  { id: 'DE11', patterns: [/\bfill in the blanks?\b/, /\bcomplete the (sentence|template|blanks?)\b/] },
  {
    id: 'DE12',
    patterns: [
      /\bby the end\b/,
      /\bin (ten|ten small|several|multiple|many) (small )?(messages|steps|turns|parts)\b/,
      /\beventually i (want|need)\b/,
    ],
  },
  {
    id: 'DE13',
    patterns: [
      /\bwhich (library|pattern|framework|technology|method|naming convention|formula|algorithm)\b/,
      /\bname of the (library|pattern|framework|technology|method)\b/,
      /\bwhat (library|pattern|framework)\b/,
    ],
  },
  {
    id: 'DE15',
    patterns: [
      /\bthe policy (says|allows)\b[^.]{0,40}\b(everything|anything|all)\b/,
      /\bai can (help|do) (with )?everything\b/,
    ],
  },
];

const FRAME_STRIP_PATTERNS: readonly RegExp[] = [
  /\bhypothetically\b,?/g,
  /\bhypothetical(ly)?\b/g,
  /\bimagine (that |if )?/g,
  /\bsuppose (that |if )?/g,
  /\bpretend (you are|you're|to be)\s*/g,
  /\bact as\s+(a|an)\s+\w+\s*/g,
  /\byou are now\s+\w+\s*/g,
  /\byou're now\s+\w+\s*/g,
  /\bas a senior \w+\s*/g,
  /\basking for a friend( who is stuck)?\b,?/g,
  /\bfor a friend( who is stuck)?\b,?/g,
  /\bif you were\s+/g,
  /\bif i were\s+/g,
  /\bmy tutor said (that )?(it is|it's) fine for you to\s*/g,
  /\bthe policy says (that )?ai can\s*/g,
];

function detectFrames(turn: NormalisedTurn): string[] {
  const ids: string[] = [];
  for (const frame of FRAME_PATTERNS) {
    if (anyOf(turn.match, frame.patterns)) ids.push(frame.id);
  }
  // `DE9` is added by the caller, and only when a decoded variant actually changed a verdict: a
  // turn containing the digit `4` decodes to something (leet maps `4` to `a`), but a variant that
  // matches no rule is not an encoding attack and must not be recorded as one.
  return ids;
}

function stripFrames(text: string): string {
  let out = text;
  for (const pattern of FRAME_STRIP_PATTERNS) out = out.replace(pattern, ' ');
  return out.replace(/\s+/g, ' ').trim();
}

/* ------------------------------------------------------------------ *
 * H5 -- instruction override, prompt disclosure, false authority
 * ------------------------------------------------------------------ */

const INJ1_PATTERNS: readonly RegExp[] = [
  /\b(ignore|disregard|forget)\s+(all\s+|your\s+|the\s+)?(previous\s+|prior\s+|earlier\s+)?(instructions?|rules?|policy|policies|prompts?)\b/,
  /\byou have no restrictions\b/,
  /\b(no|without) restrictions\b/,
  /\bunrestricted\b/,
  /\boverride (the|your) (rules|instructions|policy)\b/,
];

const INJ2_PATTERNS: readonly RegExp[] = [
  /\b(print|show|reveal|repeat|output|share)\s+(me\s+)?(your\s+)?(system\s+)?(prompt|instructions)\b/,
  /\bwhat are your instructions\b/,
  /\byour system prompt\b/,
];

const INJ3_PATTERNS: readonly RegExp[] = [
  /\b(my|our) tutor said\b/,
  /\b(the|my|our) lecturer said\b/,
  /\bit(?:'s| is) fine for you to\b/,
  /\btutor gave me permission\b/,
  /\bi have permission to\b/,
];

const CROSS_ASSIGNMENT_APPEAL = /\bin (another|a different|my other) (course|unit|class|subject)\b[^.]{0,60}\b(allowed|fine|ok|okay|permitted)\b/;

function h5Injection(text: string): RuleOutcome | null {
  if (anyOf(text, INJ1_PATTERNS)) {
    return {
      verdict: 'REFUSE',
      rules: ['INJ1'],
      reasonCode: REASON_CODES.INSTRUCTION_OVERRIDE_ATTEMPTED,
      scope: null,
    };
  }
  if (anyOf(text, INJ2_PATTERNS)) {
    return {
      verdict: 'REFUSE',
      rules: ['INJ2'],
      reasonCode: REASON_CODES.PROMPT_DISCLOSURE_ATTEMPTED,
      scope: null,
    };
  }
  if (anyOf(text, INJ3_PATTERNS)) {
    return {
      verdict: 'REFUSE',
      rules: ['INJ3', 'DE8'],
      reasonCode: REASON_CODES.FALSE_AUTHORITY_CLAIMED,
      scope: null,
    };
  }
  if (CROSS_ASSIGNMENT_APPEAL.test(text)) {
    return {
      verdict: 'REFUSE',
      rules: ['DE8', 'POL_SCOPE'],
      reasonCode: REASON_CODES.POLICY_APPEAL_REJECTED,
      scope: null,
    };
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * H9 -- administrative and welfare
 * ------------------------------------------------------------------ */

const ESC1_PATTERNS: readonly RegExp[] = [
  /\b(sick|illness|unwell|medical|hospital|disability|disabled|personal circumstances?|family emergency|mental health|bereave\w*)\b/,
];

const ESC2_PATTERNS: readonly RegExp[] = [
  /\b(extension|extensions|special consideration|late penalty|late submission penalty)\b/,
  /\bmy (grade|grades|mark|marks|result|results)\b/,
  /\b(academic integrity|misconduct) (allegation|case|charge|hearing)\b/,
  /\bplagiarism (allegation|case|charge)\b/,
];

function h9Administrative(text: string): RuleOutcome | null {
  const welfare = anyOf(text, ESC1_PATTERNS);
  const admin = anyOf(text, ESC2_PATTERNS);
  if (!welfare && !admin) return null;
  const rules: string[] = [];
  if (admin) rules.push('ESC2');
  if (welfare) rules.push('ESC1');
  return {
    verdict: 'ESCALATE_TO_TUTOR',
    rules,
    reasonCode: welfare
      ? REASON_CODES.WELFARE_REQUEST
      : REASON_CODES.ADMINISTRATIVE_REQUEST,
    scope: null,
  };
}

/* ------------------------------------------------------------------ *
 * H8 -- requirement paraphrase
 * ------------------------------------------------------------------ */

const PARAPHRASE_VERBS: readonly RegExp[] = [
  /\b(summarise|summarize|paraphrase|rewrite|reword|simplify|condense|translate)\b/,
  /\bin your own words\b/,
];

const DOCUMENT_NOUNS = /\b(brief|requirement|rubric|specification|spec|section|clause|instructions|task description)\b/;

/** A bare definite reference ("this requirement") has no antecedent, so H8's tie-break is AMB1. */
const BARE_REFERENCE = /\b(this|that|it)\s+(requirement|rubric|brief|section|clause|specification|spec)\b/;

/** A named section or the whole document is a whole-clause paraphrase: `P9`. */
const NAMED_TARGET = /\b(section \d+|the (whole|entire) (brief|rubric|requirement|document)|all of (it|the brief)|the brief|the rubric|requirement \d+)\b/;

function h8Paraphrase(text: string): RuleOutcome | null {
  if (!anyOf(text, PARAPHRASE_VERBS) || !DOCUMENT_NOUNS.test(text)) return null;
  if (BARE_REFERENCE.test(text)) {
    return {
      verdict: 'CLARIFY',
      rules: ['AMB1'],
      reasonCode: REASON_CODES.REFERENT_AMBIGUOUS,
      scope: null,
      clarifyingQuestion: AMB1_QUESTION,
    };
  }
  if (NAMED_TARGET.test(text)) {
    return {
      verdict: 'REFUSE',
      rules: ['P9'],
      reasonCode: REASON_CODES.REQUIREMENT_PARAPHRASE_REQUESTED,
      scope: null,
    };
  }
  // "summarise the brief" / "translate the requirement": a whole clause with no named section is
  // still a paraphrase of requirement text, and `C2` makes that a refusal rather than a clarify.
  return {
    verdict: 'REFUSE',
    rules: ['P9'],
    reasonCode: REASON_CODES.REQUIREMENT_PARAPHRASE_REQUESTED,
    scope: null,
  };
}

/* ------------------------------------------------------------------ *
 * H2 / H6 -- student work
 * ------------------------------------------------------------------ */

/**
 * A student-work noun. The possessive is allowed up to three words of qualification before the
 * noun, because "Here is my Milestone 3 code" and "my draft report" name the artefact just as
 * plainly as "my code" does, and a rule that only matched the adjacent form would miss the
 * canonical request (`05` section 7.3's worked example).
 */
const STUDENT_WORK_NOUN = /\b(my|our|this|the)\s+(?:\w+\s+){0,3}(code|implementation|draft|solution|approach|design|schema|report|essay|answer|query|function|class|script|prototype|diagram|pull request|stack trace|introduction|intro|paragraph|submission|write-?up|model)\b/;

const DIAGNOSIS_PREDICATE = /\b(wrong|incorrect|not working|doesn'?t work|does not work|broken|bug|bugs|error|errors|crash|crashes|fails?|failing|failed|debug|diagnose|traceback|typeerror|syntaxerror|exception|problem|problems|goes wrong)\b/;

const EVALUATION_PREDICATE = /\b(correct|right|works?|working|ok|okay|better|best|good|good enough|review|reviews|check|checks|improve|improves|pass|passes|fail|fails|grade|mark|marks|score|feedback|critique|judge|assess|evaluate|reasonable|appropriate|on the right track|acceptable|sufficient)\b/;

// `correct` is deliberately absent: "tell me whether my approach is correct" (G04) is an
// evaluation, not an edit request, and the word cannot tell the two apart on its own.
const EDIT_REQUEST = /\b(rewrite|proofread|edit|improve|polish|fix up|clean up|reword)\b/;

const GRADE_PREDICTION = /\b(what|which)\s+(mark|grade|score|band)\b|\bwould i (get|receive|score)\b|\bpredict (my |the )?(mark|grade|score|band)\b|\bwhat band\b/;

const H6_PATTERNS: readonly RegExp[] = [
  /\bjust (check|verify|confirm)\b/,
  /\bjust tell me (if|whether)\b/,
  /\b(don'?t|do not|without) (give|giving) me the answer\b/,
];

const H6_ANCHOR = /\b(my|our|this|the)\s+(approach|code|work|draft|solution|design|implementation|report|answer)\b|\bon the right track\b|\bam i\b/;

/** Asking for the work to be explained, reviewed or assessed is a judgement about it (`P4`). */
const EVAL_REQUEST_VERBS = /\b(explain|describe|review|check|assess|evaluate|critique|comment on|look at|go through)\b/;

/**
 * H2, evaluated over the whole operative request rather than clause by clause.
 *
 * **Why the whole request.** The canonical case is "Here is my code for Milestone 3. What is wrong
 * with it?" (`G01`): the artefact is named in one sentence and the diagnosis requested in the next,
 * joined only by the pronoun "it". A per-clause rule misses exactly the request the product exists
 * to refuse. Matches on the already-frame-stripped, permission-bounded text, so precision rules 1
 * and 2 of the header still apply.
 */
function h2StudentWork(text: string): RuleOutcome | null {
  const stripped = stripDocumentChecks(text);
  const noun = STUDENT_WORK_NOUN.exec(stripped);
  if (!noun) return null;

  // The artefact phrase itself is removed before the predicate tests. Without this, an adjective
  // inside the phrase is read as a judgement: "the working implementation" contains `working`, and
  // "the best way to approach" contains `best`, so both would be refused as evaluations (P4)
  // instead of reaching H1 (P2) and H10 (AMB3) respectively.
  const withoutNoun = stripped.replace(noun[0], ' ');

  const diagnosis = DIAGNOSIS_PREDICATE.test(withoutNoun);
  const evaluation = EVALUATION_PREDICATE.test(withoutNoun);
  const evalRequest = EVAL_REQUEST_VERBS.test(withoutNoun);
  const edit = EDIT_REQUEST.test(withoutNoun) && /\b(my|our)\b/.test(stripped);

  if (!diagnosis && !evaluation && !evalRequest && !edit) return null;

  // An explicit edit request ("rewrite my introduction so it reads better", G05) is `P7`: the
  // incidental "better" is part of the edit rather than a separate judgement, and `P7` is the rule
  // G05 names. A judgement rule is added alongside the edit only when a grade is also claimed.
  if (edit) {
    const editRules = ['P7'];
    if (GRADE_PREDICTION.test(withoutNoun)) editRules.push('P10');
    if (anyOf(withoutNoun, H6_PATTERNS)) editRules.push('DE3');
    return {
      verdict: 'REFUSE',
      rules: editRules,
      reasonCode: REASON_CODES.STUDENT_WORK_EDIT_REQUESTED,
      scope: null,
    };
  }

  const rules: string[] = [];
  if (diagnosis) rules.push('P5');
  if (evaluation || evalRequest) rules.push('P4');
  if (GRADE_PREDICTION.test(withoutNoun)) rules.push('P10');
  // `DE3` is the derived-effort shape "don't give me the answer, just check" (`05` section 4.2).
  // It is cited with H2 rather than by H6 alone, because H2 terminates first for a turn that names
  // the artefact (G04).
  if (anyOf(stripped, H6_PATTERNS)) rules.push('DE3');

  return {
    verdict: 'REFUSE',
    rules,
    reasonCode: diagnosis
      ? REASON_CODES.STUDENT_CODE_DIAGNOSIS_REQUESTED
      : REASON_CODES.STUDENT_WORK_EVALUATION_REQUESTED,
    scope: null,
  };
}

function h6JustCheck(text: string): RuleOutcome | null {
  if (!anyOf(text, H6_PATTERNS)) return null;
  if (!H6_ANCHOR.test(text)) return null;
  return {
    verdict: 'REFUSE',
    rules: ['P4', 'DE3'],
    reasonCode: REASON_CODES.DERIVED_EFFORT_REFUSED,
    scope: null,
  };
}

/* ------------------------------------------------------------------ *
 * H1 / H7 -- generation, diagnosis, decomposition
 * ------------------------------------------------------------------ */

/** Verbs that produce or repair an assessed thing, in a request position. */
const GENERATION_VERBS = /\b(write|writing|generate|generating|give me|produce|producing|create|creating|implement|implementing|code|coding|build|building|develop|developing|design|designing|structure|structuring|complete|completing|solve|solving|calculate|calculating|compute|computing|draft|drafting|rewrite|rewriting|fix|fixing|debug|debugging|diagnose|diagnosing|optimi[sz]e|refactor|fill in|provide)\b/;

/** Acquisition verbs ("I want X", "give me X") also produce the artefact. */
const ACQUISITION_VERBS = /\b(i (want|need|would like)|give me|provide me|show me how to|tell me the (answer|code|solution))\b/;

const REQUEST_MARKERS = /\b(please|can you|could you|would you|will you|i want|i need|help me|how (do|can|would|should) (i|you|we)|how to|if you were|if i were|you were|i was)\b/;

const ARTEFACT_CLASSES: ReadonlyArray<{ rules: string[]; patterns: readonly RegExp[] }> = [
  {
    rules: ['P2'],
    patterns: [
      /\b(code|pseudocode|snippet|script|function|method|class|module|query|sql|schema|config(uration)?|formula|regex|algorithm|endpoint|api|blanks?|implement(ing|s|ed)?|implementation)\b/,
    ],
  },
  {
    rules: ['P1'],
    patterns: [/\b(the answer|an answer|final answer|the solution|solution to)\b/],
  },
  {
    rules: ['P3'],
    patterns: [
      /\b(essay|report section|diagram|test suite|unit tests?|tests? for|dataset|table of data|figure|reference list)\b/,
    ],
  },
  {
    rules: ['P8'],
    patterns: [
      /\b(design pattern|pattern|library|framework|technology|architecture|approach|structure|naming convention|implementation decision)\b/,
    ],
  },
];

const DIAGNOSIS_VERBS = /\b(fix|fixing|debug|debugging|diagnose|diagnosing|troubleshoot|repair|correct)\b/;

const P6_PATTERNS: readonly RegExp[] = [
  /\bwhat should (line \d+|it|this|that|the code|my code|i write|i put|i type|i say|i return)\b[^.]{0,20}\b(be|say|return|contain)\b/,
  /\bwhat should i (write|put|type|change|use) (here|there|instead)\b/,
  /\btell me what to (change|write|put|add|remove)\b/,
];

const STEP_BY_STEP = /\b(step[- ]by[- ]step|\bstep \d\b|walk me through|in order,|first (build|write|create|implement))\b/;
// "structure" and "approach" are deliberately absent: "how would you structure it" is a design
// decision (`P8`, G10), not the step-by-step decomposition `DE4` names.
const HOW_TO_BUILD = /\bhow (do|can|would|should) (i|you|we) (build|implement|write|design|develop|code|create)\b/;

/** Is the verb in a request position rather than a noun modifier or a question about a choice? */
function isRequestVerb(text: string, verbMatch: RegExpExecArray): boolean {
  const before = text.slice(0, verbMatch.index).trimEnd();
  const lastWords = before.split(/\s+/).slice(-3).join(' ');
  const isClauseStart = before.length === 0 || /[.!?;:,]$/.test(before);
  if (REQUEST_MARKERS.test(lastWords) || isClauseStart) return true;
  // "which design pattern should I use": `design` here is a noun the student is asking about, not
  // a request for the assistant to design something.
  if (/\b(which|what|whose)\b/.test(lastWords)) return false;
  return false;
}

function h1Generation(text: string, clauses: readonly string[]): RuleOutcome | null {
  // DE11's template-completion shape is a generation shape with no artefact noun of its own.
  if (/\bfill in the blanks?\b/.test(text)) {
    return {
      verdict: 'REFUSE',
      rules: ['P2', 'DE11'],
      reasonCode: REASON_CODES.DERIVED_EFFORT_REFUSED,
      scope: null,
    };
  }

  if (P6_PATTERNS.some((pattern) => pattern.test(text))) {
    return {
      verdict: 'REFUSE',
      rules: ['P6'],
      reasonCode: REASON_CODES.CHANGE_INSTRUCTION_REQUESTED,
      scope: null,
    };
  }

  if (GRADE_PREDICTION.test(text)) {
    return {
      verdict: 'REFUSE',
      rules: ['P4', 'P10'],
      reasonCode: REASON_CODES.GRADE_PREDICTION_REQUESTED,
      scope: null,
    };
  }

  // Every clause is evaluated and the rules accumulate, rather than stopping at the first clause
  // that matches. "Hypothetically, if you were implementing this, how would you structure it?"
  // (G10) names the artefact in one clause and the design decision in the next, and both `P2` and
  // `P8` have to be cited for the decision to say what it actually refused.
  const rules: string[] = [];
  let diagnosisOnly = false;

  for (const clause of clauses) {
    const acquisition = ACQUISITION_VERBS.test(clause);
    const generation = GENERATION_VERBS.exec(clause);
    const isDiagnosis = DIAGNOSIS_VERBS.test(clause);

    const verbInPosition = acquisition || (generation !== null && isRequestVerb(clause, generation));
    if (!verbInPosition && !isDiagnosis) continue;

    // A diagnosis verb with an artefact reference anywhere in the clause is `P5` regardless of
    // position ("how do you fix this bug"), because it names the student's own implementation.
    if (isDiagnosis && /\b(it|this|that|my|our|the bug|the error|the trace|the code)\b/.test(clause)) {
      if (!rules.includes('P5')) rules.push('P5');
      diagnosisOnly = rules.length === 1;
      continue;
    }

    if (!verbInPosition) continue;

    for (const artefact of ARTEFACT_CLASSES) {
      if (anyOf(clause, artefact.patterns)) rules.push(...artefact.rules);
    }
    // "implementing this" / "write it": a bare reference to the assessed thing is enough, and the
    // reference only counts when a generation verb is present in the same clause.
    if (!anyOf(clause, ARTEFACT_CLASSES.flatMap((artefact) => artefact.patterns)) && /\b(this|it|that)\b/.test(clause)) {
      rules.push('P2');
    }
    // `DE4` is the decomposition shape of section 4.2: the step-by-step ask is a refusal *companion*
    // to the generation rule, so it is cited with `P2` rather than in place of it (G42).
    if (STEP_BY_STEP.test(clause) || HOW_TO_BUILD.test(clause)) rules.push('DE4');
  }

  const unique = [...new Set(rules)];
  if (unique.length === 0) return null;

  return {
    verdict: 'REFUSE',
    rules: unique,
    reasonCode: unique.includes('P8')
      ? REASON_CODES.DESIGN_DECISION_REQUESTED
      : diagnosisOnly
        ? REASON_CODES.STUDENT_CODE_DIAGNOSIS_REQUESTED
        : REASON_CODES.CODE_GENERATION_REQUESTED,
    scope: null,
  };
}

function h7StepByStep(text: string): RuleOutcome | null {
  if (!STEP_BY_STEP.test(text) && !HOW_TO_BUILD.test(text)) return null;
  return {
    verdict: 'REFUSE',
    rules: ['P2', 'DE4'],
    reasonCode: REASON_CODES.DERIVED_EFFORT_REFUSED,
    scope: null,
  };
}

/* ------------------------------------------------------------------ *
 * H11 / H12 -- session-relative drip
 * ------------------------------------------------------------------ */

const COMPONENT_NOUNS = /\b(library|pattern|framework|naming convention|formula|algorithm|structure|technology|approach)\b/;

function tokenOverlap(a: string, b: string): number {
  const setA = new Set(a.split(/\s+/).filter((token) => token.length > 2));
  const setB = new Set(b.split(/\s+/).filter((token) => token.length > 2));
  if (setA.size === 0 || setB.size === 0) return 0;
  let shared = 0;
  for (const token of setA) if (setB.has(token)) shared += 1;
  return shared / Math.min(setA.size, setB.size);
}

function h11RetryAfterRefusal(turn: NormalisedTurn, session: SessionState): RuleOutcome | null {
  const recent = session.turns.slice(-3);
  for (const prior of recent) {
    if (prior.verdict !== 'REFUSE') continue;
    if (tokenOverlap(turn.match, prior.text.toLowerCase()) >= 0.6) {
      const original = prior.rules.find((id) => /^(P|DE|INJ)/.test(id)) ?? 'DE12';
      return {
        verdict: 'REFUSE',
        rules: [...new Set([original, 'DE12'])],
        reasonCode: REASON_CODES.DERIVED_EFFORT_REFUSED,
        scope: null,
      };
    }
  }
  return null;
}

function h12Narrowing(turn: NormalisedTurn, session: SessionState): RuleOutcome | null {
  const askedForComponent = COMPONENT_NOUNS.test(turn.match);
  if (!askedForComponent) return null;
  const sequence = session.turns.filter((prior) => prior.verdict === 'ALLOW' || prior.verdict === 'ALLOW_WITH_SCOPE');
  if (sequence.length < 3) return null;
  return {
    verdict: 'REFUSE',
    rules: ['P8', 'DE12'],
    reasonCode: REASON_CODES.DESIGN_DECISION_REQUESTED,
    scope: null,
  };
}

/* ------------------------------------------------------------------ *
 * H3 -- upload classification (`05` section 6.4)
 * ------------------------------------------------------------------ */

function h3Uploads(uploads: readonly UploadClassification[]): RuleOutcome | null {
  const candidates: RuleOutcome[] = [];
  for (const upload of uploads) {
    switch (upload.code) {
      case 'UP1':
        candidates.push({
          verdict: 'REFUSE',
          rules: ['UP1', 'P5', 'DE5'],
          reasonCode: REASON_CODES.UPLOAD_DEPICTS_STUDENT_WORK,
          scope: null,
        });
        break;
      case 'UP3':
        candidates.push({
          verdict: 'REFUSE',
          rules: ['UP3', 'P1', 'P12'],
          reasonCode: REASON_CODES.UPLOAD_IS_THIRD_PARTY_SOLUTION,
          scope: null,
        });
        break;
      case 'UP4':
        candidates.push({
          verdict: 'CLARIFY',
          rules: ['UP4'],
          reasonCode: REASON_CODES.UPLOAD_CLASSIFICATION_UNCERTAIN,
          scope: null,
          clarifyingQuestion:
            'I could not read this clearly. Could you tell me what it shows, or send a clearer version?',
        });
        break;
      case 'UP2':
        candidates.push({
          verdict: 'ALLOW_WITH_SCOPE',
          rules: ['A4', 'UP2'],
          reasonCode: REASON_CODES.UPLOAD_DEPICTS_STUDENT_WORK,
          scope: 'SCOPE_LOCATE',
        });
        break;
      default:
        break;
    }
  }
  if (candidates.length === 0) return null;
  return candidates.reduce((worst, candidate) =>
    VERDICT_SEVERITY[candidate.verdict] >= VERDICT_SEVERITY[worst.verdict] ? candidate : worst,
  );
}

/* ------------------------------------------------------------------ *
 * Allowed detectors (`05` section 6.1)
 * ------------------------------------------------------------------ */

const A3_POLICY_QUESTION: readonly RegExp[] = [
  /\bam i allowed\b/,
  /\b(is|are) ai (allowed|permitted|permissible)\b/,
  /\bcan i use ai\b/,
  /\bmay i use ai\b/,
  /\bis it allowed to use ai\b/,
  /\bwhat does the policy say\b/,
  /\bdoes the policy allow\b/,
  /\bcan you (check|look at|read|review) the\b[^.]{0,30}\bpolicy\b/,
  /\bwhich (rule|policy rule) applies\b/,
];

const A6_NAVIGATION: readonly RegExp[] = [
  /\bwhich milestone\b/,
  /\bwhat is next\b/,
  /\bwhat'?s next\b/,
  /\bwhere am i\b/,
  /\bwhat does this milestone\b/,
  /\bwhich (parts?|sections?) of the (rubric|brief) (map|relate|correspond)\b/,
  /\bwhat should i (work on|do) (next|first)\b/,
];

const A6_A10_MAP = /\b(parts?|sections?) of the (rubric|brief) (map|relate|correspond)\b|\bmap (to|onto)\b/;

const A4_LOCATE: readonly RegExp[] = [
  /\bwhere (in|does|is|are)\b/,
  /\bwhich page\b/,
  /\bwhich section\b/,
  /\bexact wording\b/,
  /\bexactly as written\b/,
  /\bverbatim\b/,
  /\b(quote|quoted)\b/,
  /\bpoint me to\b/,
  /\bshow me (the )?(exact|wording|section|requirement)\b/,
  /\bfind (it|this|that) in\b/,
];

const A2_RUBRIC: readonly RegExp[] = [
  /\bwhat the rubric means by\b/,
  /\bwhat does the rubric mean\b/,
  /\bexplain (the|this) (rubric )?(criterion|criteria)\b/,
  /\bwhat (a|the) rubric criterion (assesses|rewards|is asking for|means)\b/,
  /\bwhat is the rubric (looking for|asking for)\b/,
];

const A5_TERM: readonly RegExp[] = [
  /\bwhat (does|do) (the )?['"]?[a-z][a-z0-9 _-]{1,40}['"]? mean\b/,
  /\bwhat is the meaning of\b/,
  /\bdefine\b/,
  /\bwhat does .{1,30} stand for\b/,
];

const BRIEF_REFERENCE = /\b(in|from|according to) (this|the) (brief|assignment|rubric|unit)\b|\bin this assignment\b/;

const A7_SELF_CHECK: readonly RegExp[] = [
  /\bwhat questions should i ask (myself)?\b/,
  /\bwhat should i (be thinking about|consider|ask myself)\b/,
  /\bhow should i (prepare|get started|approach)\b/,
  /\bquestions to ask myself\b/,
];

const A9_PROGRESS: readonly RegExp[] = [
  /\bmy progress\b/,
  /\bprogress so far\b/,
  /\bwhat have i (done|completed|finished)\b/,
  /\bhow (am i|are we) going\b/,
];

const A1_CONSTRAINTS: readonly RegExp[] = [
  /\bwhat (are|does) the (assignment|brief) (constraints|require|expect)\b/,
  /\bexplain the (constraints|requirements) (at a general level)?\b/,
  /\bwhat (is|are) required of me\b/,
];

function allow(rules: string[], reasonCode: ReasonCode, scope: ScopeToken | null = null): RuleOutcome {
  return { verdict: scope ? 'ALLOW_WITH_SCOPE' : 'ALLOW', rules, reasonCode, scope };
}

/* ------------------------------------------------------------------ *
 * H10 -- ambiguity
 * ------------------------------------------------------------------ */

const AMB1_BARE_REFERENCE = /^(what about (it|this|that)|how about (it|this|that)|what does (it|this|that) mean|explain (it|this|that)|what is (it|this|that)|and (this|that)|this one)\b/;

const AMB3_WHOLE_ASSIGNMENT = /\b(best way to (approach|do|start|tackle)|how (should|do) i (approach|start|tackle)|where do i (start|begin))\b[^.]{0,30}\b(this|the) (assignment|task)\b/;

function h10Ambiguity(text: string, session: SessionState): RuleOutcome | null {
  if (AMB3_WHOLE_ASSIGNMENT.test(text)) {
    return {
      verdict: 'CLARIFY',
      rules: ['AMB3'],
      reasonCode: REASON_CODES.WHOLE_ASSIGNMENT_PLANNING,
      scope: null,
      clarifyingQuestion: AMB3_QUESTION,
    };
  }
  if (AMB1_BARE_REFERENCE.test(text) && !session.currentMilestoneTitle) {
    return {
      verdict: 'CLARIFY',
      rules: ['AMB1'],
      reasonCode: REASON_CODES.REFERENT_AMBIGUOUS,
      scope: null,
      clarifyingQuestion: AMB1_QUESTION,
    };
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Grounding check -- separates `A4` from `ESC4`
 * ------------------------------------------------------------------ */

/**
 * A decision request ("which library should I use") is not a locate request, so it must not be
 * answered as one and must not be escalated as one either: it belongs to L4, which is what
 * G09/G16/G48 assert. Precision rule 3.
 */
const DECISION_REQUEST = /\b(should i use|should i (choose|pick)|which \w+ should i|what \w+ should i use|best (way|approach|option|choice)|name of the (library|pattern|framework)|which (library|pattern|framework|technology|method|approach|formula|design))\b/;

function groundedInSources(words: readonly string[], sources: readonly SourceChunk[]): boolean {
  if (words.length === 0) return true;
  // Stems on both sides, with the same stemmer L0 used, so a plural in the brief grounds a
  // singular in the question.
  const sourceWords = new Set<string>();
  for (const chunk of sources) {
    for (const token of chunk.text.toLowerCase().split(/[^a-z0-9]+/)) {
      if (token.length > 2) sourceWords.add(stemWord(token));
    }
  }
  return words.every((word) => sourceWords.has(word));
}

/* ------------------------------------------------------------------ *
 * The ordered evaluation
 * ------------------------------------------------------------------ */

/**
 * The prohibited/refusing chain, evaluated in the mandated order over one string. Split out so
 * that `DE9`'s decoded variants go through exactly the same chain as the turn itself: an encoded
 * request that decodes to "write the code" must be refused by `H1` with `P2`, not merely flagged.
 */
function evaluateRefusingChain(
  text: string,
  turn: NormalisedTurn,
  session: SessionState,
  strippedResidual: string,
): RuleOutcome | null {
  const residualTurn: NormalisedTurn = { ...turn, match: strippedResidual, clauses: [strippedResidual] };
  const contentText = operativeText(residualTurn);
  const contentClauses = operativeClauses(residualTurn);

  let outcome =
    h5Injection(text) ??
    h9Administrative(text) ??
    h8Paraphrase(text) ??
    h2StudentWork(contentText) ??
    h6JustCheck(contentText) ??
    h1Generation(contentText, contentClauses) ??
    h7StepByStep(contentText);

  // H11/H12 are session signals, not content rules: a `DE12` sequence must be cited *alongside*
  // the rule that also matches the new turn, which is what "the original rule id + DE12" means in
  // section 3.2.2's H11 row. A signal can therefore only add refusals, never remove one.
  for (const signal of [h11RetryAfterRefusal(turn, session), h12Narrowing(turn, session)]) {
    if (!signal) continue;
    if (!outcome) {
      outcome = signal;
      continue;
    }
    const winner = VERDICT_SEVERITY[signal.verdict] > VERDICT_SEVERITY[outcome.verdict] ? signal : outcome;
    outcome = { ...winner, rules: [...new Set([...outcome.rules, ...signal.rules])] };
  }

  return outcome;
}

/** The more restrictive of two outcomes, so a decoded variant can only ever add refusals. */
function mostRestrictiveOutcome(a: RuleOutcome | null, b: RuleOutcome | null): RuleOutcome | null {
  if (!a) return b;
  if (!b) return a;
  const winner = VERDICT_SEVERITY[b.verdict] > VERDICT_SEVERITY[a.verdict] ? b : a;
  const other = winner === a ? b : a;
  return { ...winner, rules: [...new Set([...winner.rules, ...other.rules])] };
}

export function evaluateDeterministic(context: RuleContext): LayerOneResult {
  const { turn, session, sources, uploads } = context;
  const frames = detectFrames(turn);
  const full = turn.match;
  // H4: the frame is stripped and the *residual* request is re-evaluated. `05` section 3.2.2 H4.
  const residual = stripFrames(full);

  // `DE9`: the turn itself, plus every decoded variant (leetspeak, base64). The most restrictive
  // outcome wins, and a variant can only add a refusal -- never remove one.
  let textOutcome = evaluateRefusingChain(full, turn, session, residual);
  let variantDecided = false;
  for (const variant of turn.variants) {
    const variantTurn: NormalisedTurn = { ...turn, match: variant, clauses: [variant] };
    const variantOutcome = evaluateRefusingChain(variant, variantTurn, session, stripFrames(variant));
    if (variantOutcome) variantDecided = true;
    textOutcome = mostRestrictiveOutcome(textOutcome, variantOutcome);
  }
  // `05` section 4.2's DE9 row: "same rule as the decoded request". The frame id is recorded only
  // when the decoded form is what produced the refusal.
  const allFrames = variantDecided ? [...frames, 'DE9'] : frames;

  const uploadOutcome = h3Uploads(uploads);

  if (textOutcome || uploadOutcome) {
    const winner =
      textOutcome && uploadOutcome
        ? VERDICT_SEVERITY[uploadOutcome.verdict] > VERDICT_SEVERITY[textOutcome.verdict]
          ? uploadOutcome
          : textOutcome
        : (textOutcome ?? uploadOutcome)!;
    return { outcome: winner, frames: allFrames, handedToClassifier: false };
  }

  // Allowed detectors. These are the `A`-capabilities of section 6.1 that section 3.2.2's H-table
  // covers only partially (it names H13-H16); without them the eighteen allowed golden cases
  // marked `DET` would all reach L4, and their `Layer` column says they must not.
  if (anyOf(full, A3_POLICY_QUESTION)) {
    return { outcome: allow(['A3'], REASON_CODES.POLICY_APPROVED), frames: allFrames, handedToClassifier: false };
  }
  if (anyOf(full, A6_NAVIGATION)) {
    const rules = A6_A10_MAP.test(full) ? ['A6', 'A10'] : ['A6'];
    return { outcome: allow(rules, REASON_CODES.POLICY_APPROVED), frames: allFrames, handedToClassifier: false };
  }
  if (anyOf(full, A4_LOCATE)) {
    return { outcome: allow(['A4'], REASON_CODES.POLICY_APPROVED), frames: allFrames, handedToClassifier: false };
  }
  if (anyOf(full, A2_RUBRIC)) {
    return { outcome: allow(['A2'], REASON_CODES.POLICY_APPROVED), frames: allFrames, handedToClassifier: false };
  }
  if (anyOf(full, A5_TERM)) {
    // A term asked about *in this assignment* is scope resolution rather than a general
    // definition: G22 is a `MODEL` case, so L1 hands it over rather than answering it.
    if (BRIEF_REFERENCE.test(full)) {
      return { outcome: null, frames: allFrames, handedToClassifier: true };
    }
    return { outcome: allow(['A5'], REASON_CODES.POLICY_APPROVED), frames: allFrames, handedToClassifier: false };
  }
  if (anyOf(full, A7_SELF_CHECK)) {
    const rules = /\bmilestone \d|\bmilestone\b/.test(full) ? ['A6', 'A7'] : ['A7'];
    return { outcome: allow(rules, REASON_CODES.POLICY_APPROVED), frames: allFrames, handedToClassifier: false };
  }
  if (anyOf(full, A9_PROGRESS)) {
    return { outcome: allow(['A9'], REASON_CODES.POLICY_APPROVED), frames: allFrames, handedToClassifier: false };
  }
  if (anyOf(full, A1_CONSTRAINTS)) {
    return { outcome: allow(['A1'], REASON_CODES.POLICY_APPROVED), frames: allFrames, handedToClassifier: false };
  }

  const ambiguity = h10Ambiguity(full, session);
  if (ambiguity) return { outcome: ambiguity, frames: allFrames, handedToClassifier: false };

  // Grounding: a question about this assignment is answerable only from the approved sources.
  // An assignment-specific assertion with no source would be a fabricated requirement (`P13`), so
  // an ungrounded question is a tutor hand-off, never a general-knowledge answer (`C2`).
  if (turn.contentWords.length > 0 && !DECISION_REQUEST.test(full)) {
    if (groundedInSources(turn.contentWords, sources)) {
      return { outcome: allow(['A4'], REASON_CODES.POLICY_APPROVED), frames: allFrames, handedToClassifier: false };
    }
    return {
      outcome: {
        verdict: 'ESCALATE_TO_TUTOR',
        rules: ['RET_NO_MATCH', 'ESC4'],
        reasonCode: REASON_CODES.SOURCES_SILENT_ON_ASSIGNMENT_FACT,
        scope: null,
      },
      frames: allFrames,
      handedToClassifier: false,
    };
  }

  return { outcome: null, frames: allFrames, handedToClassifier: false };
}

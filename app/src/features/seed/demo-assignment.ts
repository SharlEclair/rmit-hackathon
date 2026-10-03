/**
 * The demo assignment's CONTENT (`11` WP-02: "the fixture content").
 *
 * This module holds authored strings only. It performs no I/O, holds no SQL, and reads no clock,
 * so the same content is produced on every machine. The seeder resolves each anchor below against
 * the text the extractor actually returned and fails loudly when an anchor is not found: an
 * authored string that is not in the source document is exactly the failure R2 and I-2 exist to
 * prevent (`06` section 7.2.5: `verbatim_text` "must be a substring of the cited chunk text").
 *
 * Two rules that shape every string here:
 *
 * - **C1.** No string in this file supplies the assignment's answer, an analysis, a design
 *   decision, or a decomposition that would lead to one. The questions and replies model what a
 *   student may legitimately ask and what a tutor may legitimately answer about requirements.
 * - **C2.** A requirement is never paraphrased and presented as the requirement. Where this file
 *   needs requirement text it stores an **anchor phrase**; the seeder stores the matching span of
 *   the source document itself as `verbatim_text`, so the UI shows the brief's own words with a
 *   page anchor, never a rewrite.
 *
 * The five milestone titles, summaries, ordering and seeded activity come from
 * `docs/fixtures/cohort-seed.json`, which is the oracle for the cohort. The definitions below are
 * checked against it at seed time and a mismatch aborts the run rather than silently producing a
 * demo whose numbers and labels disagree.
 */

import type {
  AiPolicyAppliesTo,
  AiPolicyEffect,
  PlanningLevel,
  Provenance,
} from '../../lib/db/queries/structure';
import type { SourceKind, SourceMimeType } from '../../lib/db/queries/assignments';

export const DEMO_COURSE = {
  code: 'COSC2407',
  title: 'Digital Systems Design',
  term: '2026-S2',
} as const;

export const DEMO_TUTOR = {
  email: 'tutor@demo.rmit',
  displayName: 'Demo Tutor',
} as const;

export const DEMO_STUDENT = {
  email: 'student@demo.rmit',
  displayName: 'Demo Student (interactive)',
} as const;

/**
 * The published demo credential (`12` section 3.6). It is printed in the operations doc, it is the
 * only credential the demo uses, and it protects nothing: the seeder refuses to run when
 * `NODE_ENV=production`, and the accounts exist only in a database that was seeded for a demo.
 * It is written here as a constant because `cohort-seed.json` names `.env` as its source and no
 * such variable exists -- see the seed report.
 */
export const DEMO_PASSWORD = 'demo1234';

/** The only domain any synthetic student address uses (C7: no real personal data). */
export const SYNTHETIC_STUDENT_DOMAIN = 'student.demo.rmit';

export const DEMO_ASSIGNMENT = {
  title: 'Case Analysis and Design Proposal Report',
  kind: 'individual written report',
  weightPercent: 40,
  wordCountRequirement: 1800,
  /** `2026-10-23T23:59:00+07:00`, the due time in the course's local timezone. */
  dueAt: '2026-10-23T16:59:00.000Z',
  /**
   * Publish is what opens the W_ALL analytics window (`08` section 9). It is a fixed instant in
   * the past, before every seeded activity timestamp, so the seeded events fall inside the window
   * on any machine that runs the seed after that date.
   */
  publishedAt: '2026-09-28T00:00:00.000Z',
} as const;

export interface FixtureSourceDefinition {
  readonly kind: SourceKind;
  /** Relative to the repository root, which is one level above `app/`. */
  readonly relativePath: string;
  readonly originalFilename: string;
  readonly mimeType: SourceMimeType;
  /** `null` for a format that has no pages. */
  readonly expectedPageCount: number | null;
}

export const FIXTURE_SOURCES: readonly FixtureSourceDefinition[] = [
  {
    kind: 'brief',
    relativePath: 'docs/fixtures/demo-brief.pdf',
    originalFilename: 'demo-brief.pdf',
    mimeType: 'application/pdf',
    expectedPageCount: 4,
  },
  {
    kind: 'rubric',
    relativePath: 'docs/fixtures/demo-rubric.pdf',
    originalFilename: 'demo-rubric.pdf',
    mimeType: 'application/pdf',
    expectedPageCount: 3,
  },
  {
    kind: 'ai_policy',
    relativePath: 'docs/fixtures/demo-ai-policy.md',
    originalFilename: 'demo-ai-policy.md',
    mimeType: 'text/markdown',
    expectedPageCount: null,
  },
];

/**
 * A fixed generation instant.
 *
 * `generatedAt` is part of the provenance payload (`06` section 6.11) and must not be `now()`, or
 * a second seed run would produce a different provenance object for the same artifact and the
 * "same state after two runs" claim would be false for a fixture-derived value. It sits before
 * `ARTIFACT_APPROVED_AT`, because ingestion precedes approval.
 */
export const PROVENANCE_GENERATED_AT = '2026-09-26T00:00:00.000Z';

/** When the tutor approved the structure and its artifacts (`06` section 3.2 transitions 4-5). */
export const ARTIFACT_APPROVED_AT = '2026-09-27T22:00:00.000Z';

export const PROMPT_VERSIONS = {
  structure: 'ingest-structure@1',
  requirements: 'ingest-requirements@1',
  rubric: 'ingest-rubric@1',
  milestones: 'ingest-milestones@1',
  checklist: 'ingest-checklist@1',
  policy: 'policy-draft@1',
  faq: 'faq-draft@1',
  ambiguity: 'ingest-ambiguity@1',
} as const;

/**
 * The provenance object of `06` section 6.11.
 *
 * `modelId` is passed in from `getConfig().llmModelReasoning` rather than written here: `04`
 * section 5.3 states there is no default model id, and a second hard-coded copy in the fixture
 * would be a second source of truth for which model the platform uses.
 */
export function buildProvenance(
  modelId: string,
  promptVersion: string,
  groundingChunkIds: readonly string[],
): Provenance {
  return {
    modelId,
    promptVersion,
    generatedAt: PROVENANCE_GENERATED_AT,
    groundingChunkIds: [...groundingChunkIds],
  };
}

/** Which fixture document an anchor is resolved against. */
export type AnchorSourceKind = Extract<SourceKind, 'brief' | 'rubric' | 'ai_policy'>;

export interface RequirementDefinition {
  readonly key: string;
  /** `null` for the root node; otherwise the key of the parent. */
  readonly parentKey: string | null;
  readonly displayOrder: number;
  readonly title: string;
  readonly sourceKind: AnchorSourceKind;
  /**
   * Matched whitespace-insensitively inside one chunk. What is stored is the matched span of the
   * document, so a line break inside the span is preserved rather than normalised away.
   */
  readonly anchor: string;
  readonly mapSummary: string;
  readonly rubricKeys: readonly string[];
}

/**
 * The Assignment Map's Requirement nodes (`06` section 7.2.5).
 *
 * The root is the brief's own statement that it is the authoritative requirement; every other node
 * is a required section or a stated constraint, and each one cites the page-anchored chunk it came
 * from. The Map is a map of the document, not a re-telling of it (C2, I-3).
 */
export const REQUIREMENTS: readonly RequirementDefinition[] = [
  {
    key: 'R_AUTHORITY',
    parentKey: null,
    displayOrder: 1,
    title: 'Authoritative requirement document',
    sourceKind: 'brief',
    anchor: 'this document is the authoritative requirement',
    mapSummary:
      'The brief is the single authoritative statement of what is assessed and what must be submitted. Every other node on this map traces back to a passage in it.',
    rubricKeys: [],
  },
  {
    key: 'R_WORDCOUNT',
    parentKey: 'R_AUTHORITY',
    displayOrder: 2,
    title: 'Stated body word count',
    sourceKind: 'brief',
    anchor: 'The report body is 1,800 words.',
    mapSummary: 'A stated number, not a target or a suggestion.',
    rubricKeys: ['RC5'],
  },
  {
    key: 'R_WORDCOUNT_RANGE',
    parentKey: 'R_AUTHORITY',
    displayOrder: 3,
    title: 'Penalised range around the stated count',
    sourceKind: 'brief',
    anchor:
      'A submitted report whose body is outside 1,620 words to 1,980 words receives a penalty under criterion 5 of the marking rubric, which is worth 10% of the assessment.',
    mapSummary: 'The tolerance is stated in the brief and enforced under one named criterion.',
    rubricKeys: ['RC5'],
  },
  {
    key: 'R_PART_A',
    parentKey: 'R_AUTHORITY',
    displayOrder: 4,
    title: 'Part A -- problem statement',
    sourceKind: 'brief',
    anchor:
      'Part A -- Problem statement: the purpose of the service and what the evidence shows.',
    mapSummary: 'One of the five required parts of the submitted report.',
    rubricKeys: ['RC1'],
  },
  {
    key: 'R_PART_B',
    parentKey: 'R_AUTHORITY',
    displayOrder: 5,
    title: 'Part B -- own design reasoning',
    sourceKind: 'brief',
    anchor:
      'Part B of the report is the part that requires you to explain your own design decisions.',
    mapSummary:
      'The brief states that Part B must be the student own reasoning in their own words, traceable to cited evidence.',
    rubricKeys: ['RC2'],
  },
  {
    key: 'R_PART_C',
    parentKey: 'R_AUTHORITY',
    displayOrder: 6,
    title: 'Part C -- stakeholder and needs analysis',
    sourceKind: 'brief',
    anchor:
      'Part C -- Stakeholder and needs analysis: who is affected, what each group needs, and how you know.',
    mapSummary: 'One of the five required parts of the submitted report.',
    rubricKeys: ['RC3'],
  },
  {
    key: 'R_PART_D',
    parentKey: 'R_AUTHORITY',
    displayOrder: 7,
    title: 'Part D -- risks and ethical considerations',
    sourceKind: 'brief',
    anchor:
      'Part D -- Risks and ethical considerations: at least three, each with the evidence or source that raises it.',
    mapSummary: 'One of the five required parts of the submitted report, with a stated minimum.',
    rubricKeys: ['RC4'],
  },
  {
    key: 'R_PART_E',
    parentKey: 'R_AUTHORITY',
    displayOrder: 8,
    title: 'Part E -- conclusion',
    sourceKind: 'brief',
    anchor:
      'Part E -- Conclusion: what you would advise the university to do next and what would change your advice.',
    mapSummary: 'One of the five required parts of the submitted report.',
    rubricKeys: ['RC4'],
  },
  {
    key: 'R_REFERENCES',
    parentKey: 'R_AUTHORITY',
    displayOrder: 9,
    title: 'Referencing style',
    sourceKind: 'brief',
    anchor: 'A reference list in RMIT Harvard style.',
    mapSummary: 'The required reference style, enforced under the communication criterion.',
    rubricKeys: ['RC5'],
  },
  {
    key: 'R_APPENDIX',
    parentKey: 'R_AUTHORITY',
    displayOrder: 10,
    title: 'Appendix limit',
    sourceKind: 'brief',
    anchor:
      'An appendix of no more than two pages containing evidence you reference but do not reproduce in the body.',
    mapSummary: 'A stated page limit on the appendix.',
    rubricKeys: ['RC5'],
  },
  {
    key: 'R_SUBMISSION_FORMAT',
    parentKey: 'R_AUTHORITY',
    displayOrder: 11,
    title: 'Submission format',
    sourceKind: 'brief',
    anchor: 'One PDF. The submission portal does not accept any other format.',
    mapSummary: 'The single accepted submission format.',
    rubricKeys: ['RC5'],
  },
  {
    key: 'R_AI_DECLARATION',
    parentKey: 'R_AUTHORITY',
    displayOrder: 12,
    title: 'Declaration of AI use',
    sourceKind: 'brief',
    anchor:
      'The declaration of AI use from Section 7, completed and signed, immediately after the reference list.',
    mapSummary: 'A required deliverable that the brief places immediately after the reference list.',
    rubricKeys: ['RC5'],
  },
];

export interface RubricSectionDefinition {
  readonly key: string;
  readonly displayOrder: number;
  /** The document's own criterion label. */
  readonly sectionLabel: string;
  /** The first line of the criterion's block; the stored `criteria_text` is that whole block. */
  readonly blockAnchor: string;
  readonly weightPercent: number;
  readonly mapInterpretation: string;
}

/**
 * The five rubric criteria (`06` section 7.2.6).
 *
 * `criteria_text` is the verbatim criterion block the extractor returned. The rubric is a
 * two-column table, so the extracted block interleaves the pass-standard and distinction-standard
 * cells; that order is the extractor's own reading order and is preserved rather than tidied,
 * because rewriting an official document's text is what C2 forbids. Presenting it legibly is a
 * rendering concern, not an ingestion one.
 *
 * The weights sum to 100 and the fixture states the total; the seed asserts the sum.
 */
export const RUBRIC_SECTIONS: readonly RubricSectionDefinition[] = [
  {
    key: 'RC1',
    displayOrder: 1,
    sectionLabel: 'Criterion 1 -- Problem framing (20 marks)',
    blockAnchor: 'Criterion 1 -- Problem framing (20 marks)',
    weightPercent: 20,
    mapInterpretation:
      'AI reading of the criterion: it carries 20 percent of the marks and asks how the problem is framed against the evidence, with the distinction standard separating evidence from interpretation.',
  },
  {
    key: 'RC2',
    displayOrder: 2,
    sectionLabel: 'Criterion 2 -- Design rationale, Part B (25 marks)',
    blockAnchor: 'Criterion 2 -- Design rationale, Part B (25 marks)',
    weightPercent: 25,
    mapInterpretation:
      'AI reading of the criterion: it carries 25 percent of the marks and is the Part B criterion. The distinction standard names justification against evidence and the course literature, and one decision deliberately not taken.',
  },
  {
    key: 'RC3',
    displayOrder: 3,
    sectionLabel: 'Criterion 3 -- Stakeholder and needs analysis (20 marks)',
    blockAnchor: 'Criterion 3 -- Stakeholder and needs analysis (20 marks)',
    weightPercent: 20,
    mapInterpretation:
      'AI reading of the criterion: it carries 20 percent of the marks and asks for needs traced to evidence and for a conflict between two groups to be handled explicitly.',
  },
  {
    key: 'RC4',
    displayOrder: 4,
    sectionLabel: 'Criterion 4 -- Risks, ethics, and conclusion (25 marks)',
    blockAnchor: 'Criterion 4 -- Risks, ethics, and conclusion (25 marks)',
    weightPercent: 25,
    mapInterpretation:
      'AI reading of the criterion: it carries 25 percent of the marks and covers the risks, the ethics and the conclusion, with each risk tied to the source that raises it at the distinction standard.',
  },
  {
    key: 'RC5',
    displayOrder: 5,
    sectionLabel:
      'Criterion 5 -- Communication, referencing, and assessment compliance (10 marks)',
    blockAnchor:
      'Criterion 5 -- Communication, referencing, and assessment compliance (10 marks)',
    weightPercent: 10,
    mapInterpretation:
      'AI reading of the criterion: it carries 10 percent of the marks and is where the brief states the word-count range is enforced.',
  },
];

export interface MilestoneDefinition {
  /** Matches `milestones[].key` in `docs/fixtures/cohort-seed.json`. */
  readonly key: string;
  readonly displayOrder: number;
  readonly title: string;
  readonly summary: string;
  /** Requirement-map edges; every milestone needs at least one or it is a publish blocker. */
  readonly requirementKeys: readonly string[];
}

/**
 * The five milestones (`06` section 7.2.9).
 *
 * Titles, summaries and order are the cohort fixture's values; the seed asserts equality so a
 * rename in one place cannot silently desynchronise the Map from the analytics labels. The
 * milestone's lifecycle value is the fixture's too and is applied by the seeder from
 * `planned.publicationStatus` rather than restated here.
 */
export const MILESTONES: readonly MilestoneDefinition[] = [
  {
    key: 'M1',
    displayOrder: 1,
    title: 'Understanding the brief and the assessment requirements',
    summary:
      'Reading the assessment brief and the marking rubric, and identifying what is assessed and what each required section must contain.',
    requirementKeys: ['R_AUTHORITY', 'R_WORDCOUNT', 'R_WORDCOUNT_RANGE', 'R_APPENDIX', 'R_AI_DECLARATION'],
  },
  {
    key: 'M2',
    displayOrder: 2,
    title: 'Reading the case pack and locating the evidence',
    summary:
      'Working through the published service description, the consent notice, the complaint records and the usage figures, and noting where each claim can be traced.',
    requirementKeys: ['R_PART_A', 'R_REFERENCES'],
  },
  {
    key: 'M3',
    displayOrder: 3,
    title: 'Design rationale for Part B -- explaining your own decisions',
    summary:
      'Deciding on a conceptual response to the case and setting out, in your own words, the reasoning behind each design decision in Part B.',
    requirementKeys: ['R_PART_B', 'R_PART_A'],
  },
  {
    key: 'M4',
    displayOrder: 4,
    title: 'Stakeholder and needs analysis',
    summary:
      "Identifying the stakeholder groups the case implies, deriving each group's needs from the evidence, and noting where two groups' needs conflict.",
    requirementKeys: ['R_PART_C'],
  },
  {
    key: 'M5',
    displayOrder: 5,
    title: 'Risks, ethics, referencing and final submission',
    summary:
      'Written up risks and ethical considerations with their sources, referencing in RMIT Harvard style, checking the word count, and completing the declaration of AI use.',
    requirementKeys: ['R_PART_D', 'R_PART_E', 'R_REFERENCES', 'R_APPENDIX', 'R_SUBMISSION_FORMAT', 'R_AI_DECLARATION'],
  },
];

export interface ChecklistItemDefinition {
  readonly milestoneKey: string;
  readonly displayOrder: number;
  /**
   * A noun phrase, never an imperative. `06` section 7.2.10 makes the imperative-verb rejection a
   * validator with warning `CHECKLIST_IMPERATIVE` (O1, D20): a checklist item names what is being
   * checked, not an instruction to the student.
   */
  readonly title: string;
  readonly planningLevel: PlanningLevel;
  readonly description: string;
}

/**
 * The checklist (`06` section 7.2.10).
 *
 * The per-milestone counts are 3, 3, 4, 3, 4. They are not free choices: `cohort-seed.json` records
 * `checklistItemCount` per milestone and every contributing student completed **all** of that
 * milestone's items, so the item counts are what make the fixture's per-student interval lists and
 * its two-stage mean line up. The seed asserts the counts against the fixture.
 */
export const CHECKLIST_ITEMS: readonly ChecklistItemDefinition[] = [
  {
    milestoneKey: 'M1',
    displayOrder: 1,
    title: 'Brief and rubric read end to end',
    planningLevel: 'understand',
    description: 'Both official documents read in full before any planning starts.',
  },
  {
    milestoneKey: 'M1',
    displayOrder: 2,
    title: 'Required section list taken from the brief',
    planningLevel: 'identify',
    description: 'The five parts and the additional deliverables, in the brief\'s own order.',
  },
  {
    milestoneKey: 'M1',
    displayOrder: 3,
    title: 'Weighting, word count and due date recorded',
    planningLevel: 'note',
    description: 'The stated numbers, so the plan can be checked against them later.',
  },
  {
    milestoneKey: 'M2',
    displayOrder: 1,
    title: 'Case pack documents located',
    planningLevel: 'identify',
    description: 'The four items Section 2 lists as the case pack.',
  },
  {
    milestoneKey: 'M2',
    displayOrder: 2,
    title: 'Each claim traced to a case pack location',
    planningLevel: 'verify',
    description: 'Every finding can be pointed back at the evidence it came from.',
  },
  {
    milestoneKey: 'M2',
    displayOrder: 3,
    title: 'Consent notice and complaint records compared',
    planningLevel: 'review',
    description: 'Noting where the complaints and the published notice speak to different things.',
  },
  {
    milestoneKey: 'M3',
    displayOrder: 1,
    title: 'Own design decisions stated in own words',
    planningLevel: 'plan',
    description: 'Part B reasoning written by the student, not reproduced from any tool.',
  },
  {
    milestoneKey: 'M3',
    displayOrder: 2,
    title: 'Each decision traced to named evidence',
    planningLevel: 'plan',
    description: 'The evidence or literature each decision rests on, named.',
  },
  {
    milestoneKey: 'M3',
    displayOrder: 3,
    title: 'Course literature connected to the rationale',
    planningLevel: 'plan',
    description: 'The course material the distinction standard asks the rationale to engage.',
  },
  {
    milestoneKey: 'M3',
    displayOrder: 4,
    title: 'One decision not taken recorded with its reason',
    planningLevel: 'note',
    description: 'The alternative and the reason it was set aside.',
  },
  {
    milestoneKey: 'M4',
    displayOrder: 1,
    title: 'Stakeholder groups identified from the case pack',
    planningLevel: 'identify',
    description: 'The groups the evidence implies, not a generic list.',
  },
  {
    milestoneKey: 'M4',
    displayOrder: 2,
    title: 'Each need traced to specific evidence',
    planningLevel: 'verify',
    description: 'A named piece of evidence or an explicit assumption per need.',
  },
  {
    milestoneKey: 'M4',
    displayOrder: 3,
    title: 'Conflicting needs between groups noted',
    planningLevel: 'review',
    description: 'Two groups whose needs pull in different directions, and how the proposal handles it.',
  },
  {
    milestoneKey: 'M5',
    displayOrder: 1,
    title: 'Three or more risks each tied to a source',
    planningLevel: 'review',
    description: 'The minimum the brief states, each with the evidence or source that raises it.',
  },
  {
    milestoneKey: 'M5',
    displayOrder: 2,
    title: 'Ethical considerations stated with their conditions',
    planningLevel: 'review',
    description: 'What would have to be true for each consideration to become a real risk.',
  },
  {
    milestoneKey: 'M5',
    displayOrder: 3,
    title: 'RMIT Harvard reference list checked',
    planningLevel: 'verify',
    description: 'Every cited source present and formatted consistently.',
  },
  {
    milestoneKey: 'M5',
    displayOrder: 4,
    title: 'Word count and AI-use declaration checked',
    planningLevel: 'verify',
    description: 'The declared count and the completed declaration before submission.',
  },
];

export interface PolicyRuleDefinition {
  readonly ruleCode: string;
  /**
   * The clause label inside `demo-ai-policy.md`. The seed takes the whole paragraph that starts
   * with this label, so `rule_text` is the policy's own wording and not a transcription.
   */
  readonly clauseAnchor: string;
  readonly effect: AiPolicyEffect;
  readonly appliesTo: AiPolicyAppliesTo;
  readonly displayOrder: number;
}

/**
 * The assignment's AI Usage Policy rules (`06` section 7.2.11, D9).
 *
 * The guardrail reads only `PUBLISHED` rules and, with none published, returns `REFUSE` with
 * `POL_ABSENT` and the Assistant is unavailable (D47). Every rule here is published, and at least
 * one must be for the assignment to publish at all (`06` section 3.2 transition 7).
 *
 * Clause 3.1's second paragraph ("This includes producing that material in a different form...")
 * is deliberately not part of the rule text: `rule_text` is capped at 600 characters by
 * `ck_ai_policy_rules_rule_text_length`, and the paragraph remains available in full through the
 * rule's `source_chunk_id`. The operative prohibition is the first paragraph, which is what a
 * refusal quotes.
 */
export const POLICY_RULES: readonly PolicyRuleDefinition[] = [
  {
    ruleCode: 'no_answer_generation',
    clauseAnchor: '3.1 -- The one absolute prohibition.',
    effect: 'PROHIBIT',
    appliesTo: 'all',
    displayOrder: 1,
  },
  {
    ruleCode: 'no_ai_evaluation_of_work',
    clauseAnchor: '3.2 -- Do not have AI evaluate your work.',
    effect: 'PROHIBIT',
    appliesTo: 'assistant',
    displayOrder: 2,
  },
  {
    ruleCode: 'no_ai_authored_artefacts',
    clauseAnchor: '3.3 -- Do not have AI produce or repair artefacts for submission.',
    effect: 'PROHIBIT',
    appliesTo: 'all',
    displayOrder: 3,
  },
  {
    ruleCode: 'no_third_party_disclosure',
    clauseAnchor: "3.5 -- Do not disclose another person's work to an AI tool.",
    effect: 'PROHIBIT',
    appliesTo: 'uploads',
    displayOrder: 4,
  },
  {
    ruleCode: 'explain_general_concepts',
    clauseAnchor: '4.1 -- Explaining general concepts.',
    effect: 'ALLOW',
    appliesTo: 'assistant',
    displayOrder: 5,
  },
  {
    ruleCode: 'explain_assessment_documents',
    clauseAnchor: '4.2 -- Understanding the assessment documents.',
    effect: 'ALLOW',
    appliesTo: 'assistant',
    displayOrder: 6,
  },
  {
    ruleCode: 'mechanical_editing_only',
    clauseAnchor: '4.4 -- Mechanical editing of your own writing.',
    effect: 'ALLOW',
    appliesTo: 'uploads',
    displayOrder: 7,
  },
  {
    ruleCode: 'quote_requirements_verbatim',
    clauseAnchor: '6.1 -- The assistant may:',
    effect: 'ALLOW',
    appliesTo: 'assistant',
    displayOrder: 8,
  },
  {
    ruleCode: 'route_uncertain_requests_to_tutor',
    clauseAnchor: 'Ask your tutor through the course discussion board or privately',
    effect: 'ESCALATE_TO_TUTOR',
    appliesTo: 'assistant',
    displayOrder: 9,
  },
];

export interface FaqDefinition {
  readonly milestoneKey: string;
  readonly question: string;
  readonly answer: string;
  readonly sourceKind: 'ai_candidate' | 'tutor_authored';
  /**
   * Requirements whose chunks ground the answer. Used for both the provenance payload and the
   * indexed `grounding_chunk_ids` column, so the two cannot disagree.
   */
  readonly groundingRequirementKeys: readonly string[];
}

/**
 * The assignment's published FAQ (`06` section 7.4.4).
 *
 * Every answer quotes or points at the official document it came from and cites the section, so a
 * student reading the FAQ is sent back to the brief rather than to a summary of it (C2). None of
 * them supplies analysis, a design decision, or a worked sequence (C1).
 *
 * No entry in the seed is promoted from a private Query reply. Promotion is a tutor action (D29,
 * O8) and the seed does not take it on the tutor's behalf; the `query_reply` source kind and the
 * `source_query_id` column exist for the runtime path.
 */
export const FAQ_ENTRIES: readonly FaqDefinition[] = [
  {
    milestoneKey: 'M5',
    question: 'Does the appendix count toward the 1,800-word limit?',
    answer:
      'No. Section 4 of the brief excludes the appendix from the 1,800-word count, together with the title page, the table of contents and captions, the in-text citations themselves, the reference list, and the declaration of AI use. Everything else in Parts A to E, including headings, counts toward the limit, and the appendix is separately capped at two pages by Section 3.',
    sourceKind: 'tutor_authored',
    groundingRequirementKeys: ['R_WORDCOUNT', 'R_APPENDIX'],
  },
  {
    milestoneKey: 'M1',
    question: 'Which document states what I must submit?',
    answer:
      'The brief states that it is the authoritative requirement: "this document is the authoritative requirement", and Section 1 adds that it "states what is assessed and what you must submit" while not telling you how to produce any part of the report. The rubric is the statement of what is rewarded, and Section 6 of the brief says so. Where a student reads the two documents as inconsistent, that is a question for the tutor rather than a choice to make alone.',
    sourceKind: 'ai_candidate',
    groundingRequirementKeys: ['R_AUTHORITY'],
  },
  {
    milestoneKey: 'M3',
    question: 'What does the rubric reward in Part B?',
    answer:
      'Criterion 2 is the Part B criterion and carries 25 of the 100 marks. Its distinction standard asks for each design decision to be justified against named evidence and against the course literature, and for at least one decision that was not taken to be named with the reason. The criterion text is reproduced verbatim in the rubric, and the rubric is the statement of what is rewarded.',
    sourceKind: 'ai_candidate',
    groundingRequirementKeys: ['R_PART_B'],
  },
  {
    milestoneKey: 'M5',
    question: 'May I ask the Assignment Assistant about the rubric?',
    answer:
      'Yes. Section 4.2 of the AI Usage Policy permits AI help to understand the assessment documents -- explaining a sentence in the brief, saying what a rubric criterion is asking for in plain language, or listing the sections the brief requires -- and Section 6.1 permits the policy-bound assistant to explain what a criterion rewards by quoting it. Section 3.1 still prohibits any use that produces the analysis, the Part B reasoning, or a decomposition that would lead to the answer, and that prohibition has no exceptions.',
    sourceKind: 'ai_candidate',
    groundingRequirementKeys: ['R_PART_B', 'R_WORDCOUNT_RANGE'],
  },
];

export interface AmbiguityDefinition {
  readonly kind: 'ambiguity' | 'contradiction';
  readonly severity: 'low' | 'medium' | 'high';
  readonly title: string;
  /** What the finding is, stated as an observation. Never a proposed clarification (D23, C2). */
  readonly description: string;
  readonly locatedPage: number;
  readonly locatedSectionLabel: string;
  readonly sourceKind: 'brief';
  readonly excerptAnchor: string;
}

/**
 * The one seeded ambiguity finding (`06` section 7.2.12).
 *
 * It is a genuine property of the fixture: the brief requires "the declaration of AI use from
 * Section 7" in two places, and Section 7 of the brief describes the policy rather than containing
 * a declaration. The row records kind, severity, where it is, and what it is. It carries no
 * proposed clarification, and it never can: `ambiguity_findings` has no such column and D23 makes
 * its absence a requirement.
 */
export const AMBIGUITY_FINDING: AmbiguityDefinition = {
  kind: 'ambiguity',
  severity: 'medium',
  title: 'The declaration of AI use is required by Section 7 but is not published in the brief',
  description:
    'Section 4 excludes "the declaration of AI use required by Section 7" from the word count, and Section 5 requires "the declaration of AI use from Section 7" to be placed immediately after the reference list. Section 7 of the brief states that the assessment has its own AI Usage Policy and does not contain a declaration form, so a student following the brief alone has no declaration to complete and the brief does not say where it is published. The finding stops at the observation; the tutor authors any clarification as a FAQ entry.',
  locatedPage: 3,
  locatedSectionLabel: '4. Word count -- how the limit is applied',
  sourceKind: 'brief',
  excerptAnchor: 'the declaration of AI use required by Section 7',
};

export interface QuestionTemplate {
  readonly subject: string;
  readonly body: string;
}

/**
 * The private Query pool, one small set per milestone.
 *
 * These are questions a student may legitimately bring to a tutor about *requirements*. They ask
 * where something is stated, how a rule is applied, and what a criterion covers. None asks for the
 * analysis, a design decision, or a sequence (C1) -- and the tutor replies below are written so a
 * seeded thread never contains solution material either.
 */
export const QUESTION_POOLS: Readonly<Record<string, readonly QuestionTemplate[]>> = {
  M1: [
    {
      subject: 'Where the required sections are listed',
      body: 'Section 3 lists the required sections and deliverables in order. Before I plan any writing, is the list in Section 3 the complete set of sections I have to submit, or are there others elsewhere in the brief?',
    },
    {
      subject: 'How the word count exclusions are applied',
      body: 'Section 4 lists what is excluded from the 1,800-word count. Does the exclusion list cover the reference list as well as the appendix, and does it cover headings inside the body?',
    },
    {
      subject: 'Which document states the requirement',
      body: 'The brief says it is the authoritative requirement, and the rubric says it describes what is rewarded. If the two ever read differently, which one states what I must submit?',
    },
    {
      subject: 'Due date and submission point',
      body: 'The header table gives the due date and the submission point. Is a submission through any route other than the one named in the header table accepted?',
    },
  ],
  M2: [
    {
      subject: 'What the case pack contains',
      body: 'Section 2 names four items in the case pack. Is there any other evidence I am expected to analyse that is not in the case pack?',
    },
    {
      subject: 'Whether the case pack is a requirement',
      body: 'Section 2 says nothing in the case pack is a requirement of this assessment. Does that mean I can leave parts of it unused if they do not support my analysis?',
    },
    {
      subject: 'Traceability of claims to the evidence',
      body: 'The brief asks for claims that are traceable to the case pack. Does every claim in Part A need a case pack reference, or only the ones I present as findings?',
    },
  ],
  M3: [
    {
      subject: 'What Part B asks for',
      body: 'Section 2 says Part B explains my own design decisions in my own words. Does Part B have to cover every decision I make, or only the ones the evidence bears on?',
    },
    {
      subject: 'Proportion of the word count for Part B',
      body: 'Part B is the part my tutor reads closely. Is there a suggested proportion of the 1,800 words for Part B, or is that my choice?',
    },
    {
      subject: 'What counts as course literature',
      body: 'The distinction standard for criterion 2 refers to the course literature. Which course materials are meant by that for this assessment?',
    },
  ],
  M4: [
    {
      subject: 'Which stakeholder groups to cover',
      body: 'Part C asks who is affected and what each group needs. Do I have to cover groups the case pack does not mention, or only the ones the evidence implies?',
    },
    {
      subject: 'Evidence for conflicting needs',
      body: 'Criterion 3 asks where two groups needs conflict. Does the conflict have to be visible in the case pack, or can it be a consequence I identify from it?',
    },
    {
      subject: 'Needs with no direct evidence',
      body: 'Part C asks how I know what a group needs. Is an explicit assumption acceptable where the case pack has no direct evidence for a need?',
    },
  ],
  M5: [
    {
      subject: 'Number of risks required in Part D',
      body: 'Section 3 requires at least three risks or ethical considerations, each with the source that raises it. Does the source have to be in the case pack, or can it be course literature?',
    },
    {
      subject: 'Referencing a permitted AI use',
      body: 'Section 8 requires a generative AI tool to be acknowledged in RMIT Harvard style. How should a permitted AI use appear in the reference list as well as in the declaration?',
    },
    {
      subject: 'Where the declaration of AI use is published',
      body: 'Sections 4 and 5 both refer to a declaration of AI use in Section 7, but Section 7 of the brief does not contain one. Where is the declaration published?',
    },
    {
      subject: 'How much the appendix may contain',
      body: 'Section 4 excludes the appendix from the word count and Section 3 caps it at two pages. Is there any other limit on how much evidence the appendix may carry?',
    },
  ],
};

/**
 * Tutor replies.
 *
 * Each one either quotes the official document or routes the student to the tutor, and none of
 * them evaluates a draft or produces any part of the answer (C1, the policy's clause 3.2).
 */
export const TUTOR_REPLY_POOL: readonly string[] = [
  'Section 3 of the brief lists the required sections in order and Section 4 states how the word count is applied. Both passages are quoted in the published FAQ for this assignment. I have not read, and will not read, a draft before submission.',
  'The brief states that it is the authoritative requirement, and Section 6 says the rubric describes what is rewarded. If you think the two read inconsistently, send me both passages and I will raise it with the course coordinator.',
  'The declaration of AI use is published with the brief rather than inside it. I have asked the course coordinator to make that cross-reference explicit in the next version of the brief.',
  'That question is about your own analysis or your own design decision, which the AI Usage Policy places outside what I can answer here. Bring it to a consultation and tell me what you intend to do and why.',
  'For that criterion, the rubric is the statement of what is rewarded and it is published with the brief. Read the distinction standard for the criterion and, if a wording is still unclear, ask me which wording you are reading.',
];

/** The number of seeded private Query threads that also receive a tutor reply. */
export const TUTOR_REPLY_QUERY_STRIDE = 3;

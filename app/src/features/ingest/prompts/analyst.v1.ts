/**
 * The Assignment Analyst prompt, version 1.
 *
 * `11` WP-05: "The prompt, versioned as a constant. Changing it creates `v2`; never edit a shipped
 * version." The same rule applies to the `systemPrefixId` strings below: they are the cache key
 * (`04` section 5.5 rule 3) and the mock's template key (`src/lib/llm/fixtures/analyst-demo.ts`), so
 * editing one in place would silently change what the offline path answers for an already-shipped
 * prompt.
 *
 * Five passes, not one mega-prompt (`04` section 7, stage S6): (a) structure and requirements,
 * (b) milestones and checklist items, (c) FAQ candidates, (d) the AI Usage Policy draft,
 * (e) ambiguity and contradiction findings. Each is separately testable and separately re-runnable.
 *
 * What the prompt may never ask for, and the block that enforces each:
 *
 * - **Requirement wording.** The Analyst locates and quotes; `verbatimText` must be a span of the
 *   cited chunk, and the pipeline proves it before persisting (C2, D17, I-2).
 * - **Checklist items above the planning level.** The six verbs are the whole allowed set (D20, O1);
 *   `prompt-constraints.ts` rejects anything else, including in the "good" cases.
 * - **A clarification for an ambiguity.** The finding carries a location and a nature, and the
 *   schema has no field for proposed wording (D23, C2).
 *
 * Blocks A and B are byte-identical across requests in one ingestion run, which is what makes the
 * provider's prefix cache usable (`04` section 5.5 rules 1-2). Nothing derived from a document
 * belongs in either: the documents are block C.
 */

import type { AiCapability } from '@/lib/llm/types';

/** Which pass a request is for. */
export type AnalystPass = 'structure' | 'milestones' | 'faq' | 'policy' | 'ambiguity';

export const ANALYST_PROMPT_VERSION = 'analyst-v1';

/**
 * The capability every pass uses. One capability, five prompt versions: `AiCapability` names the
 * job, not the prompt (`04` section 5.2).
 */
export const ANALYST_CAPABILITY: AiCapability = 'assignment_analyst';

/**
 * `systemPrefixId` per pass, in the `<capability>-v<n>` form of `04` section 5.5 rule 3.
 *
 * These strings are also the mock provider's template keys. That is deliberate: a pass whose prompt
 * version has no fixture refuses offline instead of answering a prompt it was never written for.
 */
export const PASS_PREFIX_IDS: Readonly<Record<AnalystPass, string>> = {
  structure: 'assignment_analyst-structure-v1',
  milestones: 'assignment_analyst-milestones-v1',
  faq: 'assignment_analyst-faq-v1',
  policy: 'assignment_analyst-policy-v1',
  ambiguity: 'assignment_analyst-ambiguity-v1',
};

/** The schema name each pass validates against (`src/lib/llm/schema.ts`). */
export const PASS_SCHEMA_NAMES = {
  structure: 'analyst_structure_v1',
  milestones: 'analyst_milestones_v1',
  faq: 'analyst_faq_v1',
  policy: 'analyst_policy_v1',
  ambiguity: 'analyst_ambiguity_v1',
} as const;

/**
 * Block A -- identical for every request, forever.
 *
 * Written as constraints rather than as a persona. A persona invites the model to be helpful; the
 * constraint list is what the academy's integrity rule actually is, and it is the same text the
 * guardrail quotes (C1).
 */
export const STATIC_PLATFORM_BLOCK = [
  'You are the Assignment Analyst for an Australian university assignment workspace.',
  '',
  'Your job is to READ the tutor-supplied assignment documents and LOCATE what they already say,',
  'so that a tutor can review, edit and approve a structure for students. You are an indexing and',
  'location tool with judgement about structure. You are not an author of the assignment.',
  '',
  'Non-negotiable constraints:',
  '1. You must never write, rewrite, paraphrase or improve a requirement. Where a document states a',
  '   requirement, you quote it exactly, character for character, and you cite the chunk it came',
  '   from. A quote that is not an exact span of the cited chunk is rejected before a tutor sees it.',
  '2. You must never produce a checklist item that tells a student to implement, build, write, code,',
  '   design, deploy, fix, debug or solve anything. Checklist items are for understanding, finding,',
  '   planning, verifying, reviewing and noting. Items that name an implementation action are',
  '   rejected.',
  '3. You must never author a clarification, correction or answer. Where two parts of the documents',
  '   conflict, or a requirement is unclear, you record WHAT is unclear and WHERE, and stop. The',
  '   tutor writes the clarification.',
  '4. You must never invent a rule, a requirement, a mark, a weighting or a deadline that the',
  '   documents do not state. "The documents do not say" is a correct and acceptable outcome.',
  '5. You must not address students. Your output is a candidate set for a tutor to review, and every',
  '   artifact you propose is labelled as AI-generated and requires tutor approval.',
  '',
  'Every grounding reference is a bracketed index into the GROUNDING CHUNKS block below. Cite the',
  'index of the chunk that actually contains the text you quote. Never invent an index, and never',
  'cite a chunk you were not given.',
  '',
  'Respond with JSON only: no prose, no markdown fences, no commentary.',
].join('\n');

export interface ApprovedContext {
  /** Approved or published AI Usage Policy rules, in display order. */
  readonly policyRules: ReadonlyArray<{ readonly ruleCode: string; readonly ruleText: string }>;
  /** Approved or published milestone titles, in display order. */
  readonly milestoneTitles: readonly string[];
}

/**
 * Block B -- identical for every request in one assignment.
 *
 * Rendered from an ordered list, never from an object spread, so the byte sequence cannot change
 * between two processes for the same input (`04` section 5.5 rule 1). The content is limited to what
 * the register permits here: the approved policy, and milestone *ids and titles only* -- not their
 * bodies, which are block C material.
 */
export function policyBlock(context: ApprovedContext): string {
  const policy =
    context.policyRules.length === 0
      ? ['(no AI Usage Policy rule has been approved for this assignment yet)']
      : context.policyRules.map((rule) => {
          const text = rule.ruleText.replace(/\s+/g, ' ').trim();
          return `- ${rule.ruleCode}: ${text}`;
        });
  const milestones =
    context.milestoneTitles.length === 0
      ? ['(no milestone has been approved for this assignment yet)']
      : context.milestoneTitles.map((title, index) => `${String(index + 1)}. ${title}`);
  return [
    'ASSIGNMENT CONTEXT (tutor-approved content only)',
    '',
    'Approved AI Usage Policy:',
    ...policy,
    '',
    'Approved milestones:',
    ...milestones,
  ].join('\n');
}

/**
 * Block D -- the pass instruction, plus any variable context that pass needs.
 *
 * The requirement list is passed to the milestone pass so its `requirementRefs` name positions in a
 * list the model can actually see. Asking for a link to something it cannot enumerate would produce
 * either an invention or an empty list; the pipeline treats an empty list as the
 * `MILESTONE_WITHOUT_REQUIREMENT` publish blocker rather than filling it in.
 */
export function passInstruction(
  pass: AnalystPass,
  context: { readonly requirementTitles?: readonly string[]; readonly maxChecklistItems?: number },
): string {
  switch (pass) {
    case 'structure':
      return [
        'TASK (pass A of 5): structure, requirements and rubric sections.',
        '',
        'From the grounding chunks, produce:',
        '- requirements: the assessment requirements the documents state. For each, `verbatimText`',
        '  must be an exact span of the cited chunk -- quote the document, do not summarise it.',
        '  `title` is your own short label for the node (this one is allowed to be your wording).',
        '  `mapSummary` is a one-sentence orientation aid for the Map surface, or null.',
        '- rubricSections: the official marking criteria. `criteriaText` is quoted verbatim.',
        '  `weightPercent` only when the document states a percentage for that criterion, otherwise',
        '  null. Do not compute or infer a weight.',
        '',
        'If a document contains no numbered requirements, produce requirement nodes for the',
        'document sections that state what the student must do, and say so in `mapSummary`.',
        'Never return an empty requirements array: if the documents truly state nothing, quote the',
        'section heading that should be clarified instead.',
      ].join('\n');
    case 'milestones': {
      const requirements =
        context.requirementTitles === undefined || context.requirementTitles.length === 0
          ? ['(none were identified in pass A)']
          : context.requirementTitles.map(
              (title, index) => `R${String(index)}. ${title.replace(/\s+/g, ' ').trim()}`,
            );
      return [
        'TASK (pass B of 5): milestones and their checklist items.',
        '',
        'Produce 3 to 6 milestones. Each milestone groups a stage of the work and links to the',
        'requirements it serves by their `R` index from this list:',
        '',
        ...requirements,
        '',
        'Each milestone carries 3 to 6 checklist items. A checklist item is something a student can',
        'check off while working: it starts with one of these verbs and describes no implementation',
        'action -- understand, identify, plan, verify, review, note.',
        'Good: "Identify the marking criteria that mention referencing".',
        'Rejected: "Implement the endpoint", "Write the literature review", "Fix the failing test".',
        'An item that names an implementation action is discarded.',
        `Produce at most ${String(context.maxChecklistItems ?? 6)} items per milestone.`,
      ].join('\n');
    }
    case 'faq':
      return [
        'TASK (pass C of 5): FAQ candidates.',
        '',
        'Produce up to 8 question-and-answer candidates that the documents already answer, so a',
        'tutor can publish them to the whole cohort. Every answer must be grounded in the cited',
        'chunks; if the documents do not answer a question, do not propose it. Questions students',
        'actually ask are the useful ones: what a requirement means, where something is stated,',
        'what a criterion is worth, what format is expected.',
        '',
        'Do not propose an answer that does the assessed work, and do not turn a requirement into a',
        'how-to. An empty list is correct when the documents answer nothing.',
      ].join('\n');
    case 'policy':
      return [
        'TASK (pass D of 5): draft the per-assignment AI Usage Policy.',
        '',
        'Produce 3 to 8 rules for the box below. Each rule is one sentence a tutor can quote to a',
        'student, and carries:',
        '- `ruleCode`: lower_snake_case, 3 to 64 characters, stable and meaningful.',
        '- `ruleText`: 10 to 600 characters, the tutor-facing wording.',
        '- `effect`: PROHIBIT, ALLOW, ESCALATE_TO_TUTOR or CLARIFY.',
        '- `appliesTo`: assistant, uploads, discussion or all.',
        '- `sourceChunkRef`: the chunk the rule is drawn from, or null for a rule that is a',
        '  platform-wide baseline rather than a document clause.',
        '',
        'The policy must always include an explicit prohibition on producing the assessed work, and',
        'an escalation rule that sends a genuinely unclear question to the tutor. Do not invent a',
        'policy the documents contradict.',
      ].join('\n');
    case 'ambiguity':
      return [
        'TASK (pass E of 5): ambiguity and contradiction findings.',
        '',
        'Report where the documents are unclear or conflict. For each finding give:',
        '- `kind`: ambiguity (one place is unclear) or contradiction (two places disagree).',
        '- `severity`: low, medium or high.',
        '- a plain-language `description` of what is unclear and why, naming the location.',
        '- `excerptA`: an exact quote of the first location. `excerptB`: an exact quote of the',
        '  conflicting location, required when the kind is contradiction and null otherwise.',
        '- `sourceChunkRefs`: the chunks the finding is drawn from.',
        '',
        'CRITICAL: do not write a clarification, a correction, an interpretation or a suggested',
        'wording change. The system records WHAT is unclear and WHERE; the tutor writes the',
        'clarification. A finding that contains a proposed clarification is rejected outright.',
      ].join('\n');
  }
}

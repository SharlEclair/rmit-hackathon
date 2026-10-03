/**
 * Refusal, scope, clarification and escalation templates (`05-AI-GUARDRAILS.md` section 10.1).
 *
 * **Why templates rather than generated text.** `N10`: refusal text is produced from a template
 * plus a rule sentence and never by a model, so a refusal cannot hallucinate. `R13` goes further
 * and makes the rendering deterministic: same rule, same template, same wording, byte for byte.
 * That is what makes the golden set able to assert an exact string, and what makes "the refusal
 * beat" in the demo reproducible.
 *
 * **Where the `Policy:` sentence comes from.** `05` section 3.3.1 says the assignment's own
 * `rule_text` is "the one plain-language sentence in `T-REFUSE`", so when the decision is driven
 * by a policy rule (a `POL_RESTRICT`, or a decision carrying a `policyRef`) that tutor-approved
 * wording is used verbatim -- first sentence only, with any leading section label removed, so the
 * sentence reads as a policy statement rather than as "3.2 --". Every other rule uses the platform
 * sentence from `reasons.ts`.
 *
 * **Divergence recorded, not hidden.** Section 10.3's six worked refusals are rendered in an
 * inline shape with no `Policy:` line and no bullet list, while section 10.1's normative template
 * has both. This file implements 10.1, because 10.1 is the section that calls itself a template
 * and the `R`-rules reference its parts (`R6` the policy sentence, `R5` the capability list). The
 * divergence is filed as **I-29** in `docs/handoff/05-ISSUES.md`; the worked refusals remain the
 * statement of intent for tone.
 *
 * **Pure.** No I/O, no clock, no randomness.
 */

import { closingForClass, copyClassForRule, refusalCopyFor } from './refusal-copy';
import { sentenceForRule } from './reasons';
import type { GuardrailDecision, RefusalTemplateId, ScopeToken } from './types';

/** Plain words for each scope token, from `05` section 3.3.3's table. */
const SCOPE_WORDS: Readonly<Record<ScopeToken, string>> = {
  SCOPE_LOCATE: 'locating and quoting the source, without explaining what it means for your implementation',
  SCOPE_TERM: 'defining the term and pointing to where the brief uses it',
  SCOPE_RUBRIC: 'explaining what the criterion assesses in general terms',
  SCOPE_POLICY: 'quoting the approved AI Usage Policy',
  SCOPE_PROGRESS: 'summarising your own recorded progress',
};

export interface RenderOptions {
  /**
   * The approved policy rule's own wording, when the decision consulted a policy rule
   * (`05` section 3.3.1). Taken from `ai_policy_rules.rule_text` by the caller.
   */
  policyRuleText?: string | null;
  /** The answer text for `T-SCOPE`. Required for `ALLOW_WITH_SCOPE` rendering. */
  answer?: string;
}

/** Strip a leading "3.2 --" policy section label and take the first sentence, capped for `R9`. */
export function policySentenceFromRuleText(ruleText: string): string {
  const withoutLabel = ruleText.replace(/^\s*\d+(\.\d+)*\s*--\s*/, '').trim();
  const firstSentence = /^[^.!?]*[.!?]/.exec(withoutLabel)?.[0]?.trim() ?? withoutLabel;
  if (firstSentence.length <= 220) return firstSentence;
  const clipped = firstSentence.slice(0, 220);
  const lastSpace = clipped.lastIndexOf(' ');
  return `${clipped.slice(0, lastSpace > 0 ? lastSpace : 220)}...`;
}

function sentenceFor(decision: GuardrailDecision, options: RenderOptions): string {
  const policyDriven =
    options.policyRuleText != null &&
    options.policyRuleText.length > 0 &&
    (decision.rules.includes('POL_RESTRICT') ||
      decision.rules.includes('POL_SCOPE') ||
      (decision.policyRef ?? null) !== null);
  if (policyDriven) return policySentenceFromRuleText(options.policyRuleText as string);
  return sentenceForRule(decision.rules[0] ?? 'A12');
}

/** The word count `R9` bounds. Exported so the golden harness asserts the rule, not a copy of it. */
export function wordCount(text: string): number {
  return text.split(/\s+/).filter((word) => word.length > 0).length;
}

/** `T-REFUSE` (`05` section 10.1). Deterministic for a given decision and policy sentence (`R13`). */
export function renderRefusal(decision: GuardrailDecision, options: RenderOptions = {}): string {
  const primary = decision.rules[0] ?? 'A12';
  const copy = refusalCopyFor(primary);
  const copyClass = copyClassForRule(primary);
  const bullets = copy.capabilities.map((capability) => `- ${capability}`).join('\n');

  return [
    `I cannot ${copy.cannotDo} under this assignment's AI Usage Policy.`,
    '',
    `Policy: ${sentenceFor(decision, options)}`,
    '',
    'What I can help with:',
    bullets,
    '',
    closingForClass(copyClass),
  ].join('\n');
}

/** `T-SCOPE` (`05` section 10.1). */
export function renderScoped(decision: GuardrailDecision, options: RenderOptions): string {
  const scope = decision.scope ?? 'SCOPE_LOCATE';
  const answer = options.answer ?? '';
  return [
    answer,
    '',
    `Scope note: this is limited to ${SCOPE_WORDS[scope]}. For anything beyond that, the original assignment brief is the source to check, or ask your tutor privately.`,
  ].join('\n');
}

/** `T-CLARIFY` (`05` section 10.1). */
export function renderClarify(decision: GuardrailDecision): string {
  const question = decision.clarifyingQuestion ?? 'Which part of the assignment do you mean?';
  return [question, '', 'I will answer as soon as I know which part of the assignment you mean.'].join('\n');
}

/** `T-ESCALATE` (`05` section 10.1). */
export function renderEscalate(decision: GuardrailDecision, options: RenderOptions = {}): string {
  return [
    `This one needs your tutor, not me: ${sentenceFor(decision, options)}`,
    '',
    'Send this to your tutor privately? The query would carry your own words.',
  ].join('\n');
}

/** Render whatever the decision's template id names. `ALLOW` renders nothing: it is the answer. */
export function renderDecision(decision: GuardrailDecision, options: RenderOptions = {}): string {
  const template: RefusalTemplateId | null = decision.refusalTemplateId ?? null;
  switch (template) {
    case 'T-REFUSE':
      return renderRefusal(decision, options);
    case 'T-SCOPE':
      return renderScoped(decision, options);
    case 'T-CLARIFY':
      return renderClarify(decision);
    case 'T-ESCALATE':
      return renderEscalate(decision, options);
    default:
      return options.answer ?? '';
  }
}

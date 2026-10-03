/**
 * Template tests (`05-AI-GUARDRAILS.md` sections 10.1-10.3, 11.3).
 *
 * `R1`-`R14` are prose rules, so the automated half is what section 11.3 names: `R1`, `R2`, `R3`,
 * `R9`, `R11` and `R13`. They are asserted over **every** refusal-shaped rendering the golden set
 * produces, not over a hand-picked example, because the failure this guards against (a rule id or
 * a claim of safety leaking into student-facing text) is the one nobody notices by eye.
 *
 * `R13` is asserted the only way that means anything: a byte-pinned expected string for a rule, and
 * the same rendering twice.
 */

import { describe, expect, it } from 'vitest';

import { renderDecision, policySentenceFromRuleText, wordCount } from '@/lib/guardrail/templates';
import type { GuardrailDecision } from '@/lib/guardrail/types';
import { goldenCases, runCase } from './harness';

const R11_FORBIDDEN = [
  /\b(A|P|DE|INJ|AMB|ESC|UP|CL)\d{1,2}\b/,
  /\b(POL|SYS|POST|RET)_[A-Z_]+\b/,
  /\b(ALLOW|REFUSE|CLARIFY|ALLOW_WITH_SCOPE|ESCALATE_TO_TUTOR|NEEDS_REVIEW)\b/,
  /guardrail-v\d/,
  /\b(explain_terminology|interpret_rubric|navigate_structure|quote_source_verbatim|locate_source|explain_ai_policy|self_check_prompts|summarise_own_progress|explain_constraints)\b/,
  /\b(policy_guard|student_assistant|attachment_extraction|mock-guardrail-v\d)\b/,
];

const R2_FORBIDDEN = /\b(that is close|you are on the right track|you'?re on the right track|almost there|good start|well done|almost)\b/i;

const R3_FORBIDDEN = /\b(redis|kafka|graphql|postgres|mysql|mongodb|docker|kubernetes|rails|django|flask|fastapi|spring|express|react|vue|angular|webpack|nginx|terraform)\b/i;

const refusingCases = goldenCases().filter(
  (testCase) => testCase.expectedVerdict === 'REFUSE' || testCase.expectedVerdict === 'CLARIFY' || testCase.expectedVerdict === 'ESCALATE_TO_TUTOR',
);

describe('R1/R2/R3/R9/R11 hold for every refusal-shaped rendering', () => {
  it.each(refusingCases.map((testCase) => [testCase.id, testCase] as const))(
    '%s renders text a student can act on, with no leak and no judgement',
    async (id: string, testCase: (typeof refusingCases)[number]) => {
      const { result } = await runCase(testCase);
      const rendered = result.rendered;

      // R11: no internals.
      for (const pattern of R11_FORBIDDEN) {
        expect(rendered, `${id} leaked internals matching ${pattern}`).not.toMatch(pattern);
      }
      // R2: never evaluate, rank or reassure.
      expect(rendered, `${id} contained reassurance`).not.toMatch(R2_FORBIDDEN);
      // R3: never introduce a technology.
      expect(rendered, `${id} introduced a technology`).not.toMatch(R3_FORBIDDEN);
      // R9: maximum 120 words.
      expect(wordCount(rendered), `${id} exceeded 120 words`).toBeLessThanOrEqual(120);

      // R1: never echo a long verbatim span of the student's turn.
      if (testCase.input.trim().split(/\s+/).length >= 13) {
        const words = testCase.input.toLowerCase().split(/\s+/);
        for (let index = 0; index + 13 <= words.length; index += 1) {
          const span = words.slice(index, index + 13).join(' ');
          expect(rendered.toLowerCase(), `${id} echoed a 13-token span`).not.toContain(span);
        }
      }

      // R10/R14: never leave the student with nothing.
      expect(rendered.length).toBeGreaterThan(40);
    },
  );
});

describe('R13 -- rendering is deterministic and byte-pinned', () => {
  it('renders the P5 refusal byte-identically, twice', async () => {
    const testCase = goldenCases().find((candidate) => candidate.id === 'G01');
    if (!testCase) throw new Error('G01 missing');
    const first = await runCase(testCase);
    const second = await runCase(testCase);

    const expected = [
      "I cannot write, complete, debug or fix code for you under this assignment's AI Usage Policy.",
      '',
      'Policy: Diagnosing or fixing your own implementation is part of the work being assessed, so I cannot do it.',
      '',
      'What I can help with:',
      '- finding the exact wording in the brief, with the page it came from',
      '- suggesting questions you can ask yourself before you continue',
      '- helping you put a question to your tutor',
      '',
      'You can also ask your tutor privately if this needs a decision from them.',
    ].join('\n');

    expect(first.result.rendered).toBe(expected);
    expect(second.result.rendered).toBe(first.result.rendered);
  });

  it('gives two different cases that cite the same primary rule the same refusal body', async () => {
    const g01 = goldenCases().find((candidate) => candidate.id === 'G01');
    const g06 = goldenCases().find((candidate) => candidate.id === 'G06');
    if (!g01 || !g06) throw new Error('cases missing');
    const first = await runCase(g01);
    const second = await runCase(g06);
    expect(first.result.decision.rules[0]).toBe('P5');
    expect(second.result.decision.rules[0]).toBe('P5');
    expect(second.result.rendered).toBe(first.result.rendered);
  });
});

describe('the policy sentence is taken from the approved rule text', () => {
  it('strips a leading policy section label and keeps the first sentence', () => {
    expect(
      policySentenceFromRuleText(
        '3.2 -- Do not have AI evaluate your work. Do not ask an AI tool to mark, grade or score a draft.',
      ),
    ).toBe('Do not have AI evaluate your work.');
  });

  it('keeps the whole first sentence when there is no label', () => {
    expect(policySentenceFromRuleText('Quote the brief verbatim.')).toBe('Quote the brief verbatim.');
  });

  it('caps a long sentence without cutting mid-word', () => {
    const long = `${'word '.repeat(80)}end.`;
    const sentence = policySentenceFromRuleText(long);
    expect(sentence.length).toBeLessThanOrEqual(223);
    expect(sentence.endsWith('...')).toBe(true);
  });

  it('uses the policy wording when the decision is policy-restricted', () => {
    const decision: GuardrailDecision = {
      verdict: 'REFUSE',
      rules: ['POL_RESTRICT'],
      reasonCode: 'POLICY_RESTRICTS_REQUEST',
      deterministic: true,
      confidence: 'high',
      scope: null,
      clarifyingQuestion: null,
      policyRef: { policyId: 'pol_asg_demo_v1', version: 1 },
      refusalTemplateId: 'T-REFUSE',
      promptVersion: 'guardrail-v1',
      modelId: null,
    };
    const rendered = renderDecision(decision, {
      policyRuleText: '4.1 -- Explaining general concepts is permitted, and nothing else in this section is.',
    });
    expect(rendered).toContain('Policy: Explaining general concepts is permitted');
  });
});

describe('the other three templates carry their own shape', () => {
  it('T-SCOPE states the limit and points back at the brief', () => {
    const decision: GuardrailDecision = {
      verdict: 'ALLOW_WITH_SCOPE',
      rules: ['A5', 'POL_SCOPE'],
      reasonCode: 'POLICY_APPROVED',
      deterministic: false,
      confidence: 'high',
      scope: 'SCOPE_TERM',
      clarifyingQuestion: null,
      policyRef: { policyId: 'pol_asg_demo_v1', version: 1 },
      refusalTemplateId: 'T-SCOPE',
      promptVersion: 'guardrail-v1',
      modelId: 'mock-guardrail-v1',
    };
    const rendered = renderDecision(decision, { answer: 'A term means a thing.' });
    expect(rendered).toContain('A term means a thing.');
    expect(rendered).toContain('Scope note: this is limited to defining the term');
  });

  it('T-CLARIFY asks one question and promises to answer after it', () => {
    const decision: GuardrailDecision = {
      verdict: 'CLARIFY',
      rules: ['AMB1'],
      reasonCode: 'REFERENT_AMBIGUOUS',
      deterministic: true,
      confidence: 'high',
      scope: null,
      clarifyingQuestion: 'Which part of the assignment do you mean?',
      policyRef: null,
      refusalTemplateId: 'T-CLARIFY',
      promptVersion: 'guardrail-v1',
      modelId: null,
    };
    const rendered = renderDecision(decision);
    expect(rendered).toContain('Which part of the assignment do you mean?');
    expect(rendered).toContain('I will answer as soon as I know');
    expect(wordCount(rendered)).toBeLessThanOrEqual(120);
  });

  it('T-ESCALATE hands off to the tutor and offers the private query', () => {
    const decision: GuardrailDecision = {
      verdict: 'ESCALATE_TO_TUTOR',
      rules: ['ESC4'],
      reasonCode: 'SOURCES_SILENT_ON_ASSIGNMENT_FACT',
      deterministic: true,
      confidence: 'high',
      scope: null,
      clarifyingQuestion: null,
      policyRef: null,
      refusalTemplateId: 'T-ESCALATE',
      promptVersion: 'guardrail-v1',
      modelId: null,
    };
    const rendered = renderDecision(decision);
    expect(rendered).toContain('This one needs your tutor, not me:');
    expect(rendered).toContain('Send this to your tutor privately?');
  });

  it('renders nothing for an ALLOW decision, because the answer is the answer', () => {
    const decision: GuardrailDecision = {
      verdict: 'ALLOW',
      rules: ['A4'],
      reasonCode: 'POLICY_APPROVED',
      deterministic: true,
      confidence: 'high',
      scope: null,
      clarifyingQuestion: null,
      policyRef: null,
      refusalTemplateId: null,
      promptVersion: 'guardrail-v1',
      modelId: null,
    };
    expect(renderDecision(decision, { answer: 'the answer text' })).toBe('the answer text');
  });
});

/**
 * L5 post-check tests (`05-AI-GUARDRAILS.md` section 3.2.3).
 *
 * Each trip in the table is asserted against a fixture answer, and the two properties that make
 * this layer defensible are asserted separately: a permitted `A5` answer may carry zero citations
 * (section 5.1 rule 2), and the tripped answer is retained only as a hash, never as text.
 */

import { describe, expect, it } from 'vitest';

import { normaliseTurn } from '@/lib/guardrail/normalise';
import { runPostCheck } from '@/lib/guardrail/post-check';
import type { GuardrailDecision } from '@/lib/guardrail/types';
import { demoSources, goldenCases, postCheckAnswers, runCase } from './harness';

const fixtures = postCheckAnswers();

const allowedDecision: GuardrailDecision = {
  verdict: 'ALLOW',
  rules: ['A4'],
  reasonCode: 'POLICY_APPROVED',
  deterministic: true,
  confidence: 'high',
  scope: null,
  clarifyingQuestion: null,
  policyRef: { policyId: 'pol_asg_demo_v1', version: 1 },
  refusalTemplateId: null,
  promptVersion: 'guardrail-v1',
  modelId: null,
};

const generalDecision: GuardrailDecision = { ...allowedDecision, rules: ['A5'] };

const studentTurn = normaliseTurn('Where in the brief does it mention the required number of references?');
const retrieved = demoSources().map((chunk) => chunk.chunkId);
const sourceTexts = demoSources().map((chunk) => chunk.text);

function check(answer: string, decision: GuardrailDecision = allowedDecision, cited = ['chunk_brief_p3']) {
  return runPostCheck(
    {
      answerMarkdown: answer,
      studentTurn,
      decision,
      retrievedChunkIds: retrieved,
      citedChunkIds: cited,
    },
    sourceTexts,
  );
}

describe('every trip of 05 section 3.2.3 fires on its own fixture', () => {
  const single = fixtures.answers.filter((entry) => !entry.id);

  it.each(single.map((entry) => [entry.tripId, entry] as const))(
    '%s replaces the answer and cites the mapped rule',
    (
      tripId: string,
      entry: { answer: string; citedRule: string; tripId: string; citedChunkIds: string[]; studentTurn?: string },
    ) => {
      const result = runPostCheck(
        {
          answerMarkdown: entry.answer,
          studentTurn: normaliseTurn(entry.studentTurn ?? studentTurn.raw),
          decision: allowedDecision,
          retrievedChunkIds: retrieved,
          citedChunkIds: entry.citedChunkIds,
        },
        sourceTexts,
      );
      expect(result.trip?.ruleId).toBe(tripId);
      expect(result.trip?.citedRule).toBe(entry.citedRule);
      expect(result.answerHash).toMatch(/^[0-9a-f]{64}$/);
      expect(result.secondRecordRules).toContain(tripId);
      expect(result.secondRecordRules).toContain('A4');
    },
  );

  it('catches a bare SQL statement as a code-shaped answer', () => {
    const sql = fixtures.answers.find((entry) => entry.id === 'POST_CODE_SQL');
    if (!sql) throw new Error('POST_CODE_SQL fixture missing');
    expect(check(sql.answer, allowedDecision, sql.citedChunkIds).trip?.ruleId).toBe('POST_CODE');
  });
});

describe('the two properties that keep the post-check honest', () => {
  it('permits a general terminology answer with zero citations (05 section 5.1 rule 2)', () => {
    const result = check(fixtures.cleanAnswer.answer, generalDecision, []);
    expect(result.trip).toBeNull();
    expect(result.answerHash).toBeNull();
    expect(result.secondRecordRules).toEqual(['A5']);
  });

  it('trips an assignment-specific answer with zero citations as unsourced', () => {
    expect(check('Requirement 4 says the endpoint must be idempotent.', allowedDecision, []).trip?.ruleId).toBe(
      'POST_UNSOURCED',
    );
  });

  it('trips a citation that was not in the retrieved set', () => {
    expect(check(fixtures.cleanAnswer.answer, allowedDecision, ['chunk_not_retrieved']).trip?.ruleId).toBe(
      'POST_UNSOURCED',
    );
  });

  it('keeps the answer as a hash, not as text, in the second record', () => {
    const result = check('Your approach is correct and you are on the right track.');
    expect(result.answerHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(result)).not.toContain('right track');
  });

  it('does not trip a permitted answer that stays inside its scope', () => {
    const answer =
      'The page states: "The report must not exceed 2500 words." That is the constraint the brief states, quoted verbatim.';
    expect(check(answer).trip).toBeNull();
  });
});

describe('POST is a variant of every generating golden case (05 section 11.4)', () => {
  it('replaces a prohibited answer for each ALLOW and ALLOW_WITH_SCOPE case', async () => {
    const generating = goldenCases().filter(
      (testCase) => testCase.expectedVerdict === 'ALLOW' || testCase.expectedVerdict === 'ALLOW_WITH_SCOPE',
    );
    expect(generating.length).toBe(17);
    const prohibited = fixtures.answers[0];
    if (!prohibited) throw new Error('no POST fixture');

    for (const testCase of generating) {
      const { result } = await runCase(testCase);
      const postCheck = runPostCheck(
        {
          answerMarkdown: prohibited.answer,
          studentTurn: normaliseTurn(testCase.input),
          decision: result.decision,
          retrievedChunkIds: retrieved,
          citedChunkIds: result.decision.rules.includes('A5') ? [] : ['chunk_brief_p1'],
        },
        sourceTexts,
      );
      expect(postCheck.trip?.ruleId, `${testCase.id} must trip on a fenced code block`).toBe('POST_CODE');
    }
  });
});

/**
 * The golden set: all 53 cases of `05-AI-GUARDRAILS.md` section 11.6, G01-G53.
 *
 * **Every case executes. There is no skip list** (`05` section 11.5, WP-08's acceptance criteria):
 * the four upload cases run against real attachments, and the two picker cases assert refusal
 * before the guard. The count and the class distribution are asserted against section 11.5's table
 * in the same file, so a case cannot be quietly deleted.
 *
 * **What a case asserts** (`05` section 11.3):
 * 1. the exact verdict;
 * 2. every rule id in the case's `Rules` column appears in the decision;
 * 3. the layer semantics: `DET` never consults the classifier, `DET+EXTRACT` makes exactly one
 *    extraction call and no classifier call, `MODEL` makes exactly one classifier call, `PICKER`
 *    makes no calls of any kind;
 * 4. the decision and the log row carry the turn hash and no student text;
 * 5. `deterministic` matches the layer, and a deterministic decision carries no model id.
 *
 * A change to guardrail behaviour without a case here is an incomplete change (`N5`).
 */

import { describe, expect, it } from 'vitest';

import { KNOWN_RULE_IDS, mayGenerate } from '@/lib/guardrail/types';
import { goldenCases, runCase, type GoldenCase } from './harness';

const cases = goldenCases();

/** `05` section 11.5's distribution table. Changing these numbers is a spec change, not a test fix. */
const DISTRIBUTION = {
  total: 53,
  REFUSE: 30,
  ALLOW: 15,
  ALLOW_WITH_SCOPE: 2,
  CLARIFY: 3,
  ESCALATE_TO_TUTOR: 3,
};

describe('05-ISSUES: the golden set is complete and unmodified', () => {
  it('has exactly the 53 cases of section 11.5, with no duplicate ids', () => {
    expect(cases).toHaveLength(DISTRIBUTION.total);
    const ids = cases.map((testCase) => testCase.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (let index = 1; index <= 53; index += 1) {
      expect(ids).toContain(`G${String(index).padStart(2, '0')}`);
    }
  });

  it("matches section 11.5's verdict distribution exactly", () => {
    const counted = cases.reduce<Record<string, number>>((accumulator, testCase) => {
      accumulator[testCase.expectedVerdict] = (accumulator[testCase.expectedVerdict] ?? 0) + 1;
      return accumulator;
    }, {});
    expect(counted).toEqual({
      REFUSE: DISTRIBUTION.REFUSE,
      ALLOW: DISTRIBUTION.ALLOW,
      ALLOW_WITH_SCOPE: DISTRIBUTION.ALLOW_WITH_SCOPE,
      CLARIFY: DISTRIBUTION.CLARIFY,
      ESCALATE_TO_TUTOR: DISTRIBUTION.ESCALATE_TO_TUTOR,
    });
  });

  it('has no MODALITY skip marker anywhere', () => {
    const serialised = JSON.stringify(cases);
    expect(serialised).not.toMatch(/MODALITY/);
    expect(serialised).not.toMatch(/skip/i);
  });
});

describe.each(cases.map((testCase) => [testCase.id, testCase] as const))(
  'golden case %s',
  (id: string, testCase: GoldenCase) => {
    it(`${testCase.layer} -> ${testCase.expectedVerdict}: ${testCase.input || '(no text)'}`, async () => {
      const { result, extractor, classifier } = await runCase(testCase);
      const { decision } = result;

      // 1. The verdict is exact.
      expect(decision.verdict).toBe(testCase.expectedVerdict);

      // 2. Every expected rule id is cited, and every cited id is in the known namespace.
      for (const rule of testCase.expectedRules) {
        expect(decision.rules, `${id} must cite ${rule}`).toContain(rule);
      }
      for (const rule of decision.rules) {
        expect(KNOWN_RULE_IDS.has(rule), `${id} cites unknown rule ${rule}`).toBe(true);
      }

      // 3. Layer semantics (05 section 11.3 / 11.4).
      switch (testCase.layer) {
        case 'DET':
          expect(classifier.calls, `${id}: DET must bypass the classifier`).toHaveLength(0);
          if (!mayGenerate(decision.verdict)) {
            expect(extractor.calls, `${id}: a DET refusal makes no adapter call at all`).toHaveLength(0);
          }
          break;
        case 'DET+EXTRACT':
          expect(extractor.calls, `${id}: exactly one extraction call`).toHaveLength(1);
          expect(classifier.calls, `${id}: DET+EXTRACT must bypass the classifier`).toHaveLength(0);
          expect(result.uploadClassifications[0]?.code).toBe(testCase.expectedClassification);
          break;
        case 'MODEL':
          expect(classifier.calls, `${id}: exactly one classifier call`).toHaveLength(1);
          expect(extractor.calls).toHaveLength(0);
          break;
        case 'PICKER':
          expect(extractor.calls, `${id}: refused before extraction`).toHaveLength(0);
          expect(classifier.calls, `${id}: refused before the classifier`).toHaveLength(0);
          expect(result.pickerRefusal).toBe(true);
          break;
      }

      // 4. No content in the decision or the log row: only the hash (N4, 05 section 8.2).
      expect(result.logRecord.turnContentHash).toMatch(/^[0-9a-f]{64}$/);
      if (testCase.input.trim().length > 0) {
        const serialised = `${JSON.stringify(decision)} ${JSON.stringify(result.logRecord)}`.toLowerCase();
        expect(serialised).not.toContain(testCase.input.trim().toLowerCase());
      }

      // 5. Determinism is a layer property, and a deterministic decision has no model.
      if (testCase.layer === 'DET' || testCase.layer === 'DET+EXTRACT' || testCase.layer === 'PICKER') {
        expect(decision.deterministic).toBe(true);
        expect(decision.modelId ?? null).toBeNull();
      } else {
        expect(decision.deterministic).toBe(false);
        expect(decision.modelId).toBe('mock-guardrail-v1');
      }

      // The harness surfaces no unexpected problem. A warning here is a bug worth failing on.
      expect(result.errors, `${id} produced guardrail errors`).toEqual([]);
    });
  },
);

describe('the refusal path renders for every refusing case', () => {
  it.each(
    cases
      .filter((testCase) => !mayGenerate(testCase.expectedVerdict as never))
      .map((testCase) => [testCase.id, testCase] as const),
  )('%s renders refusal-shaped text, never the answer', async (_id: string, testCase: GoldenCase) => {
    const { result } = await runCase(testCase);
    expect(result.rendered.length).toBeGreaterThan(0);
    if (result.decision.verdict === 'ALLOW' || result.decision.verdict === 'ALLOW_WITH_SCOPE') {
      throw new Error('a generating verdict must not be in the refusing set');
    }
    expect(result.decision.refusalTemplateId).not.toBeNull();
  });
});

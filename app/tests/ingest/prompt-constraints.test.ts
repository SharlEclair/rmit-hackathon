/**
 * The deterministic Analyst constraints (`src/features/ingest/prompt-constraints.ts`).
 *
 * D20 and O1 are enforced here rather than trusted to the prompt, because a prompt is advice and
 * these are rules: an item that names an implementation action is above the planning level whatever
 * the model believed it was doing, and a quote that is not a span of the source is not the
 * requirement (C2, I-2).
 */

import { describe, expect, it } from 'vitest';

import {
  checkChecklistItem,
  findImplementationVerb,
  findOverlappingRequirements,
  isVerbatimSubstring,
  weightAppearsInText,
} from '@/features/ingest/prompt-constraints';

describe('checkChecklistItem (06 section 7.2.10 rule 2, D20)', () => {
  it('accepts each of the six planning verbs', () => {
    for (const verb of ['Understand', 'Identify', 'Plan', 'Verify', 'Review', 'Note']) {
      const result = checkChecklistItem(`${verb} the marking criteria`);
      expect(result.planningLevel, verb).not.toBeNull();
      expect(result.warnings).toHaveLength(0);
    }
  });

  it('reports a verb outside the allowed set', () => {
    const result = checkChecklistItem('Analyse the marking criteria');
    expect(result.planningLevel).toBeNull();
    expect(result.warnings.map((warning) => warning.code)).toContain('CHECKLIST_VERB_MISMATCH');
  });

  it('rejects an item naming an implementation action even when it opens with a planning verb', () => {
    const result = checkChecklistItem('Plan how to implement the endpoint');
    expect(result.planningLevel).toBe('plan');
    expect(result.warnings.map((warning) => warning.code)).toContain('CHECKLIST_IMPERATIVE');
  });

  it('catches each documented implementation verb', () => {
    for (const verb of ['implement', 'build', 'write', 'code', 'design', 'deploy', 'fix', 'debug', 'solve']) {
      expect(findImplementationVerb(`Note the ${verb} step`), verb).toBe(verb);
    }
  });

  it('does not fire on a word that merely contains an implementation verb', () => {
    expect(findImplementationVerb('Identify the builder pattern in the brief')).toBeNull();
    expect(findImplementationVerb('Understand the design brief')).toBe('design');
  });
});

describe('isVerbatimSubstring (I-2, C2)', () => {
  const source = 'The report must be 1,800 words and use APA 7th referencing throughout.';

  it('accepts an exact span, ignoring extractor whitespace', () => {
    expect(isVerbatimSubstring('must be 1,800 words', source)).toBe(true);
    expect(isVerbatimSubstring('The report must be\n1,800 words', source)).toBe(true);
  });

  it('rejects a re-wording', () => {
    expect(isVerbatimSubstring('the report needs to be 1,800 words', source)).toBe(false);
    expect(isVerbatimSubstring('at least 1,800 words', source)).toBe(false);
  });

  it('rejects an empty quote', () => {
    expect(isVerbatimSubstring('   ', source)).toBe(false);
  });
});

describe('weightAppearsInText (06 section 7.2.6)', () => {
  it('finds a stated weight', () => {
    expect(weightAppearsInText(25, 'Criterion 2 carries 25% of the mark.')).toBe(true);
    expect(weightAppearsInText(12.5, 'Weighted at 12.5 percent.')).toBe(true);
  });

  it('does not treat an unrelated number as the weight', () => {
    expect(weightAppearsInText(25, 'The report is 1250 words long.')).toBe(false);
    expect(weightAppearsInText(30, 'Criterion 2 carries 25% of the mark.')).toBe(false);
  });
});

describe('findOverlappingRequirements', () => {
  it('flags the second node that quotes the same passage', () => {
    const warnings = findOverlappingRequirements([
      { id: 'a', verbatimText: 'must be 1,800 words' },
      { id: 'b', verbatimText: 'Must be  1,800  words' },
      { id: 'c', verbatimText: 'use APA 7th' },
    ]);
    expect(warnings.has('b')).toBe(true);
    expect(warnings.has('a')).toBe(false);
    expect(warnings.has('c')).toBe(false);
  });
});

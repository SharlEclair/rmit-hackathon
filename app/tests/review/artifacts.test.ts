/**
 * The pure half of the review surface: field immutability, the D53 no-op rule, the recomputed
 * validation, the computed tier, and the publish gates.
 *
 * **What this suite would catch**, in the order the failures matter:
 *
 *   - a payload that can change `requirement_nodes.verbatim_text` or `rubric_sections.criteria_text`,
 *     which is C2's failure mode expressed as an API;
 *   - a `save` that reports `EDITED` for a payload identical to the stored row, which would clear an
 *     `APPROVED` artifact's stamp and hide it from students (D53, transition 6);
 *   - a checklist item whose stored `planning_level` contradicts its own wording (`06` section 7.2.10
 *     rule 2, D20);
 *   - `APPROVED` treated as student-visible by the tier computation, which is the I-21 tension;
 *   - a publish that goes through with no approved policy rule, no milestone, a milestone with no
 *     requirement link, or an approved artifact carrying a warning (`06` section 5.5.8).
 *
 * Offline and pure: no database, no session, no provider (`12` section 3.7).
 */

import { describe, expect, it } from 'vitest';

import {
  EDITABLE_FIELDS,
  IMMUTABLE_FIELDS,
  approvalAllowed,
  derivePlanningLevel,
  isAcknowledgable,
  payloadChangesAnything,
  refusedPayloadKeys,
  truthTierFor,
  validationFor,
} from '@/features/review/artifacts';
import { checkPolicyRuleCode, isAssistantApplicable, isCapabilityRule } from '@/features/review/policy-rules';
import { computeGates } from '@/features/review/gates';
import type { GateInputs } from '@/lib/db/queries/review';
import type { ReviewArtifactResponse } from '@/lib/api/types';

const EMPTY_GATES: GateInputs = {
  sourceCount: 2,
  activeJobCount: 0,
  milestoneCount: 5,
  milestonesWithoutRequirement: 0,
  approvedPolicyRuleCount: 1,
  approvedArtifactCount: 12,
};

function artifact(
  overrides: Partial<ReviewArtifactResponse> = {},
): ReviewArtifactResponse {
  return {
    id: 'a',
    kind: 'milestone',
    publicationStatus: 'APPROVED',
    truthTier: 'T3',
    origin: 'ai',
    provenance: {
      modelId: 'gemini-3.8-flash',
      promptVersion: 'analyst-v1',
      generatedAt: '2026-10-04T00:00:00.000Z',
      groundingChunkIds: [],
    },
    revision: 2,
    payload: {
      title: 'Design',
      summary: null,
      displayOrder: 0,
    },
    validation: { ok: true, warnings: [] },
    ...overrides,
  };
}

describe('the T1 verbatim fields are immutable (C2, I-2)', () => {
  it('refuses verbatimText on a requirement node and criteriaText on a rubric section', () => {
    expect(refusedPayloadKeys('requirement_node', { verbatimText: 'other' })).toEqual([
      'verbatimText',
    ]);
    expect(refusedPayloadKeys('rubric_section', { criteriaText: 'other' })).toEqual(['criteriaText']);
  });

  it('allows the editable interpretation fields', () => {
    expect(refusedPayloadKeys('requirement_node', { mapSummary: 'x', title: 'y' })).toEqual([]);
    expect(EDITABLE_FIELDS['requirement_node']).toContain('mapSummary');
    expect(IMMUTABLE_FIELDS['requirement_node']).toContain('verbatimText');
  });

  it('refuses every field of a structure, which has none editable', () => {
    expect(refusedPayloadKeys('structure', { version: 4 })).toEqual(['version']);
    expect(EDITABLE_FIELDS['structure']).toEqual([]);
  });

  it('refuses an unknown key rather than ignoring it', () => {
    // A client that believes it wrote a field must not get a 200 for a no-op.
    expect(refusedPayloadKeys('milestone', { nope: 1 })).toEqual(['nope']);
  });

  it('refuses a planning level sent by a client, because the wording decides it', () => {
    expect(refusedPayloadKeys('checklist_item', { planningLevel: 'plan' })).toEqual([
      'planningLevel',
    ]);
  });
});

describe('D53: a save that changes nothing is not an edit', () => {
  it('reports no change for an identical payload', () => {
    expect(payloadChangesAnything({ title: 'Design', summary: null }, { title: 'Design' })).toBe(
      false,
    );
  });

  it('ignores keys the client did not send', () => {
    expect(payloadChangesAnything({ title: 'Design' }, { summary: undefined })).toBe(false);
  });

  it('sees a real change, including clearing a nullable field', () => {
    expect(payloadChangesAnything({ summary: 'x' }, { summary: null })).toBe(true);
    expect(payloadChangesAnything({ title: 'Design' }, { title: 'Implementation' })).toBe(true);
  });

  it('treats a numeric column arriving as a string as unchanged (numeric columns are strings)', () => {
    // `weight_percent` is `numeric(5,2)`, which the driver returns as a string. A save that did not
    // touch it must not bump the revision and must not move an APPROVED row to EDITED.
    expect(payloadChangesAnything({ weightPercent: '25.00' }, { weightPercent: 25 })).toBe(false);
  });
});

describe('validation is recomputed from the stored text, never stored', () => {
  it('flags a requirement whose quote is not a passage of the cited chunk', () => {
    const result = validationFor({
      kind: 'requirement_node',
      citedChunkId: 'c',
      citedChunkText: 'Submit one file only.',
      groundingChunkIds: ['c'],
      verbatimText: 'Submit two files.',
    });
    expect(result.ok).toBe(false);
    expect(result.warnings.map((warning) => warning.code)).toContain('VERBATIM_MISMATCH');
  });

  it('accepts a quote that differs only in whitespace, which the extractor can produce', () => {
    const result = validationFor({
      kind: 'requirement_node',
      citedChunkId: 'c',
      citedChunkText: 'Submit one\nfile only.',
      groundingChunkIds: ['c'],
      verbatimText: 'Submit one file only.',
    });
    expect(result.warnings).toEqual([]);
  });

  it('flags an ungrounded artifact, which cannot be traced to the documents', () => {
    const result = validationFor({
      kind: 'milestone',
      citedChunkId: null,
      citedChunkText: null,
      groundingChunkIds: [],
    });
    expect(result.warnings.map((warning) => warning.code)).toEqual(['UNGROUNDED_ARTIFACT']);
  });

  it('flags a rubric weight that is not in the cited criterion text', () => {
    const result = validationFor({
      kind: 'rubric_section',
      citedChunkId: 'c',
      citedChunkText: 'Analysis is worth 40 percent.',
      groundingChunkIds: ['c'],
      criteriaText: 'Analysis is worth 40 percent.',
      weightPercent: 60,
    });
    expect(result.warnings.map((warning) => warning.code)).toEqual(['WEIGHT_NOT_FOUND']);
  });

  it('carries the two checklist constraints for an implementation-shaped item', () => {
    const result = validationFor({
      kind: 'checklist_item',
      citedChunkId: null,
      citedChunkText: null,
      groundingChunkIds: [],
      checklistTitle: 'Implement endpoints',
    });
    const codes = result.warnings.map((warning) => warning.code);
    expect(codes).toContain('CHECKLIST_VERB_MISMATCH');
    expect(codes).toContain('CHECKLIST_IMPERATIVE');
  });
});

describe('approval respects the warning rules of 06 section 5.5.8', () => {
  it('cannot acknowledge a VERBATIM_MISMATCH', () => {
    expect(isAcknowledgable('VERBATIM_MISMATCH')).toBe(false);
    const result = approvalAllowed([{ code: 'VERBATIM_MISMATCH', message: 'x' }], [
      'VERBATIM_MISMATCH',
    ]);
    expect(result.ok).toBe(false);
  });

  it('requires every other warning to be acknowledged', () => {
    const warnings = [
      { code: 'WEIGHT_NOT_FOUND' as const, message: 'x' },
      { code: 'UNGROUNDED_ARTIFACT' as const, message: 'y' },
    ];
    expect(approvalAllowed(warnings, ['WEIGHT_NOT_FOUND']).ok).toBe(false);
    expect(approvalAllowed(warnings, ['WEIGHT_NOT_FOUND', 'UNGROUNDED_ARTIFACT']).ok).toBe(true);
  });

  it('allows an artifact with no warnings', () => {
    expect(approvalAllowed([], undefined).ok).toBe(true);
  });
});

describe('the computed tier follows 06 section 2.2', () => {
  it('gives an approved milestone T3 and an unapproved one T5', () => {
    expect(truthTierFor('milestone', 'APPROVED')).toBe('T3');
    expect(truthTierFor('milestone', 'PUBLISHED')).toBe('T3');
    expect(truthTierFor('milestone', 'NEEDS_REVIEW')).toBe('T5');
    expect(truthTierFor('checklist_item', 'EDITED')).toBe('T5');
  });

  it('gives a published FAQ entry and policy rule T2', () => {
    expect(truthTierFor('faq_entry', 'PUBLISHED')).toBe('T2');
    expect(truthTierFor('ai_policy_rule', 'APPROVED')).toBe('T2');
    expect(truthTierFor('ai_policy_rule', 'NEEDS_REVIEW')).toBe('T5');
  });

  it('keeps the verbatim artifacts at T1 and the structure at T5', () => {
    expect(truthTierFor('requirement_node', 'PUBLISHED')).toBe('T1');
    expect(truthTierFor('rubric_section', 'APPROVED')).toBe('T1');
    expect(truthTierFor('structure', 'PUBLISHED')).toBe('T5');
  });
});

describe('the planning level follows the wording, not the client', () => {
  it('derives each of the six levels from the opening verb', () => {
    expect(derivePlanningLevel('Understand the marking criteria')).toBe('understand');
    expect(derivePlanningLevel('Identify the deliverables')).toBe('identify');
    expect(derivePlanningLevel('Plan the submission order')).toBe('plan');
    expect(derivePlanningLevel('Verify the word count')).toBe('verify');
    expect(derivePlanningLevel('Review the rubric weightings')).toBe('review');
    expect(derivePlanningLevel('Note the due date')).toBe('note');
  });

  it('derives null for wording that names an implementation action', () => {
    expect(derivePlanningLevel('Implement the endpoints')).toBeNull();
  });
});

describe('the AI Usage Policy rule-code guard (T22, D83, T31)', () => {
  it('refuses an unmapped code on a capability rule that applies to the assistant', () => {
    const result = checkPolicyRuleCode('totally_new_code', 'assistant', 'PROHIBIT');
    expect(result.ok).toBe(false);
    expect(result.message).toContain('totally_new_code');
    expect(result.message).toMatch(/disable the Assistant/);
  });

  it('allows an unmapped code scoped away from the assistant, which cannot cause POL_INVALID', () => {
    expect(checkPolicyRuleCode('some_upload_rule', 'uploads', 'ALLOW').ok).toBe(true);
  });

  it('allows an unmapped ESCALATE_TO_TUTOR or CLARIFY rule, which the guardrail does not map', () => {
    // T31: `policyFromRows` enforces these two effects through a named subject and never consults the
    // capability table, so demanding a mapping here would refuse `route_uncertain_requests_to_tutor`
    // -- the seeded demo policy's own escalation rule. Phase 4's acceptance run found exactly that.
    expect(checkPolicyRuleCode('route_uncertain_requests_to_tutor', 'assistant', 'ESCALATE_TO_TUTOR').ok).toBe(
      true,
    );
    expect(checkPolicyRuleCode('no_such_code_at_all', 'assistant', 'CLARIFY').ok).toBe(true);
    expect(checkPolicyRuleCode('no_such_code_at_all', 'all', 'ESCALATE_TO_TUTOR').ok).toBe(true);
  });

  it('still refuses an unmapped CLARIFY code on a capability rule, whatever the effect name', () => {
    expect(checkPolicyRuleCode('no_such_code_at_all', 'assistant', 'PROHIBIT').ok).toBe(false);
    expect(checkPolicyRuleCode('no_such_code_at_all', 'assistant', 'ALLOW').ok).toBe(false);
  });

  it('allows a mapped code and reports its capabilities', () => {
    const seeded = 'no_ai_evaluation_of_work';
    const result = checkPolicyRuleCode(seeded, 'assistant', 'PROHIBIT');
    expect(result.ok).toBe(true);
    expect(result.capabilities?.length ?? 0).toBeGreaterThan(0);
  });

  it('refuses a code that does not match the column shape before it reaches the CHECK', () => {
    expect(checkPolicyRuleCode('No-Caps', 'assistant', 'PROHIBIT').ok).toBe(false);
    expect(checkPolicyRuleCode('ab', 'assistant', 'PROHIBIT').ok).toBe(false);
  });

  it('agrees with the guardrail about which effects need a capability mapping', () => {
    // T31's pin: if `policyFromRows` ever changes which effects consult the table, this predicate and
    // the guardrail diverge, and the divergence is a false refusal rather than a visible failure.
    expect(isCapabilityRule('ALLOW')).toBe(true);
    expect(isCapabilityRule('PROHIBIT')).toBe(true);
    expect(isCapabilityRule('ESCALATE_TO_TUTOR')).toBe(false);
    expect(isCapabilityRule('CLARIFY')).toBe(false);
  });

  it('treats applies_to "all" as assistant-applicable', () => {
    expect(isAssistantApplicable('all')).toBe(true);
    expect(isAssistantApplicable('discussion')).toBe(false);
    expect(isAssistantApplicable('uploads')).toBe(false);
    expect(isAssistantApplicable('assistant')).toBe(true);
  });
});

describe('the publish gates (06 section 5.5.8)', () => {
  it('blocks publish with no approved AI Usage Policy rule (D47)', () => {
    const gates = computeGates('in_review', { ...EMPTY_GATES, approvedPolicyRuleCount: 0 }, [
      artifact(),
    ]);
    expect(gates.canPublish).toBe(false);
    expect(gates.publishBlockers).toContain('NO_POLICY_RULE_APPROVED');
  });

  it('blocks publish with no milestone, which renders a broken student workspace', () => {
    const gates = computeGates('in_review', { ...EMPTY_GATES, milestoneCount: 0 }, [artifact()]);
    expect(gates.publishBlockers).toContain('NO_MILESTONE');
  });

  it('blocks a milestone with no requirement link (06 section 7.2.8, D71)', () => {
    const gates = computeGates('in_review', { ...EMPTY_GATES, milestonesWithoutRequirement: 2 }, [
      artifact(),
    ]);
    expect(gates.publishBlockers).toContain('MILESTONE_WITHOUT_REQUIREMENT');
  });

  it('blocks an approved artifact that still carries a warning', () => {
    const gates = computeGates('in_review', EMPTY_GATES, [
      artifact({
        publicationStatus: 'APPROVED',
        validation: { ok: false, warnings: [{ code: 'WEIGHT_NOT_FOUND', message: 'x' }] },
      }),
    ]);
    expect(gates.publishBlockers).toContain('PENDING_VALIDATION_WARNINGS');
    expect(gates.canPublish).toBe(false);
  });

  it('ignores warnings on a rejected artifact, which is retained as evidence only', () => {
    const gates = computeGates('in_review', EMPTY_GATES, [
      artifact({
        publicationStatus: 'REJECTED',
        validation: { ok: false, warnings: [{ code: 'UNGROUNDED_ARTIFACT', message: 'x' }] },
      }),
    ]);
    expect(gates.publishBlockers).not.toContain('PENDING_VALIDATION_WARNINGS');
  });

  it('allows publish when the state and every gate agree', () => {
    const gates = computeGates('in_review', EMPTY_GATES, [artifact()]);
    expect(gates.canPublish).toBe(true);
    expect(gates.publishBlockers).toEqual([]);
  });

  it('refuses publish for an assignment that is not in_review (transition 7s own guard)', () => {
    expect(computeGates('draft', EMPTY_GATES, [artifact()]).canPublish).toBe(false);
    expect(computeGates('published', EMPTY_GATES, [artifact()]).canPublish).toBe(false);
    expect(computeGates('archived', EMPTY_GATES, [artifact()]).canPublish).toBe(false);
  });

  it('refuses publish when nothing has been approved', () => {
    const gates = computeGates('in_review', { ...EMPTY_GATES, approvedArtifactCount: 0 }, [
      artifact({ publicationStatus: 'NEEDS_REVIEW' }),
    ]);
    expect(gates.canPublish).toBe(false);
    // Nothing approved and no blocker: the refusal is about the count, which is why the publish route
    // reports `NOTHING_APPROVED` rather than a blocker code (see `features/review/publish.ts`).
    expect(gates.publishBlockers).toEqual([]);
  });
});

describe('the approve and ingest gates', () => {
  it('offers approve only while something is waiting in the queue', () => {
    expect(
      computeGates('in_review', EMPTY_GATES, [artifact({ publicationStatus: 'NEEDS_REVIEW' })])
        .canApprove,
    ).toBe(true);
    expect(
      computeGates('in_review', EMPTY_GATES, [artifact({ publicationStatus: 'APPROVED' })]).canApprove,
    ).toBe(false);
  });

  it('offers ingest only with sources, no active job, and a status that accepts one', () => {
    expect(computeGates('draft', EMPTY_GATES, []).canIngest).toBe(true);
    expect(computeGates('draft', { ...EMPTY_GATES, sourceCount: 0 }, []).canIngest).toBe(false);
    expect(computeGates('draft', { ...EMPTY_GATES, activeJobCount: 1 }, []).canIngest).toBe(false);
    expect(computeGates('published', EMPTY_GATES, []).canIngest).toBe(false);
  });
});

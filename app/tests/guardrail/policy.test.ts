/**
 * L2/L3 unit tests (`05-AI-GUARDRAILS.md` sections 3.3.1-3.3.4).
 *
 * The three invariants of section 3.3.2 are the point of this file, and they are tested through
 * `decide()` rather than only through the overlay function, because "a policy can only restrict"
 * is a claim about the whole request path:
 *
 * 1. `effectiveProhibited` is a superset of the platform floor for every policy;
 * 2. a capability absent from both is not allowed (absence is prohibition);
 * 3. a policy cannot remove a floor prohibition, however its `permitted` list is written.
 */

import { describe, expect, it } from 'vitest';

import { decide } from '@/lib/guardrail';
import {
  FLOOR_ALLOWED,
  FLOOR_PROHIBITED,
  overlayForView,
  policyFromRows,
  validatePolicyView,
  type PolicyRuleRow,
} from '@/lib/guardrail/policy-source';
import type { AiUsagePolicyView } from '@/lib/guardrail/types';
import { baseInput, demoPolicyRows, policyView } from './harness';

function viewWith(overrides: Partial<AiUsagePolicyView>): AiUsagePolicyView {
  return { ...policyView(), ...overrides };
}

describe('the database rows of the seeded demo assignment become an approved policy', () => {
  it('yields POL_APPROVED with the capabilities its ALLOW rules state', () => {
    const result = policyFromRows(demoPolicyRows(), { assignmentId: 'asg_demo_1042' });
    expect(result.status).toBe('POL_APPROVED');
    if (result.status !== 'POL_APPROVED') return;
    expect(result.policy.permitted.sort()).toEqual(
      ['explain_terminology', 'interpret_rubric', 'locate_source', 'quote_source_verbatim'].sort(),
    );
    // The floor guardrail is the minimum, so the union is at least the floor's nine.
    for (const capability of FLOOR_PROHIBITED) {
      expect(result.overlay.effectiveProhibited).toContain(capability);
    }
    expect(result.overlay.escalationSubjects).toContain('uncertain');
  });

  it('warns about upload-scoped rules instead of letting them widen the floor', () => {
    const result = policyFromRows(demoPolicyRows(), { assignmentId: 'asg_demo_1042' });
    if (result.status !== 'POL_APPROVED') throw new Error('expected an approved policy');
    expect(result.warnings.join(' ')).toContain('mechanical_editing_only');
    // `mechanical_editing_only` allows editing; the floor prohibits `edit_student_work`, and a
    // policy that would widen the floor must not be able to do so through the assistant's set.
    expect(result.overlay.effectiveAllowed).not.toContain('edit_student_work');
    expect(result.overlay.effectiveProhibited).toContain('edit_student_work');
  });

  it('returns POL_ABSENT when nothing is published (D47)', () => {
    const rows = demoPolicyRows().map((row) => ({ ...row, publicationStatus: 'APPROVED' }));
    const result = policyFromRows(rows, { assignmentId: 'asg_demo_1042' });
    expect(result.status).toBe('POL_ABSENT');
    if (result.status !== 'POL_ABSENT') return;
    expect(result.problems.join(' ')).toContain('PUBLISHED');
  });

  it('returns POL_INVALID for an assistant-applicable rule code with no mapping (fail closed)', () => {
    const rows: PolicyRuleRow[] = [
      {
        ruleId: 'apr_invented',
        ruleCode: 'be_nice_to_students',
        effect: 'ALLOW',
        appliesTo: 'assistant',
        publicationStatus: 'PUBLISHED',
        ruleText: 'A rule the guardrail has no capability for.',
      },
    ];
    const result = policyFromRows(rows, { assignmentId: 'asg_demo_1042' });
    expect(result.status).toBe('POL_INVALID');
    if (result.status !== 'POL_INVALID') return;
    expect(result.problems.join(' ')).toContain('be_nice_to_students');
  });

  it('returns POL_INVALID when a policy tries to permit a floor-prohibited capability', () => {
    const rows: PolicyRuleRow[] = [
      {
        ruleId: 'apr_widen',
        ruleCode: 'no_answer_sharing',
        effect: 'ALLOW',
        appliesTo: 'assistant',
        publicationStatus: 'PUBLISHED',
        ruleText: 'A rule that would re-enable a floor-prohibited capability.',
      },
    ];
    const result = policyFromRows(rows, { assignmentId: 'asg_demo_1042' });
    expect(result.status).toBe('POL_INVALID');
    if (result.status !== 'POL_INVALID') return;
    expect(result.problems.join(' ')).toContain('complete_deliverable');
  });

  it('returns POL_INVALID for an escalation rule that names no known subject', () => {
    const rows: PolicyRuleRow[] = [
      {
        ruleId: 'apr_esc',
        ruleCode: 'send_everything_to_the_tutor',
        effect: 'ESCALATE_TO_TUTOR',
        appliesTo: 'assistant',
        publicationStatus: 'PUBLISHED',
        ruleText: 'An escalation with a subject the guardrail cannot consult.',
      },
    ];
    expect(policyFromRows(rows, { assignmentId: 'asg_demo_1042' }).status).toBe('POL_INVALID');
  });

  it('keeps an upload-scoped unmapped code as a warning only', () => {
    const rows: PolicyRuleRow[] = [
      {
        ruleId: 'apr_upload',
        ruleCode: 'unknown_upload_rule',
        effect: 'PROHIBIT',
        appliesTo: 'uploads',
        publicationStatus: 'PUBLISHED',
        ruleText: 'An upload-scoped rule the assistant capability algebra ignores.',
      },
    ];
    const result = policyFromRows(rows, { assignmentId: 'asg_demo_1042' });
    expect(result.status).toBe('POL_APPROVED');
  });
});

describe('the AiUsagePolicyView schema of 05 section 3.3.1', () => {
  it('accepts the approved fixture', () => {
    expect(validatePolicyView(policyView()).ok).toBe(true);
  });

  it('rejects an unknown publication status, a widened capability and extra fields', () => {
    expect(validatePolicyView({ ...policyView(), publicationStatus: 'DRAFT' }).ok).toBe(false);
    expect(validatePolicyView({ ...policyView(), permitted: ['generate_code'] }).ok).toBe(false);
    expect(validatePolicyView({ ...policyView(), surprise: true }).ok).toBe(false);
    expect(validatePolicyView({ ...policyView(), ruleRefs: [] }).ok).toBe(false);
  });
});

describe('the algebra can only restrict (05 section 3.3.2 invariants)', () => {
  it('is a superset of the floor for every policy, including one with no prohibitions', () => {
    const overlay = overlayForView(viewWith({ prohibited: [] }));
    for (const capability of FLOOR_PROHIBITED) {
      expect(overlay.effectiveProhibited).toContain(capability);
    }
  });

  it('allows only the intersection, so a permitted capability outside the floor does nothing', () => {
    const overlay = overlayForView(viewWith({ permitted: [] }));
    expect(overlay.effectiveAllowed).toEqual([]);
    for (const capability of FLOOR_ALLOWED) {
      expect(overlay.effectiveAllowed).not.toContain(capability);
    }
  });

  it('refuses a permitted request the policy does not allow, through decide() -- G21 restricted', async () => {
    const result = await decide(
      baseInput({
        turnText: "What does 'idempotent' mean?",
        policy: { kind: 'view', view: viewWith({ permitted: ['locate_source'] }) },
      }),
    );
    expect(result.decision.verdict).toBe('REFUSE');
    expect(result.decision.rules).toContain('POL_RESTRICT');
    expect(result.decision.deterministic).toBe(true);
  });

  it('still allows the same request when the policy permits the capability', async () => {
    const result = await decide(baseInput({ turnText: "What does 'idempotent' mean?" }));
    expect(result.decision.verdict).toBe('ALLOW');
    expect(result.decision.rules).toContain('A5');
  });

  it('runs the seeded rows through decide() as a live policy (the demo assignment path)', async () => {
    const result = await decide(
      baseInput({
        turnText: 'Where in the brief does it mention the number of references?',
        policy: { kind: 'rows', rows: demoPolicyRows(), meta: { policyId: 'pol_asg_demo_v1', version: 1 } },
      }),
    );
    expect(result.decision.verdict).toBe('ALLOW');
    // The seeded policy carries upload-scoped ALLOW rules, which are warnings rather than errors:
    // a valid policy that mentions the upload guard must not look like a broken one.
    expect(result.errors).toEqual([]);
    expect(result.warnings.join(' ')).toContain('mechanical_editing_only');
  });

  it('refuses every request with POL_ABSENT when no rule is published (D47)', async () => {
    const rows = demoPolicyRows().map((row) => ({ ...row, publicationStatus: 'APPROVED' }));
    const result = await decide(
      baseInput({ turnText: 'Where is the brief?', policy: { kind: 'rows', rows } }),
    );
    expect(result.decision.verdict).toBe('REFUSE');
    expect(result.decision.rules).toContain('POL_ABSENT');
    expect(result.classifierCalls).toBe(0);
  });

  it('refuses with POL_INVALID and keeps the problems visible', async () => {
    const rows: PolicyRuleRow[] = [
      {
        ruleId: 'apr_invented',
        ruleCode: 'be_nice_to_students',
        effect: 'ALLOW',
        appliesTo: 'assistant',
        publicationStatus: 'PUBLISHED',
        ruleText: 'A rule the guardrail has no capability for.',
      },
    ];
    const result = await decide(baseInput({ turnText: 'Hello', policy: { kind: 'rows', rows } }));
    expect(result.decision.verdict).toBe('REFUSE');
    expect(result.decision.rules).toContain('POL_INVALID');
    expect(result.errors.join(' ')).toContain('be_nice_to_students');
  });

  it('refuses when the view is not a policy at all', async () => {
    const result = await decide(baseInput({ turnText: 'Hello', policy: { kind: 'view', view: 42 } }));
    expect(result.decision.rules).toContain('POL_INVALID');
  });
});

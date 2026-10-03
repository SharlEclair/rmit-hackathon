/**
 * L4 classifier tests (`05-AI-GUARDRAILS.md` section 7.1, section 12.2, `AGENTS.md` 6.4).
 *
 * Every branch of the failure table is asserted, because each one is a different way a malformed or
 * missing model response could be mistaken for permission. The "no retry" rule (`N3`, D16) is
 * asserted as a call count, not as prose.
 */

import { describe, expect, it } from 'vitest';

import { applyConfidenceDowngrade, classifyWithModel, GUARDRAIL_PROMPT_VERSION } from '@/lib/guardrail/classifier';
import { validateGuardrailDecision } from '@/lib/guardrail/types';
import { createClassifierSpy, modelOutputs } from './harness';

const fixtures = modelOutputs();

const input = {
  assignmentId: 'asg_demo_1042',
  assistantSessionId: 'ses_unit',
  turnText: 'Which design pattern should I use for the payment module?',
  residualText: 'which design pattern should i use for the payment module?',
  effectiveAllowed: ['locate_source'],
  effectiveProhibited: ['generate_code'],
  policyText: 'notes',
  promptVersion: GUARDRAIL_PROMPT_VERSION,
};

describe('failure branches are all refusals (05 section 12.2)', () => {
  it('refuses SYS_MODEL_UNAVAILABLE when no classifier is configured, with zero calls', async () => {
    const result = await classifyWithModel(input, { classifier: null });
    expect(result.decision.verdict).toBe('REFUSE');
    expect(result.decision.rules).toContain('SYS_MODEL_UNAVAILABLE');
    expect(result.classifierCalls).toBe(0);
  });

  it('refuses SYS_BUDGET_EXCEEDED before calling the classifier', async () => {
    const spy = createClassifierSpy(fixtures.outputs.G09);
    const result = await classifyWithModel(input, { classifier: spy.port, classifierCallsRemaining: 0 });
    expect(result.decision.rules).toContain('SYS_BUDGET_EXCEEDED');
    expect(spy.calls).toHaveLength(0);
    expect(result.classifierCalls).toBe(0);
  });

  it('refuses SYS_MODEL_UNAVAILABLE when the adapter throws', async () => {
    const spy = createClassifierSpy(undefined, { throwOnCall: true });
    const result = await classifyWithModel(input, { classifier: spy.port });
    expect(result.decision.rules).toContain('SYS_MODEL_UNAVAILABLE');
    expect(result.decision.deterministic).toBe(true);
    expect(result.problems.join(' ')).toContain('provider unreachable');
  });

  it.each(Object.entries(fixtures.invalidOutputs))(
    'refuses SYS_SCHEMA_INVALID for the invalid output "%s", with exactly one call (no retry)',
    async (_name: string, output: unknown) => {
      const spy = createClassifierSpy(output);
      const result = await classifyWithModel(input, { classifier: spy.port });
      expect(result.decision.verdict).toBe('REFUSE');
      expect(result.decision.rules).toContain('SYS_SCHEMA_INVALID');
      expect(result.decision.reasonCode).toBe('SCHEMA_VALIDATION_FAILED');
      expect(spy.calls).toHaveLength(1);
      expect(result.classifierCalls).toBe(1);
    },
  );
});

describe('a valid model decision is adopted, with code-owned provenance', () => {
  it('adopts the pinned P8 refusal and overrides promptVersion and modelId', async () => {
    const spy = createClassifierSpy(fixtures.outputs.G09);
    const result = await classifyWithModel(input, { classifier: spy.port });
    expect(result.decision.verdict).toBe('REFUSE');
    expect(result.decision.rules).toEqual(['P8']);
    expect(result.decision.deterministic).toBe(false);
    expect(result.decision.modelId).toBe('mock-guardrail-v1');
    expect(result.decision.promptVersion).toBe(GUARDRAIL_PROMPT_VERSION);
    expect(spy.calls).toHaveLength(1);
  });

  it('adopts the scoped allow of G22 unchanged', async () => {
    const spy = createClassifierSpy(fixtures.outputs.G22);
    const result = await classifyWithModel(input, { classifier: spy.port });
    expect(result.decision.verdict).toBe('ALLOW_WITH_SCOPE');
    expect(result.decision.scope).toBe('SCOPE_TERM');
    expect(result.decision.rules).toContain('POL_SCOPE');
  });
});

describe('the confidence downgrade of 05 section 7.2', () => {
  it('turns a medium-confidence ALLOW into CLARIFY with AMB4 and a question', async () => {
    const spy = createClassifierSpy(fixtures.downgradeOutput);
    const result = await classifyWithModel(input, { classifier: spy.port });
    expect(result.decision.verdict).toBe('CLARIFY');
    expect(result.decision.rules).toContain('AMB4');
    expect(result.decision.clarifyingQuestion).toBeTruthy();
    expect(result.decision.refusalTemplateId).toBe('T-CLARIFY');
    expect(result.problems.join(' ')).toContain('downgraded');
  });

  it('leaves a high-confidence ALLOW alone', () => {
    expect(
      applyConfidenceDowngrade({
        verdict: 'ALLOW',
        rules: ['A5'],
        reasonCode: 'POLICY_APPROVED',
        deterministic: false,
        confidence: 'high',
        scope: null,
        refusalTemplateId: null,
        promptVersion: 'guardrail-v1',
        modelId: 'mock-guardrail-v1',
      }),
    ).toBeNull();
  });

  it('never downgrades a REFUSE', () => {
    expect(
      applyConfidenceDowngrade({
        verdict: 'REFUSE',
        rules: ['P8'],
        reasonCode: 'DESIGN_DECISION_REQUESTED',
        deterministic: false,
        confidence: 'low',
        scope: null,
        refusalTemplateId: 'T-REFUSE',
        promptVersion: 'guardrail-v1',
        modelId: 'mock-guardrail-v1',
      }),
    ).toBeNull();
  });
});

describe('the schema validator of 05 section 7.2', () => {
  it('rejects an unknown rule id even though its prefix is valid', () => {
    const result = validateGuardrailDecision({
      verdict: 'REFUSE',
      rules: ['P99'],
      reasonCode: 'SOMETHING',
      deterministic: false,
      scope: null,
      refusalTemplateId: 'T-REFUSE',
      promptVersion: 'guardrail-v1',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems.join(' ')).toContain('P99');
  });

  it('rejects a deterministic decision that carries a model id', () => {
    const result = validateGuardrailDecision({
      verdict: 'ALLOW',
      rules: ['A4'],
      reasonCode: 'POLICY_APPROVED',
      deterministic: true,
      scope: null,
      refusalTemplateId: null,
      promptVersion: 'guardrail-v1',
      modelId: 'mock-guardrail-v1',
    });
    expect(result.ok).toBe(false);
  });

  it('rejects an extra property, because the schema is strict', () => {
    const result = validateGuardrailDecision({
      verdict: 'ALLOW',
      rules: ['A4'],
      reasonCode: 'POLICY_APPROVED',
      deterministic: true,
      scope: null,
      refusalTemplateId: null,
      promptVersion: 'guardrail-v1',
      surprise: true,
    });
    expect(result.ok).toBe(false);
  });

  it('accepts the pinned fixture decisions', () => {
    for (const output of Object.values(fixtures.outputs)) {
      expect(validateGuardrailDecision(output).ok).toBe(true);
    }
  });
});

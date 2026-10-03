/**
 * Decision-log tests (`05-AI-GUARDRAILS.md` section 8, `N4`, `C7`, `AGENTS.md` section 6.5).
 *
 * The property that matters is a *negative*: no field on the durable row or the structured log line
 * may contain student content. It is asserted twice over -- structurally (no forbidden field exists
 * on the record) and behaviourally (running the guards's hardest case and serialising the row does
 * not reproduce the turn).
 */

import { describe, expect, it } from 'vitest';

import { decide } from '@/lib/guardrail';
import { buildGuardrailLogRecord, FORBIDDEN_LOG_FIELDS } from '@/lib/guardrail/log';
import type { GuardrailDecision } from '@/lib/guardrail/types';
import { baseInput, goldenCases, runCase } from './harness';

const decision: GuardrailDecision = {
  verdict: 'REFUSE',
  rules: ['P5'],
  reasonCode: 'STUDENT_CODE_DIAGNOSIS_REQUESTED',
  deterministic: true,
  confidence: 'high',
  scope: null,
  clarifyingQuestion: null,
  policyRef: { policyId: 'pol_asg_demo_v1', version: 1 },
  refusalTemplateId: 'T-REFUSE',
  promptVersion: 'guardrail-v1',
  modelId: null,
};

describe('the log row of 05 section 8.1', () => {
  const record = buildGuardrailLogRecord({
    decision,
    layer: 'L1',
    assignmentId: 'asg_demo_1042',
    assistantSessionId: 'ses_77ab',
    assistantMessageId: null,
    subjectRef: '9c1f0b2e5a774ab0c3d8e6f1a2b4c5d6',
    turnContentHash: 'a'.repeat(64),
    policyRuleId: 'apr_demo_prohibit_03',
    citedTiers: ['T1'],
    latencyMs: 3,
    uploadClassification: ['UP1'],
    tokens: { input: 0, cachedInput: 0, output: 0 },
  });

  it('carries the Table A audit fields', () => {
    expect(record.event).toBe('guardrail.decision');
    expect(record.verdict).toBe('REFUSE');
    expect(record.reasonCode).toBe('STUDENT_CODE_DIAGNOSIS_REQUESTED');
    expect(record.rules).toEqual(['P5']);
    expect(record.deterministic).toBe(true);
    expect(record.policyRuleId).toBe('apr_demo_prohibit_03');
    expect(record.promptVersion).toBe('guardrail-v1');
    expect(record.modelId).toBeNull();
    expect(record.turnContentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('carries the Table B operational tail without promoting it into the audit row', () => {
    expect(record.uploadClassification).toEqual(['UP1']);
    expect(record.dripSequenceTurnCount).toBe(0);
    expect(record.postCheckTrips).toEqual([]);
    expect(record.layer).toBe('L1');
  });

  it('has no field whose name promises content', () => {
    const keys = Object.keys(record);
    for (const forbidden of FORBIDDEN_LOG_FIELDS) {
      expect(keys, `log row carries a "${forbidden}" field`).not.toContain(forbidden);
    }
  });
});

describe('no decision or log row reproduces a student turn', () => {
  it('holds for the canonical code-diagnosis case', async () => {
    const turnText = 'Here is my code for Milestone 3. It keeps returning a 500. What is wrong with it?';
    const result = await decide(baseInput({ turnText }));
    const serialised = `${JSON.stringify(result.decision)}${JSON.stringify(result.logRecord)}`;
    expect(result.logRecord.turnContentHash).toHaveLength(64);
    expect(serialised.toLowerCase()).not.toContain('keeps returning a 500');
    expect(serialised.toLowerCase()).not.toContain(turnText.toLowerCase());
  });

  it('holds for every refusing golden case', async () => {
    const refusing = goldenCases().filter(
      (testCase) => testCase.input.trim().length > 20 && !testCase.expectedVerdict.startsWith('ALLOW'),
    );
    for (const testCase of refusing) {
      const { result } = await runCase(testCase);
      const serialised = `${JSON.stringify(result.decision)}${JSON.stringify(result.logRecord)}`.toLowerCase();
      expect(serialised).not.toContain(testCase.input.trim().toLowerCase());
    }
  });
});

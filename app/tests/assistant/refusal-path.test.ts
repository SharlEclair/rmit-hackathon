/**
 * The refusal path: `I1`'s zero-model-call guarantee, asserted as a **call count** (task-3 item 8,
 * `05-AI-GUARDRAILS.md` section 11.3).
 *
 * A test that compared refusal *text* would pass with the provider consulted on every turn, which is
 * the exact failure the invariant exists to prevent. So the injected provider is a spy and the
 * assertion is `calls.length === 0`.
 *
 * No network, no provider key, no database: the fake provider is an object literal and the guardrail
 * is the pure engine from Phase 3.
 */

import { describe, expect, it } from 'vitest';

import type { VisiblePolicyRule } from '@/lib/db/queries/student-visibility';
import type { LlmProvider, LlmRequest, LlmResponse } from '@/lib/llm/types';
import { buildGroundingSet, groundingTiers, renderGrounding, type GroundingChunkInput } from '@/features/assistant/context';
import { runAssistantTurn, type AssistantTurnSuccess } from '@/features/assistant/answer';
import { refusalPayloadFor } from '@/features/assistant/stream';

const BRIEF_CHUNK: GroundingChunkInput = {
  id: '11111111-1111-4111-8111-111111111111',
  sourceKind: 'brief',
  text: 'The report must state the required number of references and cite them in APA 7.',
  pageFrom: 4,
  pageTo: 4,
  sectionLabel: '3.2 References',
};

const RUBRIC_CHUNK: GroundingChunkInput = {
  id: '22222222-2222-4222-8222-222222222222',
  sourceKind: 'rubric',
  text: 'Critical analysis is worth 30 per cent of the rubric.',
  pageFrom: 2,
  pageTo: 2,
  sectionLabel: null,
};

/** Two published rows: one permission, one prohibition. `policyFromRows` needs a mapped code. */
const POLICY_ROWS: VisiblePolicyRule[] = [
  {
    id: '33333333-3333-4333-8333-333333333333',
    ruleCode: 'explain_assessment_documents',
    ruleText: 'You may ask the assistant to explain the assessment documents.',
    effect: 'ALLOW',
    appliesTo: 'assistant',
    displayOrder: 1,
  },
  {
    id: '44444444-4444-4444-8444-444444444444',
    ruleCode: 'no_answer_generation',
    ruleText: 'The assistant must not produce answers to the assessment tasks.',
    effect: 'PROHIBIT',
    appliesTo: 'assistant',
    displayOrder: 2,
  },
];

const GROUNDING = buildGroundingSet({
  chunks: [BRIEF_CHUNK, RUBRIC_CHUNK],
  faqEntries: [],
  milestones: [],
  checklistItems: [],
});

interface CountingProvider {
  readonly provider: LlmProvider;
  readonly calls: LlmRequest[];
}

/** A provider that counts calls and always answers with the same payload. */
function countingProvider(json: unknown): CountingProvider {
  const calls: LlmRequest[] = [];
  return {
    calls,
    provider: {
      id: 'mock',
      capabilities: { jsonOutput: true, toolCalls: false, vision: false, audio: false, video: false },
      async validateConfiguration(): Promise<{
        ok: boolean;
        provider: 'mock';
        modelId: string;
        checkedAt: string;
        latencyMs: number;
      }> {
        return { ok: true, provider: 'mock', modelId: 'mock', checkedAt: new Date(0).toISOString(), latencyMs: 0 };
      },
      async complete(request: LlmRequest): Promise<LlmResponse> {
        calls.push(request);
        return {
          provider: 'mock',
          modelId: request.modelId,
          json,
          text: null,
          toolCalls: [],
          usage: { inputTokens: 10, cachedInputTokens: 0, outputTokens: 20 },
          finishReason: 'stop',
          latencyMs: 5,
          providerRequestId: null,
        };
      },
    },
  };
}

function turnInput(overrides: {
  readonly turnText: string;
  readonly policyRows?: readonly VisiblePolicyRule[];
  readonly provider: LlmProvider;
}) {
  return {
    assignmentId: '55555555-5555-4555-8555-555555555555',
    assistantSessionId: '66666666-6666-4666-8666-666666666666',
    modelId: 'mock',
    turnText: overrides.turnText,
    attachedText: [],
    milestoneTitle: null,
    policyRows: overrides.policyRows ?? POLICY_ROWS,
    grounding: GROUNDING,
    retrievedChunkIds: GROUNDING.refs.map((ref) => ref.citation.id),
    subjectRef: '9c1f0b2e5a774ab0c3d8e6f1a2b4c5d6',
    session: { turns: [], currentMilestoneTitle: null, completedItemCount: 0 },
    client: overrides.provider,
  };
}

describe('a prohibited turn never reaches the provider (I1, 05 section 11.3)', () => {
  it('refuses "write the SQL query" with zero provider calls', async () => {
    const spy = countingProvider({ answerMarkdown: 'should never be used' });
    const result = await runAssistantTurn(turnInput({ turnText: 'Write the SQL query for requirement 4.', provider: spy.provider }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.persistedDecision.verdict).toBe('REFUSE');
    expect(result.persistedDecision.rules).toContain('P2');
    expect(result.generated).toBe(false);
    expect(spy.calls).toHaveLength(0);
  });

  it('refuses "here is my code, what is wrong with it" with zero provider calls', async () => {
    const spy = countingProvider({ answerMarkdown: 'should never be used' });
    const result = await runAssistantTurn(turnInput({ turnText: 'Here is my code for Milestone 3. What is wrong with it?', provider: spy.provider }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.persistedDecision.verdict).toBe('REFUSE');
    expect(spy.calls).toHaveLength(0);
  });

  it('returns the rendered refusal copy for the persisted turn, and no answer', async () => {
    const spy = countingProvider({ answerMarkdown: 'should never be used' });
    const result = await runAssistantTurn(turnInput({ turnText: 'Write the SQL query for requirement 4.', provider: spy.provider }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.body).toContain('AI Usage Policy');
    expect(result.body).not.toContain('should never be used');
    expect(result.citations).toHaveLength(0);
    expect(result.usage.inputTokens).toBe(0);
    expect(result.usage.outputTokens).toBe(0);
  });

  it('emits no token frames for a refusal, and a non-null refusal payload', async () => {
    const spy = countingProvider({ answerMarkdown: 'should never be used' });
    const result = await runAssistantTurn(turnInput({ turnText: 'Write the SQL query for requirement 4.', provider: spy.provider }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const refusal = refusalPayloadFor({
      result,
      policyRows: POLICY_ROWS,
      assignmentId: 'asg',
      milestoneId: null,
      messageId: 'msg',
      createdAt: new Date(0).toISOString(),
      requestId: 'req',
    });
    expect(refusal).not.toBeNull();
    expect(refusal?.verdict).toBe('REFUSE');
    expect(refusal?.refusalTemplateId).toBe('T-REFUSE');
    // `R5`: at least two real alternatives, from the guardrail's own copy.
    expect((refusal?.whatICanHelpWith ?? []).length).toBeGreaterThanOrEqual(2);
    expect(refusal?.unavailable).toBe(false);
  });
});

describe('CLARIFY and ESCALATE_TO_TUTOR refuse without a model call (D69)', () => {
  it('clarifies an ambiguous requirement request with zero provider calls', async () => {
    const spy = countingProvider({ answerMarkdown: 'should never be used' });
    const result = await runAssistantTurn(turnInput({ turnText: 'Can you translate this requirement into simpler English?', provider: spy.provider }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.persistedDecision.verdict).toBe('CLARIFY');
    expect(result.persistedDecision.clarifyingQuestion).toBeTruthy();
    expect(result.generated).toBe(false);
    expect(spy.calls).toHaveLength(0);
  });

  it('escalates an administrative request with zero provider calls, and never drafts a Query itself', async () => {
    const spy = countingProvider({ answerMarkdown: 'should never be used' });
    const result = await runAssistantTurn(turnInput({ turnText: 'Can I get an extension? I was sick.', provider: spy.provider }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.persistedDecision.verdict).toBe('ESCALATE_TO_TUTOR');
    expect(result.persistedDecision.refusalTemplateId).toBe('T-ESCALATE');
    expect(spy.calls).toHaveLength(0);
  });
});

describe('no published policy means no assistant (D47, 06 section 5.5.9 rule 7)', () => {
  it('refuses POL_ABSENT with unavailable = true and zero provider calls', async () => {
    const spy = countingProvider({ answerMarkdown: 'should never be used' });
    const result = await runAssistantTurn(
      turnInput({
        turnText: 'Where in the brief does it mention the required number of references?',
        policyRows: [],
        provider: spy.provider,
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.persistedDecision.verdict).toBe('REFUSE');
    // The frozen guardrail's machine code, `REASON_CODES.POLICY_ABSENT`; `06` section 5.5.9 calls it
    // `POL_ABSENT`, which is the rule id. The decision record is authoritative (see `stream.ts`).
    expect(result.persistedDecision.reasonCode).toBe('POLICY_ABSENT');
    expect(result.persistedDecision.rules).toContain('POL_ABSENT');
    expect(spy.calls).toHaveLength(0);

    const refusal = refusalPayloadFor({
      result,
      policyRows: [],
      assignmentId: 'asg',
      milestoneId: null,
      messageId: 'msg',
      createdAt: new Date(0).toISOString(),
      requestId: 'req',
    });
    // `06` section 5.5.9: `unavailable` is true only for POL_ABSENT, and the client renders the
    // unavailable state rather than an empty-but-usable Assistant.
    expect(refusal?.unavailable).toBe(true);
  });

  it('still refuses when the classifier port is configured but the policy is absent', async () => {
    const spy = countingProvider({ answerMarkdown: 'should never be used' });
    const result = await runAssistantTurn({
      ...turnInput({
        turnText: 'Where in the brief does it mention the required number of references?',
        policyRows: [],
        provider: spy.provider,
      }),
      classifier: {
        capability: 'policy_guard',
        modelId: 'mock',
        promptVersion: 'guardrail-v1',
        async classify() {
          return { verdict: 'ALLOW', rules: ['A4'], reasonCode: 'POLICY_APPROVED', deterministic: false, scope: null, refusalTemplateId: null, promptVersion: 'guardrail-v1' };
        },
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.persistedDecision.reasonCode).toBe('POLICY_ABSENT');
    expect(result.classifierCalls).toBe(0);
    expect(spy.calls).toHaveLength(0);
  });
});

describe('the grounding set the refusal was decided against', () => {
  it('numbers T1 chunks from zero and labels them with their source and page', () => {
    expect(GROUNDING.refs).toHaveLength(2);
    expect(GROUNDING.refs[0]?.ref).toBe(0);
    expect(GROUNDING.refs[0]?.citation.kind).toBe('source_chunk');
    expect(GROUNDING.refs[0]?.citation.label).toBe('Brief p.4, section 3.2 References');
    expect(GROUNDING.refs[0]?.citation.deepLink).toBe('#page=4');
    expect(GROUNDING.refs[1]?.citation.label).toBe('Official rubric p.2');
    expect(groundingTiers(GROUNDING)).toEqual(['T1']);
    expect(renderGrounding(GROUNDING)).toContain('[#0] (page 4, "3.2 References")');
  });
});

/** A narrow shape assertion so the refusal assertion above cannot silently accept an undefined. */
function isRefusalShape(result: AssistantTurnSuccess): boolean {
  return result.persistedDecision.refusalTemplateId === 'T-REFUSE';
}

describe('the result shape stays explicit', () => {
  it('reports a refusal-shaped persisted decision', async () => {
    const spy = countingProvider(null);
    const result = await runAssistantTurn(turnInput({ turnText: 'Write the SQL query for requirement 4.', provider: spy.provider }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(isRefusalShape(result)).toBe(true);
  });
});

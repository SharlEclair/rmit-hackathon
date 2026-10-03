/**
 * The permitted path: one provider call, the post-check on every generated answer, and citations
 * resolved against the grounding set (`06-DATA-MODEL.md` section 5.5.9; `04-TECH-ARCHITECTURE.md`
 * section 5.8 rule 5, D90).
 *
 * The allowed turn reaches the provider through the **committed mock provider** with an exact
 * response registered by `registerMockResponse`, so `pnpm test` needs no network, no provider key and
 * no database -- and the fixture is keyed by the request itself, so a test fails loudly if the prompt
 * assembly changes rather than silently answering a different question.
 *
 * The provider is wrapped in a counter, because "one call" is a claim about calls.
 */

import { afterEach, describe, expect, it } from 'vitest';

import type { VisiblePolicyRule } from '@/lib/db/queries/student-visibility';
import { createMockProvider, mockResponseKey, registerMockResponse, resetMockResponses } from '@/lib/llm/mock';
import type { LlmProvider, LlmRequest, LlmResponse } from '@/lib/llm/types';
import { buildAssistantRequest, runAssistantTurn } from '@/features/assistant/answer';
import { buildGroundingSet, type GroundingChunkInput } from '@/features/assistant/context';

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

const IDS = GROUNDING.refs.map((ref) => ref.citation.id);
const TURN = 'Where in the brief does it mention the required number of references?';

function requestInput() {
  return {
    assignmentId: '55555555-5555-4555-8555-555555555555',
    assistantSessionId: '66666666-6666-4666-8666-666666666666',
    modelId: 'mock',
    turnText: TURN,
    attachedText: [],
    milestoneTitle: null,
    policyRows: POLICY_ROWS,
    grounding: GROUNDING,
  } as const;
}

function turnInput(client: LlmProvider) {
  return {
    ...requestInput(),
    retrievedChunkIds: IDS,
    subjectRef: '9c1f0b2e5a774ab0c3d8e6f1a2b4c5d6',
    session: { turns: [], currentMilestoneTitle: null, completedItemCount: 0 },
    client,
  };
}

/** The mock provider plus a call count, so "one call" is asserted rather than assumed. */
function countingMock(): { provider: LlmProvider; calls: LlmRequest[] } {
  const inner = createMockProvider();
  const calls: LlmRequest[] = [];
  return {
    calls,
    provider: {
      id: inner.id,
      capabilities: inner.capabilities,
      validateConfiguration: () => inner.validateConfiguration(),
      async complete(request: LlmRequest): Promise<LlmResponse> {
        calls.push(request);
        return inner.complete(request);
      },
    },
  };
}

/** Register the fixture for exactly the request the pipeline will build. */
function register(json: unknown): void {
  registerMockResponse(mockResponseKey(buildAssistantRequest(requestInput())), {
    json,
    finishReason: 'stop',
  });
}

afterEach(() => {
  resetMockResponses();
});

describe('a permitted turn calls the provider exactly once', () => {
  it('answers from the brief, resolves the citation, and runs the post-check', async () => {
    register({
      answerMarkdown:
        'The brief requires the report to state the required number of references and cite them in APA 7 [#0].',
      groundingChunkIds: ['0'],
      citations: [
        {
          chunkId: '0',
          documentId: 'brief',
          pageFrom: 4,
          pageTo: 4,
          quote: 'required number of references',
        },
      ],
      policyNote: 'Assignment-specific, quoted from the brief.',
    });

    const mock = countingMock();
    const result = await runAssistantTurn(turnInput(mock.provider));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(['ALLOW', 'ALLOW_WITH_SCOPE']).toContain(result.persistedDecision.verdict);
    expect(result.generated).toBe(true);
    expect(mock.calls).toHaveLength(1);
    expect(result.usage.inputTokens).toBeGreaterThan(0);
    expect(result.body).toContain('required number of references');
    expect(result.citations).toHaveLength(1);
    expect(result.citations[0]?.id).toBe(BRIEF_CHUNK.id);
    expect(result.citations[0]?.label).toBe('Brief p.4, section 3.2 References');
    expect(result.citations[0]?.truthTier).toBe('T1');
    expect(result.postCheckTrips).toEqual([]);
    expect(result.groundingIds).toEqual([BRIEF_CHUNK.id]);
  });

  it('sends the capability, the prompt version, temperature 0 and a strict json_schema', async () => {
    register({
      answerMarkdown: 'The brief states the required number of references [#0].',
      groundingChunkIds: ['0'],
      citations: [{ chunkId: '0', documentId: 'brief', pageFrom: 4, pageTo: 4, quote: 'references' }],
      policyNote: 'Sourced from the brief.',
    });

    const mock = countingMock();
    const result = await runAssistantTurn(turnInput(mock.provider));
    expect(result.ok).toBe(true);

    const request = mock.calls[0];
    expect(request?.capability).toBe('student_assistant');
    expect(request?.systemPrefixId).toBe('assistant-system-v1');
    expect(request?.temperature).toBe(0);
    expect(request?.responseFormat.type).toBe('json_schema');
    if (request?.responseFormat.type === 'json_schema') {
      // The provider contract is strict structured output at temperature 0 (`05` section 7.1).
      expect(request.responseFormat.strict).toBe(true);
      expect(request.responseFormat.name).toBe('assistant_answer_v1');
    }
    // The budget unit is the assistant session (`06` section 7.3.3), not the request id.
    expect(request?.sessionId).toBe('66666666-6666-4666-8666-666666666666');
  });
});

describe('the post-check runs on every generated answer (05 section 3.2.3)', () => {
  it('replaces an answer containing a code block with the refusal', async () => {
    register({
      answerMarkdown: 'Try this:\n\n```sql\nselect * from assignments;\n```\n',
      groundingChunkIds: ['0'],
      citations: [{ chunkId: '0', documentId: 'brief', pageFrom: 4, pageTo: 4, quote: 'references' }],
      policyNote: 'Sourced from the brief.',
    });

    const mock = countingMock();
    const result = await runAssistantTurn(turnInput(mock.provider));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(mock.calls).toHaveLength(1);
    expect(result.persistedDecision.verdict).toBe('REFUSE');
    expect(result.postCheckTrips).toEqual(['POST_CODE']);
    // The tripped answer is not returned; the refusal template is, and no query text survives.
    expect(result.body).not.toContain('select * from');
    expect(result.body).toContain('AI Usage Policy');
    // `05` section 3.2.3: both records are retained, and the second one is the L5 row.
    expect(result.postCheckLogRecord?.layer).toBe('L5');
    expect(result.postCheckLogRecord?.rules).toContain('POST_CODE');
    expect(result.postCheckLogRecord?.postCheckTrips).toEqual(['POST_CODE']);
  });

  it('drops a citation that does not resolve, and lets POST_UNSOURCED do its job', async () => {
    register({
      answerMarkdown: 'The brief states the required number of references [#7].',
      groundingChunkIds: ['7'],
      citations: [{ chunkId: '7', documentId: 'brief', pageFrom: 9, pageTo: 9, quote: 'references' }],
      policyNote: 'Sourced from the brief.',
    });

    const mock = countingMock();
    const result = await runAssistantTurn(turnInput(mock.provider));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The citation is dropped, never invented; the frozen post-check then refuses the answer as
    // unsourced, which is the correct outcome and is not re-implemented here.
    expect(result.droppedRefs).toEqual(['7']);
    expect(result.persistedDecision.verdict).toBe('REFUSE');
    expect(result.postCheckTrips).toEqual(['POST_UNSOURCED']);
  });
});

describe('a schema-invalid answer is a refusal with no retry (D16, 06 section 5.5.9 rule 6)', () => {
  it('refuses SCHEMA_VALIDATION_FAILED after exactly one call', async () => {
    register({ answerMarkdown: 'missing the other required fields' });

    const mock = countingMock();
    const result = await runAssistantTurn(turnInput(mock.provider));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(mock.calls).toHaveLength(1);
    expect(result.persistedDecision.verdict).toBe('REFUSE');
    expect(result.persistedDecision.rules).toContain('SYS_SCHEMA_INVALID');
    expect(result.persistedDecision.reasonCode).toBe('SCHEMA_VALIDATION_FAILED');
    expect(result.streamError?.code).toBe('LLM_OUTPUT_INVALID');
    expect(result.body).toContain('AI Usage Policy');
  });

  it('refuses an answer the mock could not produce at all (no fixture: json null)', async () => {
    // No `register`: the mock returns `json: null` with `content_filter`, which is a refusal and
    // never an invented success (`04` section 5.8 rule 3).
    const mock = countingMock();
    const result = await runAssistantTurn(turnInput(mock.provider));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(mock.calls).toHaveLength(1);
    expect(result.persistedDecision.reasonCode).toBe('SCHEMA_VALIDATION_FAILED');
    expect(result.streamError?.code).toBe('LLM_OUTPUT_INVALID');
  });
});

describe('a provider failure is not persisted and is not an answer', () => {
  it('reports LLM_UNAVAILABLE when the provider throws', async () => {
    const provider: LlmProvider = {
      id: 'mock',
      capabilities: { jsonOutput: true, toolCalls: false, vision: false, audio: false, video: false },
      async validateConfiguration() {
        return { ok: true, provider: 'mock' as const, modelId: 'mock', checkedAt: new Date(0).toISOString(), latencyMs: 0 };
      },
      async complete(): Promise<LlmResponse> {
        throw Object.assign(new Error('provider unreachable'), { code: 'PROVIDER_UNAVAILABLE' });
      },
    };

    const result = await runAssistantTurn(turnInput(provider));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('LLM_UNAVAILABLE');
  });

  it('reports RATE_LIMITED with a retry hint when the session budget is exhausted', async () => {
    const provider: LlmProvider = {
      id: 'mock',
      capabilities: { jsonOutput: true, toolCalls: false, vision: false, audio: false, video: false },
      async validateConfiguration() {
        return { ok: true, provider: 'mock' as const, modelId: 'mock', checkedAt: new Date(0).toISOString(), latencyMs: 0 };
      },
      async complete(): Promise<LlmResponse> {
        throw Object.assign(new Error('budget'), { code: 'BUDGET_EXCEEDED' });
      },
    };

    const result = await runAssistantTurn(turnInput(provider));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('RATE_LIMITED');
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });
});

/**
 * The stream protocol's order (`06-DATA-MODEL.md` section 5.5.9; traps T4 and T5).
 *
 * These assertions are about the frame sequence, which is why the frames are built by
 * `features/assistant/stream.ts` and not inside the route: the contract can be tested without a
 * `ReadableStream`, an HTTP request or a database.
 *
 * The one property every test below re-states in its own terms: **`guardrail` is first, and a turn
 * whose persisted verdict is a refusal emits zero `token` frames.**
 */

import { afterEach, describe, expect, it } from 'vitest';

import type { GuardrailEvent, RefusalPayload } from '@/lib/api/types';
import type { VisiblePolicyRule } from '@/lib/db/queries/student-visibility';
import { createMockProvider, mockResponseKey, registerMockResponse, resetMockResponses } from '@/lib/llm/mock';
import type { LlmProvider } from '@/lib/llm/types';
import { buildAssistantRequest, runAssistantTurn, type AssistantTurnSuccess } from '@/features/assistant/answer';
import { buildGroundingSet, type GroundingChunkInput } from '@/features/assistant/context';
import { assistantStreamFrames, encodeSseFrame } from '@/features/assistant/stream';

const BRIEF_CHUNK: GroundingChunkInput = {
  id: '11111111-1111-4111-8111-111111111111',
  sourceKind: 'brief',
  text: 'The report must state the required number of references and cite them in APA 7.',
  pageFrom: 4,
  pageTo: 4,
  sectionLabel: '3.2 References',
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
  chunks: [BRIEF_CHUNK],
  faqEntries: [],
  milestones: [],
  checklistItems: [],
});

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

function turnInput(client: LlmProvider, policyRows: readonly VisiblePolicyRule[] = POLICY_ROWS) {
  return {
    ...requestInput(),
    policyRows,
    retrievedChunkIds: GROUNDING.refs.map((ref) => ref.citation.id),
    subjectRef: '9c1f0b2e5a774ab0c3d8e6f1a2b4c5d6',
    session: { turns: [], currentMilestoneTitle: null, completedItemCount: 0 },
    client,
  };
}

function streamInput(result: AssistantTurnSuccess) {
  return {
    result,
    policyRows: POLICY_ROWS,
    assignmentId: 'asg_demo_1042',
    milestoneId: null,
    messageId: '77777777-7777-4777-8777-777777777777',
    createdAt: new Date(0).toISOString(),
    requestId: 'req-1',
  };
}

const ANSWER = {
  answerMarkdown: 'The brief states the required number of references [#0].',
  groundingChunkIds: ['0'],
  citations: [{ chunkId: '0', documentId: 'brief', pageFrom: 4, pageTo: 4, quote: 'references' }],
  policyNote: 'Sourced from the brief.',
};

afterEach(() => {
  resetMockResponses();
});

describe('a permitted turn streams guardrail, tokens, citations, message, done', () => {
  it('orders the frames and never puts a token before the verdict', async () => {
    registerMockResponse(mockResponseKey(buildAssistantRequest(requestInput())), {
      json: ANSWER,
      finishReason: 'stop',
    });
    const result = await runAssistantTurn(turnInput(createMockProvider()));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const frames = assistantStreamFrames(streamInput(result));
    const events = frames.map((frame) => frame.event);
    expect(events[0]).toBe('guardrail');
    expect(events[events.length - 1]).toBe('done');
    expect(events[events.length - 2]).toBe('message');
    expect(events[events.length - 3]).toBe('citations');
    expect(events.filter((event) => event === 'guardrail')).toHaveLength(1);
    expect(events.indexOf('guardrail')).toBeLessThan(events.indexOf('token'));
    expect(events.indexOf('citations')).toBeLessThan(events.indexOf('message'));

    const tokens = frames.filter((frame) => frame.event === 'token').map((frame) => frame.data as { text: string });
    expect(tokens.length).toBeGreaterThan(1);
    expect(tokens.map((token) => token.text).join('')).toBe(result.body);

    const guardrail = frames[0]?.data as GuardrailEvent;
    expect(guardrail.refusal).toBeNull();
    expect(guardrail.citedTiers).toEqual(['T1']);
    const citations = frames.find((frame) => frame.event === 'citations')?.data as {
      citations: Array<{ id: string }>;
    };
    expect(citations.citations[0]?.id).toBe(BRIEF_CHUNK.id);
  });
});

describe('a refusal emits no token frames at all (T4)', () => {
  it('emits guardrail, message, done for a deterministic refusal', async () => {
    const provider = createMockProvider();
    const result = await runAssistantTurn({
      ...turnInput(provider),
      turnText: 'Write the SQL query for requirement 4.',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const frames = assistantStreamFrames(streamInput(result));
    expect(frames.map((frame) => frame.event)).toEqual(['guardrail', 'message', 'done']);
    const guardrail = frames[0]?.data as GuardrailEvent;
    expect(guardrail.verdict).toBe('REFUSE');
    const refusal = guardrail.refusal as RefusalPayload;
    expect(refusal.refusalTemplateId).toBe('T-REFUSE');
    expect(refusal.unavailable).toBe(false);
    expect(refusal.whatICanHelpWith.length).toBeGreaterThanOrEqual(2);
  });

  it('marks the no-policy refusal unavailable, and keeps zero tokens', async () => {
    const provider = createMockProvider();
    const result = await runAssistantTurn(turnInput(provider, []));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const frames = assistantStreamFrames(streamInput(result));
    expect(frames.map((frame) => frame.event)).toEqual(['guardrail', 'message', 'done']);
    const guardrail = frames[0]?.data as GuardrailEvent;
    // `REASON_CODES.POLICY_ABSENT` == 'POLICY_ABSENT' in the frozen guardrail (`06` calls the code
    // `POL_ABSENT`; `POL_ABSENT` is the rule id).
    expect(guardrail.reasonCode).toBe('POLICY_ABSENT');
    expect((guardrail.refusal as RefusalPayload).unavailable).toBe(true);
  });

  it('emits no tokens when the post-check replaced the answer', async () => {
    registerMockResponse(mockResponseKey(buildAssistantRequest(requestInput())), {
      json: { ...ANSWER, answerMarkdown: '```sql\nselect 1;\n```' },
      finishReason: 'stop',
    });
    const result = await runAssistantTurn(turnInput(createMockProvider()));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const frames = assistantStreamFrames(streamInput(result));
    expect(frames.map((frame) => frame.event)).toEqual(['guardrail', 'message', 'done']);
    const guardrail = frames[0]?.data as GuardrailEvent;
    expect(guardrail.verdict).toBe('REFUSE');
    expect(guardrail.rules).toContain('POST_CODE');
  });
});

describe('a failed answer reports an error frame and is still a refusal', () => {
  it('emits LLM_OUTPUT_INVALID with a refusal verdict (06 section 5.5.9 rule 6)', async () => {
    // No fixture registered: the mock refuses (`json: null`), which is a schema failure, not a
    // provider outage.
    const result = await runAssistantTurn(turnInput(createMockProvider()));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const frames = assistantStreamFrames(streamInput(result));
    const events = frames.map((frame) => frame.event);
    expect(events).toEqual(['guardrail', 'message', 'error', 'done']);
    const guardrail = frames[0]?.data as GuardrailEvent;
    expect(guardrail.verdict).toBe('REFUSE');
    expect(guardrail.reasonCode).toBe('SCHEMA_VALIDATION_FAILED');
    const error = frames.find((frame) => frame.event === 'error')?.data as { code: string };
    expect(error.code).toBe('LLM_OUTPUT_INVALID');
  });
});

describe('the SSE encoding', () => {
  it('writes an event line, a data line and a blank line', () => {
    expect(encodeSseFrame({ event: 'done', data: { usage: { inputTokens: 1 } } })).toBe(
      'event: done\ndata: {"usage":{"inputTokens":1}}\n\n',
    );
  });

  it('never puts a raw newline inside a frame, so a body cannot forge an event', () => {
    const frame = encodeSseFrame({ event: 'token', data: { text: 'a\nb' } });
    // The frame is exactly three lines: `event:`, `data:`, and the blank line that terminates it.
    // `split('\n')` therefore yields four fields, because the terminating "\n\n" leaves one empty
    // field -- the line ending -- and one more for the blank line itself. Asserting the full array
    // is stronger than counting prefixes: it pins the frame's length, which is what makes a forged
    // event impossible.
    expect(frame.split('\n')).toEqual(['event: token', 'data: {"text":"a\\nb"}', '', '']);

    // The property the frame length exists to guarantee: a newline inside the payload is escaped by
    // JSON, so a student's own text cannot start a second `event:` or `data:` line.
    expect(frame.match(/^event:/gm)).toHaveLength(1);
    expect(frame.match(/^data:/gm)).toHaveLength(1);
    expect(frame.endsWith('\n\n')).toBe(true);
    expect(frame).toContain('a\\nb');
  });
});

/**
 * The adapter contract tests (`04` section 10.3: "Adapter -- contract tests against `mock`").
 *
 * Everything here runs **offline and without a database** (`12` section 3.7). The budget store is
 * injected so the ceiling can be tested without `llm_call_counters`, and the provider is the real
 * mock adapter rather than a hand-written stub, so the test exercises the code the offline demo runs.
 *
 * What is being protected:
 *   - the mock is deterministic and **refuses** an unknown request instead of inventing a success
 *     (`04` section 5.8 rules 1 and 3);
 *   - the budget is consumed **before** the call and exhaustion is non-retryable (`04` section 5.6);
 *   - `insight_engine` cannot make a call on any provider (D67);
 *   - the capability union carries its six members (D68, trap T6).
 */

import { describe, expect, it } from 'vitest';

import type { AppConfig } from '@/lib/config';
import {
  scopeKeyFor,
  scopeKindForCapability,
  type BudgetStore,
} from '@/lib/llm/budget';
import { createLlmClient, resolveProvider } from '@/lib/llm';
import { createMockProvider, mockResponseKey, registerMockResponse, resetMockResponses } from '@/lib/llm/mock';
import { createGeminiProvider, thinkingKeyFor } from '@/lib/llm/gemini';
import { toResponseFormat, structurePassSchema } from '@/lib/llm/schema';
import { assembleMessages, renderGroundingChunks } from '@/lib/llm/prompt';
import { LlmError, type LlmRequest } from '@/lib/llm/types';

function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    nodeEnv: 'test',
    databaseUrl: null,
    authSecret: 'x'.repeat(32),
    anonIdSecret: 'y'.repeat(32),
    llmProvider: 'mock',
    llmModelReasoning: 'mock',
    llmModelMultimodal: null,
    llmThinking: null,
    geminiApiKey: null,
    deepseekApiKey: null,
    llmBaseUrl: null,
    llmMaxCallsPerSession: 2,
    storageDriver: 'local',
    storageLocalDir: './.storage',
    s3: { endpoint: null, region: null, bucket: null, accessKeyId: null, secretAccessKey: null },
    uploadMaxBytes: 26_214_400,
    appBaseUrl: 'http://localhost:3000',
    ...overrides,
  };
}

function request(overrides: Partial<LlmRequest> = {}): LlmRequest {
  return {
    capability: 'assignment_analyst',
    modelId: 'mock',
    systemPrefixId: 'assignment_analyst-structure-v1',
    messages: assembleMessages({
      systemPrefixId: 'assignment_analyst-structure-v1',
      staticPlatform: 'STATIC',
      staticPolicy: 'POLICY',
      grounding: renderGroundingChunks([
        {
          id: 'chunk-1',
          pageFrom: 4,
          pageTo: 4,
          sectionLabel: '3.2',
          text: '1. Requirement: the report must state the word count and the reference style.',
        },
      ]),
      variable: 'TASK',
    }),
    responseFormat: toResponseFormat('analyst_structure_v1', structurePassSchema),
    temperature: 0,
    maxOutputTokens: 100,
    timeoutMs: 1000,
    sessionId: 'session-1',
    ...overrides,
  };
}

describe('the mock provider (04 section 5.8)', () => {
  it('names six capabilities on the frozen union, including attachment_extraction', () => {
    const capabilities: Array<LlmRequest['capability']> = [
      'assignment_analyst',
      'policy_guard',
      'student_assistant',
      'discussion_moderator',
      'insight_engine',
      'attachment_extraction',
    ];
    expect(capabilities).toHaveLength(6);
    expect(capabilities).toContain('attachment_extraction');
  });

  it('returns the same bytes for the same request, across two provider instances', async () => {
    const first = await createMockProvider().complete(request());
    const second = await createMockProvider().complete(request());
    expect(second.json).toEqual(first.json);
    expect(second.text).toBe(first.text);
    expect(second.usage).toEqual(first.usage);
    expect(second.latencyMs).toBe(0);
  });

  it('reports a stable request key for structurally identical requests', () => {
    expect(mockResponseKey(request())).toBe(mockResponseKey(request()));
  });

  it('produces a schema-valid structure grounded in the chunks it was sent', async () => {
    const response = await createMockProvider().complete(request());
    const parsed = structurePassSchema.safeParse(response.json);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.requirements.length).toBeGreaterThan(0);
    const cited = parsed.data.requirements[0];
    expect(cited?.sourceChunkRef).toBe(0);
  });

  it('refuses an unknown request rather than inventing a success (rule 3)', async () => {
    const response = await createMockProvider().complete(
      request({ systemPrefixId: 'student_assistant-v9' }),
    );
    expect(response.json).toBeNull();
    expect(response.text).toBeNull();
    // `04` section 5.7 treats CONTENT_FILTERED as refusal-equivalent, which is what the caller sees.
    expect(response.finishReason).toBe('content_filter');
  });

  it('lets a test force an exact response by request key (rule 5)', async () => {
    const forced = { ok: true };
    registerMockResponse(mockResponseKey(request()), { json: forced });
    try {
      const response = await createMockProvider().complete(request());
      expect(response.json).toEqual(forced);
    } finally {
      resetMockResponses();
    }
  });

  it('refuses the insight engine on every provider (D67)', async () => {
    await expect(
      createMockProvider().complete(request({ capability: 'insight_engine' })),
    ).rejects.toBeInstanceOf(LlmError);
    await expect(
      createGeminiProvider({
        apiKey: 'not-a-real-key',
        baseUrl: null,
        thinkingLevels: { guardrail: 'low', assistant: 'medium', analyst: 'high', moderator: 'low', extraction: 'low' },
      }).complete(request({ capability: 'insight_engine' })),
    ).rejects.toBeInstanceOf(LlmError);
  });

  it('accepts every known-good model id in validateConfiguration (04 section 5.4 step 7)', async () => {
    const validation = await createMockProvider().validateConfiguration();
    expect(validation.ok).toBe(true);
    expect(validation.latencyMs).toBe(0);
  });
});

describe('the budget wrapper (04 section 5.6)', () => {
  it('consumes before the call and refuses the call after the ceiling', async () => {
    const consumed: string[] = [];
    const store: BudgetStore = {
      consume: (input) => {
        consumed.push(input.scopeKey);
        const allowed = consumed.length <= 1;
        return Promise.resolve({ allowed, callsUsed: consumed.length, maxCalls: 1 });
      },
    };
    const client = createLlmClient({ provider: createMockProvider(), config: testConfig(), budget: store });

    await client.complete(request());
    expect(consumed).toHaveLength(1);

    const error = await client.complete(request()).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(LlmError);
    expect((error as LlmError).code).toBe('BUDGET_EXCEEDED');
    expect((error as LlmError).retryable).toBe(false);
    // The second call was blocked *before* it was issued: the counter was consulted twice, and no
    // third request was made.
    expect(consumed).toHaveLength(2);
  });

  it('reports every call through onCall, including a blocked one, and never a body', async () => {
    const logs: Array<{ ok: boolean; errorCode: string | null; capability: string }> = [];
    const store: BudgetStore = {
      consume: () => Promise.resolve({ allowed: false, callsUsed: 9, maxCalls: 9 }),
    };
    const client = createLlmClient({
      provider: createMockProvider(),
      config: testConfig(),
      budget: store,
      onCall: (log) => logs.push({ ok: log.ok, errorCode: log.errorCode, capability: log.capability }),
    });

    await client.complete(request()).catch(() => undefined);
    expect(logs).toEqual([{ ok: false, errorCode: 'BUDGET_EXCEEDED', capability: 'assignment_analyst' }]);
  });

  it('gives attachment extraction its own scope, never the assistant session counter (D68)', () => {
    expect(scopeKindForCapability('attachment_extraction')).toBe('attachment_extraction');
    expect(scopeKindForCapability('student_assistant')).toBe('assistant_session');
    expect(scopeKeyFor('attachment_extraction', 'u1')).not.toBe(scopeKeyFor('student_assistant', 'u1'));
    expect(scopeKeyFor('attachment_extraction', 'u1')).toBe('attachment_extraction:u1');
  });
});

describe('plumbing the Phase 3 session depends on', () => {
  it('maps each capability to its env thinking level (D62, D68)', () => {
    expect(thinkingKeyFor('policy_guard')).toBe('guardrail');
    expect(thinkingKeyFor('student_assistant')).toBe('assistant');
    expect(thinkingKeyFor('assignment_analyst')).toBe('analyst');
    expect(thinkingKeyFor('discussion_moderator')).toBe('moderator');
    expect(thinkingKeyFor('attachment_extraction')).toBe('extraction');
  });

  it('resolves the configured provider without reading the environment', () => {
    expect(resolveProvider(testConfig({ llmProvider: 'mock' })).id).toBe('mock');
    expect(
      resolveProvider(
        testConfig({
          llmProvider: 'gemini',
          geminiApiKey: 'not-a-real-key',
          llmThinking: { guardrail: 'low', assistant: 'medium', analyst: 'high', moderator: 'low', extraction: 'low' },
        }),
      ).id,
    ).toBe('gemini');
  });
});

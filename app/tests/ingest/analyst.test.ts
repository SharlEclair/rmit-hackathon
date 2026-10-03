/**
 * The Assignment Analyst (`src/features/ingest/analyst.ts`) driven by the **mock** provider.
 *
 * This is the offline contract test for the five-pass pipeline: it exercises prompt assembly, the
 * request shape (capability, prefix id, structured format), schema validation, grounding resolution
 * and the deterministic constraints, with no network and no database.
 *
 * The grounding cases are the ones with teeth. A citation that does not resolve must be dropped
 * rather than written with a null chunk (`source_chunk_id` is NOT NULL), and a quote that is not a
 * span of its chunk must carry `VERBATIM_MISMATCH` so it cannot be approved (`06` section 5.5.8, C2).
 */

import { describe, expect, it } from 'vitest';

import type { T1Chunk } from '@/lib/db/queries/assignments';
import { createMockProvider } from '@/lib/llm/mock';
import { LlmError, type LlmProvider, type LlmRequest, type LlmResponse } from '@/lib/llm/types';
import { renderGroundingChunks } from '@/lib/llm/prompt';
import { buildAnalystRequest, runAnalyst, selectGrounding } from '@/features/ingest/analyst';
import { PASS_PREFIX_IDS } from '@/features/ingest/prompts/analyst.v1';

function chunk(overrides: Partial<T1Chunk> = {}): T1Chunk {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    sourceId: '22222222-2222-2222-2222-222222222222',
    sourceKind: 'brief',
    chunkIndex: 0,
    text: '1. The report must state the word count and the reference style for every source used.',
    pageFrom: 1,
    pageTo: 1,
    sectionLabel: '3. Requirements',
    ...overrides,
  };
}

const CHUNKS: T1Chunk[] = [
  chunk(),
  chunk({
    id: '33333333-3333-3333-3333-333333333333',
    chunkIndex: 1,
    text: 'Criterion 2 -- Analysis carries 25% of the mark for the assignment.',
    sectionLabel: 'Criterion 2 -- Analysis',
    pageFrom: 4,
    pageTo: 4,
  }),
  chunk({
    id: '44444444-4444-4444-4444-444444444444',
    chunkIndex: 2,
    sourceKind: 'ai_policy',
    text: 'You may use AI tools to explain concepts, but you must not submit work you did not write.',
    sectionLabel: 'AI use',
    pageFrom: 1,
    pageTo: 1,
  }),
];

const APPROVED = { policyRules: [], milestoneTitles: [] };

describe('buildAnalystRequest', () => {
  it('uses the frozen capability, the pass prefix id and a structured response format', () => {
    const request = buildAnalystRequest({
      assignmentId: 'a',
      pass: 'structure',
      chunks: CHUNKS,
      approved: APPROVED,
      modelId: 'mock',
      sessionId: 'job-1',
    });
    expect(request.capability).toBe('assignment_analyst');
    expect(request.systemPrefixId).toBe(PASS_PREFIX_IDS.structure);
    expect(request.responseFormat.type).toBe('json_schema');
    expect(request.temperature).toBe(0);
  });

  it('puts the static blocks in the system role and the variable block last', () => {
    const request = buildAnalystRequest({
      assignmentId: 'a',
      pass: 'faq',
      chunks: CHUNKS,
      approved: APPROVED,
      modelId: 'mock',
      sessionId: 'job-1',
    });
    const [system, user] = request.messages;
    expect(system?.role).toBe('system');
    expect(user?.role).toBe('user');
    expect(JSON.stringify(system)).toContain('Non-negotiable constraints');
    expect(JSON.stringify(user)).toContain('TASK (pass C of 5)');
  });

  it('numbers the grounding chunks the way the prompt tells the model to cite them', () => {
    const request = buildAnalystRequest({
      assignmentId: 'a',
      pass: 'structure',
      chunks: CHUNKS,
      approved: APPROVED,
      modelId: 'mock',
      sessionId: 'job-1',
    });
    expect(renderGroundingChunks(CHUNKS)).toContain('[#0]');
    expect(JSON.stringify(request.messages)).toContain('[#2]');
  });
});

describe('selectGrounding', () => {
  it('keeps the pipeline order and reports truncation through the caller', () => {
    const selected = selectGrounding(CHUNKS);
    expect(selected.map((entry) => entry.id)).toEqual(CHUNKS.map((entry) => entry.id));
  });
});

describe('runAnalyst with the mock provider', () => {
  it('runs the five passes and returns a grounded proposal', async () => {
    const proposal = await runAnalyst({
      assignmentId: 'assignment-1',
      chunks: CHUNKS,
      approved: APPROVED,
      modelId: 'mock',
      sessionId: 'job-1',
      client: createMockProvider(),
      now: () => new Date(0),
    });

    expect(proposal.failures).toEqual([]);
    expect(proposal.callLogs).toHaveLength(5);
    expect(proposal.requirements.length).toBeGreaterThan(0);
    expect(proposal.requirements.every((entry) => entry.chunk !== null)).toBe(true);
    expect(proposal.milestones.length).toBeGreaterThan(0);
    expect(proposal.milestones[0]?.items.length).toBeGreaterThan(0);
    expect(proposal.policyRules.length).toBeGreaterThan(0);
    expect(proposal.findings.length).toBeGreaterThan(0);
    expect(proposal.generatedAt).toBe('1970-01-01T00:00:00.000Z');
  });

  it('gives each pass its own budget log with the ingestion run as the session', async () => {
    const proposal = await runAnalyst({
      assignmentId: 'assignment-1',
      chunks: CHUNKS,
      approved: APPROVED,
      modelId: 'mock',
      sessionId: 'job-1',
      client: createMockProvider(),
    });
    expect(new Set(proposal.callLogs.map((log) => log.sessionId))).toEqual(new Set(['job-1']));
    expect(new Set(proposal.callLogs.map((log) => log.systemPrefixId)).size).toBe(5);
  });
});

/** A provider that answers with a fixed payload, so failure paths can be driven deliberately. */
function stubProvider(payloads: Record<string, unknown>): LlmProvider {
  return {
    id: 'mock',
    capabilities: { jsonOutput: true, toolCalls: false, vision: false, audio: false, video: false },
    validateConfiguration: () =>
      Promise.resolve({ ok: true, provider: 'mock', modelId: 'mock', checkedAt: '1970-01-01T00:00:00.000Z', latencyMs: 0 }),
    complete: (request: LlmRequest): Promise<LlmResponse> => {
      const payload = payloads[request.systemPrefixId];
      if (payload === undefined) {
        return Promise.reject(new LlmError('PROVIDER_UNAVAILABLE', 'no stub for this pass', false));
      }
      return Promise.resolve({
        provider: 'mock',
        modelId: 'mock',
        json: payload,
        text: JSON.stringify(payload),
        toolCalls: [],
        usage: { inputTokens: 1, cachedInputTokens: 0, outputTokens: 1 },
        finishReason: 'stop',
        latencyMs: 0,
        providerRequestId: null,
      });
    },
  };
}

describe('grounding resolution', () => {
  it('drops a requirement whose chunk ref was not sent, and says so in the notes', async () => {
    const proposal = await runAnalyst({
      assignmentId: 'a',
      chunks: CHUNKS,
      approved: APPROVED,
      modelId: 'mock',
      sessionId: 'job-1',
      client: stubProvider({
        'assignment_analyst-structure-v1': {
          requirements: [
            {
              title: 'Invented',
              verbatimText: 'not in any chunk',
              sourceChunkRef: 99,
              sourcePage: 1,
              sourceSectionLabel: null,
              mapSummary: null,
            },
          ],
          rubricSections: [],
        },
      }),
    });
    expect(proposal.requirements[0]?.chunk).toBeNull();
    expect(proposal.notes.some((note) => note.includes('#99'))).toBe(true);
  });

  it('keeps a non-verbatim quote but marks it VERBATIM_MISMATCH', async () => {
    const proposal = await runAnalyst({
      assignmentId: 'a',
      chunks: CHUNKS,
      approved: APPROVED,
      modelId: 'mock',
      sessionId: 'job-1',
      client: stubProvider({
        'assignment_analyst-structure-v1': {
          requirements: [
            {
              title: 'Reworded',
              verbatimText: 'Students must provide a bibliography of at least eight sources.',
              sourceChunkRef: 0,
              sourcePage: 1,
              sourceSectionLabel: null,
              mapSummary: null,
            },
          ],
          rubricSections: [],
        },
      }),
    });
    const entry = proposal.requirements[0];
    expect(entry?.chunk).not.toBeNull();
    expect(entry?.warnings.map((warning) => warning.code)).toContain('VERBATIM_MISMATCH');
  });

  it('marks a rubric weight that the cited chunk does not state', async () => {
    const proposal = await runAnalyst({
      assignmentId: 'a',
      chunks: CHUNKS,
      approved: APPROVED,
      modelId: 'mock',
      sessionId: 'job-1',
      client: stubProvider({
        'assignment_analyst-structure-v1': {
          requirements: [
            {
              title: 'Word count',
              verbatimText: 'The report must state the word count',
              sourceChunkRef: 0,
              sourcePage: 1,
              sourceSectionLabel: null,
              mapSummary: null,
            },
          ],
          rubricSections: [
            {
              sectionLabel: 'Criterion 2 -- Analysis',
              criteriaText: 'Criterion 2 -- Analysis carries 25% of the mark for the assignment.',
              weightPercent: 40,
              sourceChunkRef: 1,
              pageFrom: 4,
              pageTo: 4,
              mapInterpretation: null,
            },
          ],
        },
      }),
    });
    expect(proposal.rubricSections[0]?.warnings.map((warning) => warning.code)).toContain(
      'WEIGHT_NOT_FOUND',
    );
  });

  it('records a schema-invalid pass as a refusal rather than retrying it (D16)', async () => {
    const proposal = await runAnalyst({
      assignmentId: 'a',
      chunks: CHUNKS,
      approved: APPROVED,
      modelId: 'mock',
      sessionId: 'job-1',
      client: stubProvider({
        'assignment_analyst-structure-v1': {
          requirements: [
            {
              title: 'Word count',
              // A verbatim span of chunk 0, so only the milestones pass fails in this test.
              verbatimText: 'The report must state the word count',
              sourceChunkRef: 0,
              sourcePage: 1,
              sourceSectionLabel: null,
              mapSummary: null,
            },
          ],
          rubricSections: [],
        },
        // `milestones` has `min(1)`: an empty list is a schema failure, which is a refusal.
        'assignment_analyst-milestones-v1': { milestones: [] },
        'assignment_analyst-faq-v1': { faqEntries: [] },
        'assignment_analyst-policy-v1': { rules: [] },
        'assignment_analyst-ambiguity-v1': { findings: [] },
      }),
    });
    expect(proposal.failures.map((failure) => failure.pass)).toEqual(['milestones']);
    expect(proposal.milestones).toEqual([]);
    // The other four passes still produced their results: one refused pass does not discard the run.
    expect(proposal.requirements).toHaveLength(1);
    expect(proposal.faqEntries).toEqual([]);
  });

  it('records a provider outage on every pass instead of throwing out of the run', async () => {
    const proposal = await runAnalyst({
      assignmentId: 'a',
      chunks: CHUNKS,
      approved: APPROVED,
      modelId: 'mock',
      sessionId: 'job-1',
      client: stubProvider({}),
    });
    // Every pass failed, so the pipeline's own gate decides the run is unusable -- and it decides
    // that from `failures`, not from an exception it has to guess the meaning of.
    expect(proposal.failures.map((failure) => failure.pass)).toEqual([
      'structure',
      'milestones',
      'faq',
      'policy',
      'ambiguity',
    ]);
  });
});

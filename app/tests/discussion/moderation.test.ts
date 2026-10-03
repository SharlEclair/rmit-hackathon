import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createMockProvider, mockResponseKey, registerMockResponse, resetMockResponses } from '@/lib/llm/mock';
import type { Executor } from '@/lib/db/queries/courses';
import type { LlmProvider } from '@/lib/llm/types';
import { moderationFlagWrites, resetModerationFlagWrites } from './stub-moderation-writes';
import { moderatorOutputSchema } from '@/features/discussion/moderator-schema';
import { buildModeratorRequest } from '@/features/discussion/moderator-prompt';
import { moderatePost } from '@/features/discussion/moderation';

/**
 * The moderation pass: `05-AI-GUARDRAILS.md` section 9.4 binding rule 5, which is the whole reason this
 * suite exists.
 *
 * **"Moderator failure must not hide student content, and must not silently pass content either."** Both
 * halves are asserted for every failure mode, because a failure path that returned `none` would let
 * content through unexamined and one that returned `hide_immediate` would suppress a post on the strength
 * of a parse error. The action for a failure is `mark`: flagged, visible, with a note.
 *
 * **The provider is the real mock, not a hand-written stub.** `createMockProvider` returns `json: null`
 * with `finishReason: 'content_filter'` for a request it has no fixture for -- by design, so that "a
 * well-formed object would be indistinguishable from a model answer, would pass a shallow check, and would
 * be persisted as an AI artifact". Using it means this suite exercises the same refusal path the
 * application sees, and `registerMockResponse` forces an exact payload for the success cases.
 *
 * **The database write is stubbed at the query layer** (`insertModerationFlag`), which is the only DB
 * access `moderatePost` makes. `pnpm test` must pass with no database (`12` section 3.7), so the assertion
 * is over the argument the service passed rather than over a row -- which is also what lets the test check
 * the provenance columns a row would carry.
 */

const EXECUTOR = {} as unknown as Executor;

const INPUT = {
  postId: '11111111-1111-4111-8111-111111111111',
  assignmentId: '22222222-2222-4222-8222-222222222222',
  assignmentTitle: 'Case Analysis and Design Proposal Report',
  grounding: 'The report must be 2000 words and cite at least eight sources.',
  postBody: 'How long should the report be?',
  modelId: 'mock',
  sessionId: 'moderation-batch-1',
};

/** The exact key the service's request produces, so a fixture cannot answer a different request. */
function keyFor(): string {
  return mockResponseKey(
    buildModeratorRequest({
      modelId: INPUT.modelId,
      sessionId: INPUT.sessionId,
      assignmentTitle: INPUT.assignmentTitle,
      grounding: INPUT.grounding,
      postBody: INPUT.postBody,
    }),
  );
}

/** Register a moderator payload for the request this service will build. */
function registerPayload(json: unknown): void {
  // The override shape is `Partial<Pick<LlmResponse, 'json' | ...>>`, so the payload goes under `json` and
  // `finishReason: 'stop'` records that the provider completed normally rather than declining.
  registerMockResponse(keyFor(), { json, finishReason: 'stop' });
}

function validFlag(overrides: {
  reasonCode: string;
  severity: number;
  explanation?: string;
  spanStart?: number | null;
  spanEnd?: number | null;
}): Record<string, unknown> {
  return {
    reasonCode: overrides.reasonCode,
    severity: overrides.severity,
    explanation: overrides.explanation ?? 'Explanation for the tutor.',
    spanStart: overrides.spanStart ?? null,
    spanEnd: overrides.spanEnd ?? null,
  };
}

beforeEach(() => {
  resetMockResponses();
  resetModerationFlagWrites();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('a clean post is not flagged, and nothing is written', () => {
  it('returns no action and writes no row when the moderator flags nothing', async () => {
    registerPayload({ flags: [], overallSeverity: 0, containsPersonalData: false });
    const result = await moderatePost(EXECUTOR, createMockProvider(), INPUT);

    expect(result.output.flags).toEqual([]);
    expect(result.action).toBe('none');
    expect(result.failure).toBeNull();
    // The distinction that matters: "no flags" here means the moderator said so, not that it failed.
    expect(result.flagsWritten).toBe(0);
    expect(moderationFlagWrites).toHaveLength(0);
  });
});

describe('a flagged post writes one row per flag, with its provenance', () => {
  it('writes a severity-1 flag and takes no action', async () => {
    registerPayload({
      flags: [
        validFlag({ reasonCode: 'MOD_OFF_TOPIC', severity: 1, explanation: 'Discusses a different unit.' }),
      ],
      overallSeverity: 1,
      containsPersonalData: false,
    });
    const result = await moderatePost(EXECUTOR, createMockProvider(), INPUT);

    expect(result.failure).toBeNull();
    expect(result.action).toBe('none');
    expect(result.flagsWritten).toBe(1);
    expect(moderationFlagWrites[0]).toMatchObject({
      targetKind: 'discussion_post',
      targetId: INPUT.postId,
      source: 'ai',
      severity: 'low',
      reasonCode: 'MOD_OFF_TOPIC',
      reporterAnonIdentityId: null,
      aiModelId: 'mock',
      aiPromptVersion: 'moderator_output_v1',
    });
  });

  it('hides a severity-3 flag pending review, and keeps the word high', async () => {
    // `06` section 4.4's `severity` column has three values against `05` section 9.2's four, so 3 and 4
    // both read `high` -- and the *number* is what drives the action. Asserted together so the two scales
    // cannot silently become one.
    registerPayload({
      flags: [
        validFlag({
          reasonCode: 'MOD_PII',
          severity: 3,
          explanation: 'States a phone number.',
          spanStart: 12,
          spanEnd: 24,
        }),
      ],
      overallSeverity: 3,
      containsPersonalData: true,
    });
    const result = await moderatePost(EXECUTOR, createMockProvider(), INPUT);

    expect(result.action).toBe('hide_pending_review');
    expect(moderationFlagWrites[0]).toMatchObject({ severity: 'high', reasonCode: 'MOD_PII' });
    expect(moderationFlagWrites[0]?.detail).toBe('States a phone number.');
  });

  it('hides a severity-4 flag immediately', async () => {
    registerPayload({
      flags: [
        validFlag({ reasonCode: 'MOD_THREAT', severity: 4, explanation: 'Threatens another student.' }),
      ],
      overallSeverity: 4,
      containsPersonalData: false,
    });
    const result = await moderatePost(EXECUTOR, createMockProvider(), INPUT);
    expect(result.action).toBe('hide_immediate');
  });

  it('writes every flag when several are returned', async () => {
    registerPayload({
      flags: [
        validFlag({ reasonCode: 'MOD_SPAM', severity: 1, explanation: 'Repeated.' }),
        validFlag({ reasonCode: 'MOD_INCIVILITY', severity: 2, explanation: 'Rude.' }),
      ],
      overallSeverity: 2,
      containsPersonalData: false,
    });
    const result = await moderatePost(EXECUTOR, createMockProvider(), INPUT);
    expect(result.flagsWritten).toBe(2);
    expect(result.action).toBe('mark');
    expect(moderationFlagWrites.map((write) => write.reasonCode)).toEqual(['MOD_SPAM', 'MOD_INCIVILITY']);
  });
});

describe('every failure is flagged and visible, never hidden and never silent (binding rule 5)', () => {
  /** The assertions binding rule 5 requires of every failure path, in one place. */
  async function assertFailureIsFlaggedAndVisible(client: LlmProvider) {
    const result = await moderatePost(EXECUTOR, client, INPUT);

    expect(result.failure).not.toBeNull();
    // "must not hide student content" -- the action is a marker, not a hide.
    expect(result.action).toBe('mark');
    // "must not silently pass content either" -- the action is not `none`.
    expect(result.action).not.toBe('none');
    // Severity 2 is the visible middle that 05 section 9.4 assigns to exactly this case.
    expect(result.output.overallSeverity).toBe(2);
    // The tutor must be able to read what happened, so something is written.
    expect(result.flagsWritten).toBeGreaterThan(0);
    return result;
  }

  it('treats an unparseable response as severity 2 with a tutor note', async () => {
    // The provider answered with JSON of the wrong shape: a string where the object belongs.
    // `parseStructured` refuses it (D16: never retry), and the failure path applies.
    registerPayload('not an object');
    const result = await assertFailureIsFlaggedAndVisible(createMockProvider());
    expect(result.failure).toBe('SCHEMA_INVALID');
    expect(moderationFlagWrites[0]?.detail).toContain('Moderation did not complete');
  });

  it('treats a structurally invalid payload as severity 2', async () => {
    // Valid JSON, failing the schema: `overallSeverity` disagrees with its own flags, which the refinement
    // refuses. This is the case a shallow check would have accepted.
    registerPayload({
      flags: [validFlag({ reasonCode: 'MOD_OFF_TOPIC', severity: 1, explanation: 'Unrelated.' })],
      overallSeverity: 4,
      containsPersonalData: false,
    });
    const result = await assertFailureIsFlaggedAndVisible(createMockProvider());
    expect(result.failure).toBe('SCHEMA_INVALID');
  });

  it('treats an unknown reason code as severity 2, because the vocabulary is closed', async () => {
    // The doc's `^MOD_[A-Z_]+$` pattern would accept this; the enum refuses it.
    registerPayload({
      flags: [validFlag({ reasonCode: 'MOD_FOOBAR', severity: 1, explanation: 'Unknown.' })],
      overallSeverity: 1,
      containsPersonalData: false,
    });
    const result = await assertFailureIsFlaggedAndVisible(createMockProvider());
    expect(result.failure).toBe('SCHEMA_INVALID');
  });

  it('treats a provider refusal as severity 2 rather than reading it as a flag', async () => {
    // No fixture is registered, so the mock returns `json: null` with `content_filter` -- the same shape a
    // live provider gives when it declines to classify. That is not a policy finding about the post.
    const result = await assertFailureIsFlaggedAndVisible(createMockProvider());
    expect(result.failure).toBe('CONTENT_FILTERED');
  });

  it('treats a thrown provider error as severity 2, and does not rethrow', async () => {
    const real = createMockProvider();
    const failing: LlmProvider = {
      id: 'mock',
      capabilities: real.capabilities,
      validateConfiguration: () => real.validateConfiguration(),
      complete: () => Promise.reject(new Error('socket hang up')),
    };
    const result = await assertFailureIsFlaggedAndVisible(failing);
    expect(result.failure).toBe('PROVIDER_ERROR');
  });
});

describe('the fallback is itself valid and never a fabricated policy claim', () => {
  it('produces output the application-side schema accepts', async () => {
    registerPayload('not an object');
    const result = await moderatePost(EXECUTOR, createMockProvider(), INPUT);
    // If the fallback failed validation it would be the thing that fails -- an infinite regression.
    expect(moderatorOutputSchema.safeParse(result.output).success).toBe(true);
  });

  it('says what happened rather than asserting a policy breach', async () => {
    registerPayload('not an object');
    const result = await moderatePost(EXECUTOR, createMockProvider(), INPUT);
    // The reason code for a parse failure is not a judgement about the content. The fallback uses
    // MOD_INCIVILITY's slot as a carrier and the explanation says what actually happened, so a tutor reads
    // the truth rather than a fabricated policy claim.
    expect(result.output.flags[0]?.explanation).toMatch(/could not be parsed|did not complete/);
    // And the note names the failure, so a tutor can tell a broken moderator from a real flag.
    expect(moderationFlagWrites[0]?.detail).toContain('SCHEMA_INVALID');
  });
});

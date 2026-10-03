/**
 * `POST /api/student/assignments/{assignmentId}/assistant/messages` -- the SSE route
 * (`06-DATA-MODEL.md` sections 5.4, 5.5.9; trap T4; I4, T13).
 *
 * The route is an adapter: guard, validate, resolve, call the turn, persist, encode. The event order
 * it emits is stated and built in `src/features/assistant/stream.ts` (`guardrail` first, always;
 * zero `token` frames for a refusal), and the turn pipeline is `src/features/assistant/answer.ts`.
 *
 * **A refusal is a `200` with a refusal-shaped payload** (I4, T13): nothing in the refusal path
 * returns an error status, and nothing in the refusal path reaches the provider.
 *
 * **Blocked uploads are refused before anything else happens** (`06` section 5.5.9 rule 5, C6): an
 * upload whose `guardrail_scan_status <> 'clear'` produces `400 VALIDATION_FAILED` with
 * `details.uploadIds`, never a partial send.
 *
 * **The model call is outside every transaction**, and the writes that describe it -- both message
 * rows, the session counters, both guardrail log rows and the analytics event -- commit together in
 * one (trap T7).
 */

import { NextResponse, type NextRequest } from 'next/server';

import {
  PLATFORM_ERROR_MESSAGES,
  apiError,
  resolveRequestId,
  withRequestId,
  withRetryAfter,
} from '@/lib/api/errors';
import type { AssistantRequest } from '@/lib/api/types';
import { guardStudentVisibleAssignment } from '@/lib/auth/guards';
import { getConfig } from '@/lib/config';
import { deriveSubjectRef } from '@/lib/db/queries/analytics';
import { findStudentUpload, readUploadExtractedText } from '@/lib/db/queries/uploads';
import { withTransaction } from '@/lib/db/transaction';
import { createGuardrailClassifierPort } from '@/lib/guardrail/classifier-port';
import { getLlmClient } from '@/lib/llm';
import {
  ASSISTANT_MAX_TURN_CHARS,
  ASSISTANT_MAX_UPLOADS,
  runAssistantTurn,
} from '@/features/assistant/answer';
import {
  assistantCallsRemaining,
  ensureAssistantSession,
  loadCompletedItemCount,
  loadGrounding,
  loadPolicyRows,
  loadSessionState,
  newAssistantId,
  persistAssistantTurn,
  resolveAssistantModelId,
  resolveMilestone,
} from '@/features/assistant/service';
import { assistantStreamFrames, encodeSseFrame } from '@/features/assistant/stream';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Milliseconds between `token` frames. Transport pacing only: it changes when a frame becomes
 * readable, never its content or order.
 *
 * Small enough that a long answer is still fast (an answer is capped well under the 2,500-character
 * schema bound, so at 48 characters per frame this is at most ~50 frames), and large enough that the
 * client paints more than once. Exported so a test can assert the stream is paced rather than assert
 * a number that would then drift.
 */
export const STREAM_PACING_MS = 12;

/** A cancellable-by-completion delay. No timer survives the response. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

interface ParsedBody {
  readonly body: string;
  readonly uploadIds: readonly string[];
  readonly milestoneId: string | null;
}

function parseBody(raw: unknown):
  | { readonly ok: true; readonly parsed: ParsedBody }
  | { readonly ok: false; readonly details: Record<string, unknown> } {
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, details: { body: 'expected an object' } };
  }
  const record = raw as Record<string, unknown>;

  const body = record['body'];
  if (typeof body !== 'string' || body.trim().length === 0) {
    return { ok: false, details: { body: 'required, 1..4000 characters' } };
  }
  if (body.length > ASSISTANT_MAX_TURN_CHARS) {
    return { ok: false, details: { body: `at most ${ASSISTANT_MAX_TURN_CHARS} characters` } };
  }

  const uploadIds: string[] = [];
  const rawUploads = record['uploadIds'];
  if (rawUploads !== undefined && rawUploads !== null) {
    if (!Array.isArray(rawUploads) || rawUploads.length > ASSISTANT_MAX_UPLOADS) {
      return { ok: false, details: { uploadIds: `at most ${ASSISTANT_MAX_UPLOADS} ids` } };
    }
    for (const entry of rawUploads) {
      if (typeof entry !== 'string' || entry === '') {
        return { ok: false, details: { uploadIds: 'every entry must be a non-empty string' } };
      }
      uploadIds.push(entry);
    }
  }

  const rawMilestone = record['milestoneId'];
  if (rawMilestone !== undefined && rawMilestone !== null && typeof rawMilestone !== 'string') {
    return { ok: false, details: { milestoneId: 'must be a string or null' } };
  }
  const milestoneId = typeof rawMilestone === 'string' ? rawMilestone : null;

  // Building the frozen `AssistantRequest` here is what keeps the parser and the shared contract
  // from drifting: a field this function starts returning must exist on the interface.
  const value: AssistantRequest =
    uploadIds.length > 0 ? { body, uploadIds, milestoneId } : { body, milestoneId };

  return { ok: true, parsed: { body: value.body, uploadIds, milestoneId } };
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ assignmentId: string }> },
): Promise<NextResponse> {
  const requestId = resolveRequestId(request);
  const { assignmentId } = await context.params;

  // (1) Role, then gate rule G1, then enrolment. All three failures are NOT_FOUND (06 3.4, trap T3).
  const guarded = await guardStudentVisibleAssignment(request, requestId, assignmentId);
  if (!guarded.ok) return guarded.response;
  const { session, scope } = guarded.value;

  // (2) Body validation. The house envelope is the only error shape (D94).
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return apiError('VALIDATION_FAILED', PLATFORM_ERROR_MESSAGES.invalidBody, requestId);
  }
  const parsed = parseBody(raw);
  if (!parsed.ok) {
    return apiError('VALIDATION_FAILED', PLATFORM_ERROR_MESSAGES.invalidBody, requestId, parsed.details);
  }
  const { body, uploadIds, milestoneId } = parsed.parsed;

  // (3) Every attached upload must be this student's, on this assignment, and scan-clear (C6).
  const uploads = await withTransaction(async (tx) => {
    const blocked: string[] = [];
    const excerpts: string[] = [];
    for (const uploadId of uploadIds) {
      const upload = await findStudentUpload(tx, uploadId, session.userId);
      if (
        upload === null ||
        upload.assignmentId !== assignmentId ||
        upload.guardrailScanStatus !== 'clear'
      ) {
        blocked.push(uploadId);
        continue;
      }
      const text = await readUploadExtractedText(tx, uploadId, session.userId);
      if (text !== null && text.trim() !== '') excerpts.push(text);
    }
    return { blocked, excerpts };
  });

  if (uploads.blocked.length > 0) {
    return apiError(
      'VALIDATION_FAILED',
      'One or more attachments have not passed the guardrail scan and cannot be sent.',
      requestId,
      { uploadIds: uploads.blocked },
    );
  }

  let config: ReturnType<typeof getConfig>;
  try {
    config = getConfig();
  } catch {
    // A missing required variable is a configuration fault, never a message about the environment
    // and never a value (C7).
    return apiError('INTERNAL', PLATFORM_ERROR_MESSAGES.internal, requestId);
  }
  const anonIdSecret = config.anonIdSecret;
  if (anonIdSecret === null) {
    return apiError('INTERNAL', PLATFORM_ERROR_MESSAGES.internal, requestId);
  }
  const subjectRef = deriveSubjectRef(anonIdSecret, session.userId, scope.assignmentId);

  // (4) The reads a turn needs: session, published policy, session state, and block C. One
  //     transaction, because a half-read turn is a turn whose guardrail saw a different world.
  const prepared = await withTransaction(async (tx) => {
    const assistantSession = await ensureAssistantSession(tx, { session, scope }, subjectRef);
    const policyRows = await loadPolicyRows(tx, scope);
    const milestone = await resolveMilestone(tx, scope, milestoneId);
    const completedItemCount = await loadCompletedItemCount(tx, session.userId, scope.assignmentId);
    const state = await loadSessionState(
      tx,
      assistantSession.id,
      milestone === null ? null : milestone.title,
      completedItemCount,
    );
    const grounding = await loadGrounding(tx, scope, body);
    return { assistantSession, policyRows, milestone, state, grounding };
  });

  if (milestoneId !== null && prepared.milestone === null) {
    // A focus on a milestone that is not published for this assignment is a validation failure, not
    // an unfocused turn: the client asked for context the student may not see.
    return apiError('VALIDATION_FAILED', PLATFORM_ERROR_MESSAGES.invalidBody, requestId, {
      milestoneId,
    });
  }

  // (5) The model call happens OUTSIDE any transaction.
  const result = await runAssistantTurn({
    assignmentId: scope.assignmentId,
    assistantSessionId: prepared.assistantSession.id,
    modelId: resolveAssistantModelId(config),
    turnText: body,
    attachedText: uploads.excerpts,
    milestoneTitle: prepared.milestone === null ? null : prepared.milestone.title,
    policyRows: prepared.policyRows,
    grounding: prepared.grounding.grounding,
    retrievedChunkIds: prepared.grounding.retrievedChunkIds,
    subjectRef,
    session: prepared.state,
    classifier: createGuardrailClassifierPort(),
    classifierCallsRemaining: assistantCallsRemaining(config, prepared.assistantSession.llmCallCount),
    client: getLlmClient(),
  });

  if (!result.ok) {
    const response = apiError(result.code, result.message, requestId);
    return result.retryAfterSeconds === undefined
      ? response
      : withRetryAfter(response, result.retryAfterSeconds);
  }

  // (6) The turn and its analytics event commit together (trap T7).
  const persisted = await withTransaction((tx) =>
    persistAssistantTurn(tx, {
      assignmentId: scope.assignmentId,
      studentId: session.userId,
      subjectRef,
      anonIdSecret,
      sessionId: prepared.assistantSession.id,
      turnBody: body,
      uploadIds,
      milestoneId: prepared.milestone === null ? null : prepared.milestone.id,
      occurredAt: new Date(),
      result,
      studentMessageId: newAssistantId(),
      assistantMessageId: newAssistantId(),
    }),
  );

  // (7) The stream: the frames are built in `stream.ts` so the order is asserted by a test.
  const frames = assistantStreamFrames({
    result,
    policyRows: prepared.policyRows,
    assignmentId: scope.assignmentId,
    milestoneId: prepared.milestone === null ? null : prepared.milestone.id,
    messageId: persisted.assistantMessageId ?? persisted.studentMessageId,
    createdAt: persisted.createdAt,
    requestId,
  });

  // (8) Emit the frames as they are read, not as one buffered write.
  //
  // `07` section 4.7.2 rule 4 requires the answer to appear progressively ("text appears
  // progressively") with a `Cancel` control, and `07` section 2.1 gives the student a
  // `Checking your request...` line while the verdict is pending. Enqueuing every frame in a tight
  // loop defeats both: the whole body lands in one chunk, so the client paints the verdict and the
  // answer in the same frame and there is nothing to cancel.
  //
  // The pacing below is transport only. It changes no frame's content or order -- `stream.ts` owns
  // those and a test asserts them -- it only decides when a frame becomes readable. The delay is
  // applied to `token` frames alone: the `guardrail` event must reach the client immediately (T4),
  // and `message`/`done`/`error` must not be held back behind cosmetic pacing.
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller): Promise<void> {
      for (const frame of frames) {
        controller.enqueue(encoder.encode(encodeSseFrame(frame)));
        if (frame.event === 'token' && STREAM_PACING_MS > 0) {
          await delay(STREAM_PACING_MS);
        }
      }
      controller.close();
    },
  });

  const response = new NextResponse(stream, {
    status: 200,
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      // No-transform and no buffering: a proxy that buffers the stream is a broken demo, not a
      // broken route, and it is worth one header to say so.
      'cache-control': 'no-store, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    },
  });
  return withRequestId(response, requestId);
}

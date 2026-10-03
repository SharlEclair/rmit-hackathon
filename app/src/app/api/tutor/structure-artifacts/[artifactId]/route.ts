import { NextResponse, type NextRequest } from 'next/server';

import {
  apiError,
  resolveRequestId,
  withRequestId,
  type ApiErrorBody,
} from '@/lib/api/errors';
import type { ReviewArtifactResponse, ValidationWarningCode } from '@/lib/api/types';
import { guardTutorArtifact } from '@/lib/auth/guards';
import { withTransaction } from '@/lib/db/transaction';
import {
  applyTutorTransition,
  rejectWithoutPrecondition,
  type ActionOutcome,
} from '@/features/review/actions';
import { inferReviewArtifact } from '@/features/review/mappers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `PATCH /api/tutor/structure-artifacts/{artifactId}` (`06` section 5.4, 5.5.8).
 *
 * Edit, approve or reject **one** artifact, with the caller's `expectedRevision` as a precondition.
 * The failure codes are the contract's: `IMMUTABLE_FIELD`, `INVALID_STATE_TRANSITION`,
 * `STALE_REVISION`, `VALIDATION_FAILED` (`06` section 5.4).
 *
 * The route is an adapter. Every decision -- is the transition legal, which fields may change, may
 * this artifact be approved with these warnings, is the policy rule code mapped -- is made in
 * `src/features/review/actions.ts`, where the ordering is documented and testable. What lives here is
 * the request shape, the envelope, and the mapping from an outcome to a status code.
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ artifactId: string }> },
): Promise<NextResponse<ReviewArtifactResponse | ApiErrorBody>> {
  const requestId = resolveRequestId(request);
  const { artifactId } = await context.params;

  const guarded = await guardTutorArtifact(request, requestId, artifactId);
  if (!guarded.ok) return guarded.response;
  const { session, artifact } = guarded.value;

  const parsed = await readPatchBody(request);
  if (!parsed.ok) return apiError('VALIDATION_FAILED', parsed.message, requestId, parsed.details);

  const outcome = await withTransaction((tx) =>
    applyTutorTransition(tx, {
      artifact,
      action: parsed.body.action,
      expectedRevision: parsed.body.expectedRevision,
      payload: parsed.body.payload,
      acknowledgeWarnings: parsed.body.acknowledgeWarnings,
      actorUserId: session.userId,
      requestId,
    }),
  );

  if (!outcome.ok) return failure(outcome, requestId);
  return withRequestId(
    NextResponse.json(inferReviewArtifact(outcome.artifact), { status: 200 }),
    requestId,
  );
}

/**
 * `DELETE /api/tutor/structure-artifacts/{artifactId}` (`06` section 5.4): reject an artifact
 * (transition 9).
 *
 * Rule 9 retains the row -- `REJECTED` is a status, not a delete -- which is why this returns `204`
 * and why the row is still readable through the review bundle with its provenance (`06` section 3.7).
 * The failure codes are `NOT_FOUND` and `INVALID_STATE_TRANSITION`, so there is no revision
 * precondition: transition 9's guard column in `06` section 3.2 is `-`.
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ artifactId: string }> },
): Promise<NextResponse<null | ApiErrorBody>> {
  const requestId = resolveRequestId(request);
  const { artifactId } = await context.params;

  const guarded = await guardTutorArtifact(request, requestId, artifactId);
  if (!guarded.ok) return guarded.response;

  const outcome = await withTransaction((tx) =>
    rejectWithoutPrecondition(tx, {
      artifact: guarded.value.artifact,
      actorUserId: guarded.value.session.userId,
      requestId,
    }),
  );

  if (!outcome.ok) return failure(outcome, requestId);
  return withRequestId(new NextResponse(null, { status: 204 }), requestId);
}

function failure(
  outcome: Extract<ActionOutcome, { ok: false }>,
  requestId: string,
): NextResponse<ApiErrorBody> {
  // `06` section 5.3 fixes one status per code, and `apiError` owns that table, so the mapping here
  // is a code rather than a status number: a route that computed its own status would be a second
  // place the table lives.
  return apiError(outcome.code, outcome.message, requestId, outcome.details);
}

const ACTIONS = new Set(['save', 'approve', 'reject']);

/** The `06` section 5.5.8 request, validated before any decision is taken. */
async function readPatchBody(request: NextRequest): Promise<
  | {
      ok: true;
      body: {
        action: 'save' | 'approve' | 'reject';
        expectedRevision: number;
        payload: Record<string, unknown>;
        acknowledgeWarnings?: ValidationWarningCode[];
      };
    }
  | { ok: false; message: string; details?: Record<string, unknown> }
> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { ok: false, message: 'The request body was not valid JSON.' };
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, message: 'The request body must be a JSON object.' };
  }
  const body = raw as Record<string, unknown>;

  const action = body['action'];
  if (typeof action !== 'string' || !ACTIONS.has(action)) {
    return {
      ok: false,
      message: 'action must be one of save, approve or reject.',
      details: { fields: ['action'] },
    };
  }

  const expectedRevision = body['expectedRevision'];
  if (
    typeof expectedRevision !== 'number' ||
    !Number.isInteger(expectedRevision) ||
    expectedRevision < 0
  ) {
    return {
      ok: false,
      message: 'expectedRevision must be the integer revision you last read.',
      details: { fields: ['expectedRevision'] },
    };
  }

  const rawPayload = body['payload'];
  if (rawPayload !== undefined && (typeof rawPayload !== 'object' || rawPayload === null || Array.isArray(rawPayload))) {
    return {
      ok: false,
      message: 'payload must be an object.',
      details: { fields: ['payload'] },
    };
  }
  const payload = (rawPayload ?? {}) as Record<string, unknown>;

  const rawAck = body['acknowledgeWarnings'];
  let acknowledgeWarnings: ValidationWarningCode[] | undefined;
  if (rawAck !== undefined) {
    if (!Array.isArray(rawAck) || rawAck.some((entry) => typeof entry !== 'string')) {
      return {
        ok: false,
        message: 'acknowledgeWarnings must be a list of warning codes.',
        details: { fields: ['acknowledgeWarnings'] },
      };
    }
    acknowledgeWarnings = rawAck as ValidationWarningCode[];
  }

  return {
    ok: true,
    body: {
      action: action as 'save' | 'approve' | 'reject',
      expectedRevision,
      payload,
      ...(acknowledgeWarnings === undefined ? {} : { acknowledgeWarnings }),
    },
  };
}

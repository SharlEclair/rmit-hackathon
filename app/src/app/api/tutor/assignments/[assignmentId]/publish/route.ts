import { randomUUID } from 'node:crypto';

import { NextResponse, type NextRequest } from 'next/server';

import {
  PLATFORM_ERROR_MESSAGES,
  apiError,
  resolveRequestId,
  withRequestId,
  type ApiErrorBody,
} from '@/lib/api/errors';
import type { AssignmentResponse } from '@/lib/api/types';
import { guardTutorAssignment } from '@/lib/auth/guards';
import { withTransaction } from '@/lib/db/transaction';
import { publishApprovedArtifacts } from '@/lib/db/queries/review';
import { insertAuditLog } from '@/lib/db/queries/audit';
import { readAssignmentHeader } from '@/lib/db/queries/review';
import { computePublishOutcome } from '@/features/review/publish';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `POST /api/tutor/assignments/{assignmentId}/publish` (`06` section 5.4).
 *
 * Transition 7, and the **only** action anywhere in the product that makes content student-visible
 * (`06` section 3.1, 3.4; D21/D99). Three guards run before it:
 *
 *   1. the assignment must be `in_review` (transition 7's own guard);
 *   2. the publish blockers must be clear -- no approved policy rule, no milestone, a milestone
 *      without a requirement link, or an approved artifact carrying a warning (`06` section 5.5.8);
 *   3. there must be at least one `APPROVED` artifact, so publish cannot report success for an
 *      assignment where nothing was ever approved.
 *
 * A blocked publish is `INVALID_STATE_TRANSITION` (409) with the blockers in `details`, which is the
 * code the contract gives this route: the request is legal but the resource is not in a state that
 * permits it.
 *
 * `artifactIds` in the body gives the partial publish of `06` section 3.4; omitting it publishes
 * every approved artifact of the current structure.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ assignmentId: string }> },
): Promise<NextResponse<AssignmentResponse | ApiErrorBody>> {
  const requestId = resolveRequestId(request);
  const { assignmentId } = await context.params;

  const guarded = await guardTutorAssignment(request, requestId, assignmentId);
  if (!guarded.ok) return guarded.response;
  const { session } = guarded.value;

  const requested = await readPublishBody(request);
  if (!requested.ok) {
    return apiError('VALIDATION_FAILED', requested.message, requestId, requested.details);
  }

  const result = await withTransaction(async (tx) => {
    const header = await readAssignmentHeader(tx, assignmentId);
    if (header === null) return { kind: 'missing' as const };

    const outcome = await computePublishOutcome(tx, assignmentId, header);
    if (!outcome.ok) {
      return {
        kind: 'blocked' as const,
        blockers: outcome.blockers,
        reason: outcome.reason,
        status: header.status,
      };
    }

    const { moved } = await publishApprovedArtifacts(tx, {
      assignmentId,
      structureId: outcome.structureId,
      actorUserId: session.userId,
      ...(requested.artifactIds === undefined ? {} : { artifactIds: requested.artifactIds }),
    });

    await insertAuditLog(tx, {
      id: randomUUID(),
      actorUserId: session.userId,
      actorRole: 'tutor',
      action: 'assignment.published',
      targetTable: 'assignments',
      targetId: assignmentId,
      before: { status: header.status, publicationStatus: 'APPROVED' },
      after: { status: 'published', transition: 7, publishedArtifacts: moved },
      requestId,
    });

    const after = await readAssignmentHeader(tx, assignmentId);
    return { kind: 'published' as const, header: after };
  });

  if (result.kind === 'missing') {
    return apiError('NOT_FOUND', PLATFORM_ERROR_MESSAGES.notFound, requestId);
  }
  if (result.kind === 'blocked') {
    return apiError(
      'INVALID_STATE_TRANSITION',
      'This assignment cannot be published yet.',
      requestId,
      {
        blockers: result.blockers,
        ...(result.reason === null ? {} : { reason: result.reason }),
        status: result.status,
      },
    );
  }

  const header = result.header;
  if (header === null) {
    return apiError('INTERNAL', PLATFORM_ERROR_MESSAGES.internal, requestId);
  }
  const body: AssignmentResponse = {
    id: header.id,
    title: header.title,
    status: header.status,
    dueAt: header.dueAt,
    currentStructureId: header.currentStructureId,
  };
  return withRequestId(NextResponse.json(body, { status: 200 }), requestId);
}

/** `{ artifactIds?: string[] }`, or nothing at all for the default publish-everything. */
async function readPublishBody(
  request: NextRequest,
): Promise<
  | { ok: true; artifactIds: string[] | undefined }
  | { ok: false; message: string; details?: Record<string, unknown> }
> {
  const text = await request.text();
  if (text.trim() === '') return { ok: true, artifactIds: undefined };

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, message: 'The request body was not valid JSON.' };
  }
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, message: 'The request body must be a JSON object.' };
  }
  const artifactIds = (raw as Record<string, unknown>)['artifactIds'];
  if (artifactIds === undefined) return { ok: true, artifactIds: undefined };
  if (!Array.isArray(artifactIds) || artifactIds.some((entry) => typeof entry !== 'string')) {
    return {
      ok: false,
      message: 'artifactIds must be a list of artifact ids.',
      details: { fields: ['artifactIds'] },
    };
  }
  return { ok: true, artifactIds: artifactIds as string[] };
}

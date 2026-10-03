import { NextResponse, type NextRequest } from 'next/server';

import { PLATFORM_ERROR_MESSAGES, apiError, resolveRequestId, withRequestId, type ApiErrorBody } from '@/lib/api/errors';
import type { QueryMessageResponse } from '@/lib/api/types';
import { guardStudentVisibleAssignment } from '@/lib/auth/guards';
import type { Executor } from '@/lib/db/queries/courses';
import { findQueryScope } from '@/lib/db/queries/query-threads';
import { withTransaction } from '@/lib/db/transaction';
import { QUERY_BODY_MAX_CHARS, addStudentMessage, ownsQuery } from '@/features/queries/service';
import { queryViewerFor } from '@/features/queries/routes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `POST /api/student/queries/{queryId}/messages` (`06` section 5.4).
 *
 * The student's follow-up on their own thread. **A `closed` thread refuses it and a `resolved` one does
 * not reopen on a message** -- `07` section 5 gives the student an explicit `Reopen` control, and a
 * silent reopen would make the status a poor record of what happened. An `answered` thread does return
 * to `open`: a follow-up is a new question for the tutor, and `addStudentMessage` writes the status
 * change in the same statement as the message (trap **T7**).
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ queryId: string }> },
): Promise<NextResponse<QueryMessageResponse | ApiErrorBody>> {
  const requestId = resolveRequestId(request);
  const { queryId } = await context.params;

  const located = await withTransaction((tx) => findQueryScope(tx, queryId));
  if (located === null) {
    return apiError('NOT_FOUND', PLATFORM_ERROR_MESSAGES.notFound, requestId);
  }

  const guarded = await guardStudentVisibleAssignment(request, requestId, located.assignmentId);
  if (!guarded.ok) return guarded.response;

  const parsed = await readBody(request);
  if (!parsed.ok) return apiError('VALIDATION_FAILED', parsed.message, requestId, parsed.details);

  const viewer = queryViewerFor(guarded.value.session);
  if (viewer === null) return apiError('INTERNAL', PLATFORM_ERROR_MESSAGES.internal, requestId);

  const outcome = await withTransaction(async (tx: Executor) => {
    if (!(await ownsQuery(tx, queryId, viewer))) return null;
    return addStudentMessage(tx, {
      queryId,
      assignmentId: located.assignmentId,
      viewer,
      body: parsed.body,
      now: new Date(),
    });
  });
  if (outcome === null) return apiError('NOT_FOUND', PLATFORM_ERROR_MESSAGES.notFound, requestId);
  if (!outcome.ok) return apiError(outcome.code, outcome.message, requestId);

  return withRequestId(NextResponse.json(outcome.value, { status: 201 }), requestId);
}

type ParsedBody =
  | { readonly ok: true; readonly body: string }
  | { readonly ok: false; readonly message: string; readonly details?: Record<string, unknown> };

async function readBody(request: NextRequest): Promise<ParsedBody> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { ok: false, message: 'The request body was not valid JSON.' };
  }
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, message: 'The request body was not valid.' };
  }
  const body = (raw as Record<string, unknown>)['body'];
  if (typeof body !== 'string' || body.trim().length === 0) {
    return { ok: false, message: 'Your message is required.', details: { fields: ['body'] } };
  }
  if (body.length > QUERY_BODY_MAX_CHARS) {
    return {
      ok: false,
      message: `Your message must be at most ${String(QUERY_BODY_MAX_CHARS)} characters.`,
      details: { fields: ['body'] },
    };
  }
  return { ok: true, body };
}

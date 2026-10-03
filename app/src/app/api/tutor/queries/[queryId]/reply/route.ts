import { NextResponse, type NextRequest } from 'next/server';

import { PLATFORM_ERROR_MESSAGES, apiError, resolveRequestId, withRequestId, type ApiErrorBody } from '@/lib/api/errors';
import type { QueryMessageResponse } from '@/lib/api/types';
import { guardTutorAssignment } from '@/lib/auth/guards';
import { findQueryScope } from '@/lib/db/queries/query-threads';
import { withTransaction } from '@/lib/db/transaction';
import { QUERY_BODY_MAX_CHARS, addTutorReply } from '@/features/queries/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `POST /api/tutor/queries/{queryId}/reply` (`06` section 5.4, 5.5.12).
 *
 * The tutor's private reply to the asking student (D24). **The reply is what moves the thread to
 * `answered`**, in the same transaction and via the same statement that inserts the message, so the
 * status is never a second write that can be lost. A `resolved` thread stays resolved: a tutor adding
 * context does not un-answer the student's own conclusion, and `07` section 5.4 gives the control to the
 * asker for that reason.
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

  const guarded = await guardTutorAssignment(request, requestId, located.assignmentId);
  if (!guarded.ok) return guarded.response;

  const parsed = await readBody(request);
  if (!parsed.ok) return apiError('VALIDATION_FAILED', parsed.message, requestId, parsed.details);

  const outcome = await withTransaction((tx) =>
    addTutorReply(tx, {
      queryId,
      assignmentId: located.assignmentId,
      tutorUserId: guarded.value.session.userId,
      body: parsed.body,
      now: new Date(),
    }),
  );
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
    return { ok: false, message: 'A reply is required.', details: { fields: ['body'] } };
  }
  if (body.length > QUERY_BODY_MAX_CHARS) {
    return {
      ok: false,
      message: `A reply must be at most ${String(QUERY_BODY_MAX_CHARS)} characters.`,
      details: { fields: ['body'] },
    };
  }
  return { ok: true, body };
}

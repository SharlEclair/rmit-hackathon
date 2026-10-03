import { NextResponse, type NextRequest } from 'next/server';

import { PLATFORM_ERROR_MESSAGES, apiError, resolveRequestId, withRequestId, type ApiErrorBody } from '@/lib/api/errors';
import type { QueryListResponse, QueryThreadResponse } from '@/lib/api/types';
import { guardStudentVisibleAssignment } from '@/lib/auth/guards';
import { withTransaction } from '@/lib/db/transaction';
import { QUERY_SUBJECT_MAX_CHARS, buildStudentQueryList, openQuery } from '@/features/queries/service';
import { queryViewerFor } from '@/features/queries/routes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `GET /api/student/assignments/{assignmentId}/queries` (`06` section 5.4, 5.5.12).
 *
 * The student's own threads in this assignment, newest activity first. **Scoped by `student_id` in the
 * SQL** ("No endpoint accepts a student id from the client", `06` section 5.2 rule 4), so the list
 * cannot be widened by a query parameter.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ assignmentId: string }> },
): Promise<NextResponse<QueryListResponse | ApiErrorBody>> {
  const requestId = resolveRequestId(request);
  const { assignmentId } = await context.params;

  const guarded = await guardStudentVisibleAssignment(request, requestId, assignmentId);
  if (!guarded.ok) return guarded.response;

  const viewer = queryViewerFor(guarded.value.session);
  if (viewer === null) return apiError('INTERNAL', PLATFORM_ERROR_MESSAGES.internal, requestId);

  const list = await withTransaction((tx) =>
    buildStudentQueryList(tx, guarded.value.scope.assignmentId, viewer),
  );
  return withRequestId(NextResponse.json(list, { status: 200 }), requestId);
}

/**
 * `POST /api/student/assignments/{assignmentId}/queries` (`06` section 5.4).
 *
 * Opens a private thread. **The first message is required and the subject is not**, per `06` section
 * 5.5.12's `subject: string | null`. The thread's `status` starts `open`; a tutor's reply is what makes
 * it `answered`, so no separate action is needed for that edge.
 *
 * The `query_created` analytics event is written by `createQuery` in the same transaction (trap **T7**),
 * which is why this route needs the config secret rather than only the session.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ assignmentId: string }> },
): Promise<NextResponse<QueryThreadResponse | ApiErrorBody>> {
  const requestId = resolveRequestId(request);
  const { assignmentId } = await context.params;

  const guarded = await guardStudentVisibleAssignment(request, requestId, assignmentId);
  if (!guarded.ok) return guarded.response;

  const parsed = await readBody(request);
  if (!parsed.ok) return apiError('VALIDATION_FAILED', parsed.message, requestId, parsed.details);

  const viewer = queryViewerFor(guarded.value.session);
  if (viewer === null) return apiError('INTERNAL', PLATFORM_ERROR_MESSAGES.internal, requestId);

  const outcome = await withTransaction((tx) =>
    openQuery(tx, {
      assignmentId: guarded.value.scope.assignmentId,
      viewer,
      subject: parsed.subject,
      body: parsed.body,
      milestoneId: parsed.milestoneId,
      now: new Date(),
    }),
  );
  if (!outcome.ok) return apiError(outcome.code, outcome.message, requestId);

  return withRequestId(NextResponse.json(outcome.value, { status: 201 }), requestId);
}

type ParsedBody =
  | {
      readonly ok: true;
      readonly subject: string | null;
      readonly body: string;
      readonly milestoneId: string | null;
    }
  | { readonly ok: false; readonly message: string; readonly details?: Record<string, unknown> };

/** `{ body, subject?, milestoneId? }`. */
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
  const record = raw as Record<string, unknown>;

  const body = record['body'];
  if (typeof body !== 'string' || body.trim().length === 0) {
    return { ok: false, message: 'Your question is required.', details: { fields: ['body'] } };
  }

  const subject = record['subject'];
  if (subject !== undefined && subject !== null && typeof subject !== 'string') {
    return { ok: false, message: 'subject must be a string or null.', details: { fields: ['subject'] } };
  }
  if (typeof subject === 'string' && subject.length > QUERY_SUBJECT_MAX_CHARS) {
    return {
      ok: false,
      message: `A subject must be at most ${String(QUERY_SUBJECT_MAX_CHARS)} characters.`,
      details: { fields: ['subject'] },
    };
  }

  const milestoneId = record['milestoneId'];
  if (milestoneId !== undefined && milestoneId !== null && typeof milestoneId !== 'string') {
    return {
      ok: false,
      message: 'milestoneId must be a string or null.',
      details: { fields: ['milestoneId'] },
    };
  }

  return {
    ok: true,
    subject: typeof subject === 'string' ? subject : null,
    body,
    milestoneId: typeof milestoneId === 'string' ? milestoneId : null,
  };
}

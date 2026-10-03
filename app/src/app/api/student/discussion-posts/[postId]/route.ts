import { NextResponse, type NextRequest } from 'next/server';

import { PLATFORM_ERROR_MESSAGES, apiError, resolveRequestId, withRequestId, type ApiErrorBody } from '@/lib/api/errors';
import type { DiscussionPostResponse } from '@/lib/api/types';
import { guardStudentVisibleAssignment } from '@/lib/auth/guards';
import { withTransaction } from '@/lib/db/transaction';
import { findPost } from '@/lib/db/queries/discussions';
import { deletePost, editPost } from '@/features/discussion/service';
import { viewerFor } from '@/features/discussion/routes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `PATCH /api/student/discussion-posts/{postId}` (`06` section 5.4).
 *
 * **A student may edit only their own post, and another student's post is `NOT_FOUND` rather than
 * `FORBIDDEN_ROLE`.** `07` section 9.3's row is explicit: "Student tries to edit another's post | No
 * `Edit` control; a direct PATCH fails | `NOT_FOUND`". `06` section 9.2's T-12 asserts the same, and
 * `06` section 5.2 rule 3 scopes `FORBIDDEN_ROLE` to a wrong *role*, which a student editing a peer's
 * post is not. The service makes the comparison by anonymous identity, with the named-post case falling
 * back to `author_user_id` -- neither id ever reaches the response (A-ID-7).
 *
 * **The BODY is the only editable field.** `07` section 6.2 rule 5: "An edited post shows `Edited
 * <time>`". A client sending anything else -- a status, an author, a parent -- has it ignored rather
 * than refused, because the contract has no editable field by those names and refusing would invent an
 * error the docs do not define. (`06` section 5.3's `IMMUTABLE_FIELD` is for the T1 verbatim fields and
 * a sent `query_messages` body, not for a post's own text.)
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ postId: string }> },
): Promise<NextResponse<DiscussionPostResponse | ApiErrorBody>> {
  const requestId = resolveRequestId(request);
  const { postId } = await context.params;

  const located = await withTransaction((tx) => findPost(tx, postId));
  if (located === null || located.deletedAt !== null) {
    return apiError('NOT_FOUND', PLATFORM_ERROR_MESSAGES.notFound, requestId);
  }

  const guarded = await guardStudentVisibleAssignment(request, requestId, located.assignmentId);
  if (!guarded.ok) return guarded.response;

  const parsed = await readBody(request);
  if (!parsed.ok) return apiError('VALIDATION_FAILED', parsed.message, requestId, parsed.details);

  const viewer = viewerFor(guarded.value, 'student');
  if (viewer === null) return apiError('INTERNAL', PLATFORM_ERROR_MESSAGES.internal, requestId);

  const outcome = await withTransaction((tx) =>
    editPost(tx, { viewer, postId, body: parsed.body, now: new Date() }),
  );
  if (!outcome.ok) return apiError(outcome.code, outcome.message, requestId);

  return withRequestId(NextResponse.json(outcome.value, { status: 200 }), requestId);
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
    return { ok: false, message: 'A post body is required.', details: { fields: ['body'] } };
  }
  return { ok: true, body };
}

/**
 * `DELETE /api/student/discussion-posts/{postId}` (`06` section 5.4) -- the author's own soft delete.
 *
 * **Soft, not hard, and the reason is D28 plus the audit trail.** `07` section 6.4's table says a post
 * deleted by its author is "Absent from the thread / Absent from the thread; retained in the audit
 * record", so the row survives with `deleted_at` set and the thread's `post_count` is decremented
 * (reading A10 counts only `deleted_at is null`). A hard delete would take the moderation flag's
 * `target_id` with it and break the polymorphic FK the query layer enforces (test T-13).
 *
 * `204` with no body, per the contract, and the same ownership rule as the PATCH -- another student's
 * post is `NOT_FOUND`.
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ postId: string }> },
): Promise<NextResponse<null | ApiErrorBody>> {
  const requestId = resolveRequestId(request);
  const { postId } = await context.params;

  const located = await withTransaction((tx) => findPost(tx, postId));
  if (located === null || located.deletedAt !== null) {
    return apiError('NOT_FOUND', PLATFORM_ERROR_MESSAGES.notFound, requestId);
  }

  const guarded = await guardStudentVisibleAssignment(request, requestId, located.assignmentId);
  if (!guarded.ok) return guarded.response;

  const viewer = viewerFor(guarded.value, 'student');
  if (viewer === null) return apiError('INTERNAL', PLATFORM_ERROR_MESSAGES.internal, requestId);

  const outcome = await withTransaction((tx) =>
    deletePost(tx, { viewer, postId, now: new Date() }),
  );
  if (!outcome.ok) return apiError(outcome.code, outcome.message, requestId);

  return withRequestId(new NextResponse(null, { status: 204 }), requestId);
}

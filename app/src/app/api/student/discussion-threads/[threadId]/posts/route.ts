import { NextResponse, type NextRequest } from 'next/server';

import { PLATFORM_ERROR_MESSAGES, apiError, resolveRequestId, withRequestId, type ApiErrorBody } from '@/lib/api/errors';
import type { DiscussionPostResponse } from '@/lib/api/types';
import { guardStudentVisibleAssignment } from '@/lib/auth/guards';
import { withTransaction } from '@/lib/db/transaction';
import { findThread } from '@/lib/db/queries/discussions';
import { createPost } from '@/features/discussion/service';
import { viewerFor } from '@/features/discussion/routes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `POST /api/student/discussion-threads/{threadId}/posts` (`06` section 5.4).
 *
 * **Order: find the thread, gate on its own assignment, then write.** The path addresses the thread, so
 * trusting an assignment id from the client would let a student pair their own assignment with a foreign
 * thread id -- the defect `guardTutorArtifact` exists to prevent on the tutor side, and the reason
 * Phase 5's checklist transitions read the item's own assignment first. A thread that does not exist is
 * `NOT_FOUND` before any gate runs, so a probe cannot distinguish "absent" from "not yours".
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ threadId: string }> },
): Promise<NextResponse<DiscussionPostResponse | ApiErrorBody>> {
  const requestId = resolveRequestId(request);
  const { threadId } = await context.params;

  const located = await withTransaction((tx) => findThread(tx, threadId));
  if (located === null) {
    return apiError('NOT_FOUND', PLATFORM_ERROR_MESSAGES.notFound, requestId);
  }

  const guarded = await guardStudentVisibleAssignment(request, requestId, located.assignmentId);
  if (!guarded.ok) return guarded.response;

  const parsed = await readBody(request);
  if (!parsed.ok) return apiError('VALIDATION_FAILED', parsed.message, requestId, parsed.details);

  const viewer = viewerFor(guarded.value, 'student');
  if (viewer === null) return apiError('INTERNAL', PLATFORM_ERROR_MESSAGES.internal, requestId);

  const outcome = await withTransaction((tx) =>
    createPost(tx, {
      scope: guarded.value.scope,
      viewer,
      threadId,
      body: parsed.body,
      parentPostId: parsed.parentPostId,
      now: new Date(),
    }),
  );
  if (!outcome.ok) return apiError(outcome.code, outcome.message, requestId);

  return withRequestId(NextResponse.json(outcome.value, { status: 201 }), requestId);
}

type ParsedBody =
  | { readonly ok: true; readonly body: string; readonly parentPostId: string | null }
  | { readonly ok: false; readonly message: string; readonly details?: Record<string, unknown> };

/**
 * `{ body, parentPostId? }`.
 *
 * `07` section 6.2 rule 1 makes nesting **one level deep**: "Replies to replies render flat, in time
 * order, with the parent quoted in one line." The schema has no constraint for that (the self-parent ban
 * is the only one), so the rule is enforced in the service when it builds the response tree -- this
 * route accepts whichever parent the client names and the read decides where it renders.
 */
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
    return { ok: false, message: 'A post body is required.', details: { fields: ['body'] } };
  }

  const parentPostId = record['parentPostId'];
  if (parentPostId !== undefined && parentPostId !== null && typeof parentPostId !== 'string') {
    return {
      ok: false,
      message: 'parentPostId must be a string or null.',
      details: { fields: ['parentPostId'] },
    };
  }

  return { ok: true, body, parentPostId: typeof parentPostId === 'string' ? parentPostId : null };
}

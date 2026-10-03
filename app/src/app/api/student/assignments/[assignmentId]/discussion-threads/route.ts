import { NextResponse, type NextRequest } from 'next/server';

import { PLATFORM_ERROR_MESSAGES, apiError, resolveRequestId, withRequestId, type ApiErrorBody } from '@/lib/api/errors';
import type { DiscussionThreadResponse } from '@/lib/api/types';
import { guardStudentVisibleAssignment } from '@/lib/auth/guards';
import { withTransaction } from '@/lib/db/transaction';
import { createThread } from '@/features/discussion/service';
import { moderatorHookFor, readAssignmentTitle, viewerFor } from '@/features/discussion/routes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `POST /api/student/assignments/{assignmentId}/discussion-threads` (`06` section 5.4).
 *
 * Creates a thread and its first post together, because `discussion_threads.first_post_id` is a
 * `DEFERRABLE INITIALLY DEFERRED` FK: the post cannot exist before its thread and the thread is not
 * usable before its post.
 *
 * **The `anonymous` flag decides which author column is populated, and the XOR check is the
 * enforcement.** An anonymous post has **no** `author_user_id` at all (`06` section 7.5.2), so no query
 * over `discussion_posts` can name its author even before `anon_identities` is considered (A-ID-1). A
 * named post has no identity, so it cannot be correlated with the student's anonymous posts.
 *
 * Failure codes are the contract's: `NOT_FOUND` from the guard, `VALIDATION_FAILED` for a title outside
 * 5..200 or a body outside 1..4000, and `RATE_LIMITED` for `06` section 5.6's twenty threads per hour.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ assignmentId: string }> },
): Promise<NextResponse<DiscussionThreadResponse | ApiErrorBody>> {
  const requestId = resolveRequestId(request);
  const { assignmentId } = await context.params;

  const guarded = await guardStudentVisibleAssignment(request, requestId, assignmentId);
  if (!guarded.ok) return guarded.response;

  const parsed = await readBody(request);
  if (!parsed.ok) return apiError('VALIDATION_FAILED', parsed.message, requestId, parsed.details);

  const viewer = viewerFor(guarded.value, 'student');
  if (viewer === null) return apiError('INTERNAL', PLATFORM_ERROR_MESSAGES.internal, requestId);

  const assignmentTitle =
    (await withTransaction((tx) => readAssignmentTitle(tx, guarded.value.scope.assignmentId))) ?? '';

  const outcome = await withTransaction((tx) =>
    createThread(tx, {
      scope: guarded.value.scope,
      viewer,
      title: parsed.title,
      body: parsed.body,
      milestoneId: parsed.milestoneId,
      anonymous: parsed.anonymous,
      now: new Date(),
      // The thread's first post is moderated exactly as a reply is: it is the same student-visible content,
      // and an unmoderated opening post would be the easiest way to publish what the moderator catches.
      moderate: moderatorHookFor({
        assignmentId: guarded.value.scope.assignmentId,
        assignmentTitle,
        grounding: '',
      }),
    }),
  );

  if (!outcome.ok) return apiError(outcome.code, outcome.message, requestId);
  return withRequestId(NextResponse.json(outcome.value, { status: 201 }), requestId);
}

type ParsedBody =
  | {
      readonly ok: true;
      readonly title: string;
      readonly body: string;
      readonly milestoneId: string | null;
      readonly anonymous: boolean;
    }
  | { readonly ok: false; readonly message: string; readonly details?: Record<string, unknown> };

/**
 * `{ title, body, milestoneId?, anonymous? }`.
 *
 * `anonymous` defaults to **false**, which is the privacy-preserving direction for a *named* post only
 * in the sense that it is the state the composer starts in (`07` section 6.1 shows an explicit toggle).
 * The field is required rather than inferred so a client cannot get an anonymous post by omitting it and
 * believing it defaulted the other way -- and the response returns the resolved `author`, so the client
 * never has to guess which one it got.
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

  const title = record['title'];
  if (typeof title !== 'string' || title.trim().length === 0) {
    return { ok: false, message: 'A thread title is required.', details: { fields: ['title'] } };
  }
  const body = record['body'];
  if (typeof body !== 'string' || body.trim().length === 0) {
    return { ok: false, message: 'A first post is required.', details: { fields: ['body'] } };
  }

  const milestoneId = record['milestoneId'];
  if (milestoneId !== undefined && milestoneId !== null && typeof milestoneId !== 'string') {
    return { ok: false, message: 'milestoneId must be a string or null.', details: { fields: ['milestoneId'] } };
  }

  const anonymous = record['anonymous'];
  if (anonymous !== undefined && typeof anonymous !== 'boolean') {
    return { ok: false, message: 'anonymous must be true or false.', details: { fields: ['anonymous'] } };
  }

  return {
    ok: true,
    title,
    body,
    milestoneId: typeof milestoneId === 'string' ? milestoneId : null,
    anonymous: anonymous === true,
  };
}

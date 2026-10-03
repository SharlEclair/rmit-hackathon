import { NextResponse, type NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';

import { PLATFORM_ERROR_MESSAGES, apiError, resolveRequestId, withRequestId, type ApiErrorBody } from '@/lib/api/errors';
import type { DiscussionPostResponse } from '@/lib/api/types';
import { guardTutorAssignment } from '@/lib/auth/guards';
import { insertAuditLog } from '@/lib/db/queries/audit';
import { withTransaction } from '@/lib/db/transaction';
import { findPost, setAcceptedAnswerStatus } from '@/lib/db/queries/discussions';
import { buildPostResponse } from '@/features/discussion/service';
import { findIdentityFor } from '@/features/discussion/anon-identity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DECISIONS = ['approve', 'reject'] as const;
type Decision = (typeof DECISIONS)[number];

/**
 * `POST /api/tutor/discussion-posts/{postId}/answer-review` (`06` section 5.4, `07` section 6.2 rule 7).
 *
 * **This is the tutor's decision on a peer answer, and it is the step that makes promotion possible.**
 * O8 and D29: approval is a prerequisite for promotion and is never itself a promotion -- "Promotion to
 * the official FAQ **MUST** be a separate, explicit tutor action available only after the answer is
 * approved. There is **no** automatic promotion path" (`03-PRD` FR-PEER-6). So this route moves
 * `acceptedAnswerStatus` and writes nothing to `faq_entries`; `/promote-to-faq` is a second, deliberate
 * request, and it refuses an unapproved answer.
 *
 * **`answer_approved_by_user_id` is the tutor's own id**, which
 * `ck_discussion_posts_answer_approved` requires whenever the status is `approved`. It is a **tutor** id
 * and never a student's, so it does not put an author identity on a discourse row (A-ID-1).
 *
 * `rejected` clears both the approver and the timestamp, because the CHECK only constrains the
 * `approved` case and a stale approver on a rejected row would read as a decision nobody made.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ postId: string }> },
): Promise<NextResponse<DiscussionPostResponse | ApiErrorBody>> {
  const requestId = resolveRequestId(request);
  const { postId } = await context.params;

  const located = await withTransaction((tx) => findPost(tx, postId));
  if (located === null) {
    return apiError('NOT_FOUND', PLATFORM_ERROR_MESSAGES.notFound, requestId);
  }

  const guarded = await guardTutorAssignment(request, requestId, located.assignmentId);
  if (!guarded.ok) return guarded.response;

  const parsed = await readBody(request);
  if (!parsed.ok) return apiError('VALIDATION_FAILED', parsed.message, requestId, parsed.details);

  // A removed post has no answer to review: `07` section 6.4's tombstone has no body, so approving it
  // would approve nothing. A hidden one is still reviewable -- the queue's whole purpose is to decide.
  if (located.status === 'removed' || located.deletedAt !== null) {
    return apiError(
      'INVALID_STATE_TRANSITION',
      'A removed post has no answer to review.',
      requestId,
    );
  }

  const now = new Date();
  const status = parsed.decision === 'approve' ? 'approved' : 'rejected';

  const changed = await withTransaction(async (tx) => {
    const updated = await setAcceptedAnswerStatus(tx, {
      postId,
      status,
      tutorUserId: guarded.value.session.userId,
      now,
    });
    if (!updated) return false;
    await insertAuditLog(tx, {
      id: randomUUID(),
      actorUserId: guarded.value.session.userId,
      actorRole: 'tutor',
      action: `discussion_post.answer_${parsed.decision}`,
      targetTable: 'discussion_posts',
      targetId: postId,
      // The decision, and no post body (`06` section 7.6.5 forbids it in this table).
      before: { acceptedAnswerStatus: located.acceptedAnswerStatus },
      after: { acceptedAnswerStatus: status },
      requestId,
    });
    return true;
  });

  if (!changed) {
    return apiError('INVALID_STATE_TRANSITION', 'This post is no longer available.', requestId);
  }

  const after = await withTransaction((tx) => findPost(tx, postId));
  if (after === null) {
    return apiError('NOT_FOUND', PLATFORM_ERROR_MESSAGES.notFound, requestId);
  }
  const identity = await withTransaction((tx) =>
    findIdentityFor(tx, guarded.value.session.userId, located.assignmentId),
  );
  return withRequestId(
    NextResponse.json(
      buildPostResponse(after, { viewerIdentityId: identity?.id ?? null, isTutor: true }),
      { status: 200 },
    ),
    requestId,
  );
}

type ParsedBody =
  | { readonly ok: true; readonly decision: Decision }
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
  const decision = (raw as Record<string, unknown>)['decision'];
  if (typeof decision !== 'string' || !DECISIONS.includes(decision as Decision)) {
    return {
      ok: false,
      message: 'A decision is required.',
      details: { fields: ['decision'], allowed: [...DECISIONS] },
    };
  }
  return { ok: true, decision: decision as Decision };
}

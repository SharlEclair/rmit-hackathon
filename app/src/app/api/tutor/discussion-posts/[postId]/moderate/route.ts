import { NextResponse, type NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';

import { PLATFORM_ERROR_MESSAGES, apiError, resolveRequestId, withRequestId, type ApiErrorBody } from '@/lib/api/errors';
import type { DiscussionPostResponse } from '@/lib/api/types';
import { guardTutorAssignment } from '@/lib/auth/guards';
import { insertAuditLog } from '@/lib/db/queries/audit';
import { withTransaction } from '@/lib/db/transaction';
import { findPost, setPostStatus } from '@/lib/db/queries/discussions';
import { buildPostResponse } from '@/features/discussion/service';
import { findIdentityFor } from '@/features/discussion/anon-identity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** `07` section 6.4's tutor actions. "remove" is a tutor action, and nothing else reaches it. */
const ACTIONS = ['approve', 'hide_pending_review', 'remove'] as const;
type ModerationAction = (typeof ACTIONS)[number];

const STATUS_BY_ACTION: Readonly<Record<ModerationAction, string>> = {
  approve: 'visible',
  hide_pending_review: 'hidden_pending_review',
  remove: 'removed',
};

/**
 * `POST /api/tutor/discussion-posts/{postId}/moderate` (`06` section 5.4, `07` section 6.4).
 *
 * **The Discussion Moderator flags and never removes; a tutor is the only actor who removes** (D28,
 * `05` section 9.1.1). That is why this route exists and why its action set is exactly the three states
 * the schema allows: `approve` returns a hidden post to `visible`, `hide_pending_review` is the
 * reversible review-pending state, and `remove` is the one irreversible-in-the-UI action -- retained in
 * the row as a tombstone rather than deleted (`07` section 6.2 rule 6).
 *
 * **A tutor never edits.** `07` section 6.2 rule 8: "A tutor viewing a thread never sees `Edit` on a
 * student post: tutors hide or remove." So this writes `status` and nothing else, which is what keeps
 * `editedByModerator` a `false` in the response rather than a claim the data cannot support.
 *
 * **The audit row is written by the caller's contract, not here.** `06` section 3.5 rule 4 requires "every
 * mutating tutor action" to write an `audit_logs` row; Phase 4 established that duty at the transition
 * layer, and this route is the one place a moderation action can be recorded -- it does so below, in the
 * same transaction as the status change.
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

  const now = new Date();
  const status = STATUS_BY_ACTION[parsed.action];

  const changed = await withTransaction(async (tx) => {
    const updated = await setPostStatus(tx, { postId, status, now });
    if (!updated) return false;
    // `06` section 3.5 rule 4: every mutating tutor action writes an audit row. The payload carries the
    // two statuses and **no body**: `06` section 7.6.5 forbids `discussion_posts.body` in this table
    // without exception, and the redaction duty is the writer's because a CHECK cannot inspect JSON
    // (reading A12).
    await insertAuditLog(tx, {
      id: randomUUID(),
      actorUserId: guarded.value.session.userId,
      actorRole: 'tutor',
      action: `discussion_post.${parsed.action}`,
      targetTable: 'discussion_posts',
      targetId: postId,
      before: { status: located.status },
      after: { status },
      requestId,
    });
    return true;
  });

  if (!changed) {
    // `setPostStatus` filters on `deleted_at is null` and the row exists, so this is unreachable in
    // practice. A state error is the honest answer if it ever fires: the post is gone.
    return apiError('INVALID_STATE_TRANSITION', 'This post is no longer available.', requestId);
  }

  const after = await withTransaction((tx) => findPost(tx, postId));
  if (after === null) {
    return apiError('NOT_FOUND', PLATFORM_ERROR_MESSAGES.notFound, requestId);
  }

  // The response is built for a **tutor** viewer, so a `removed` post loses its body here just as it
  // does for a student (`07` section 6.2 rule 6's tombstone) while a `hidden_pending_review` one keeps
  // it -- the queue needs the body it is asking a tutor to judge.
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
  | { readonly ok: true; readonly action: ModerationAction }
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
  const action = (raw as Record<string, unknown>)['action'];
  if (typeof action !== 'string' || !ACTIONS.includes(action as ModerationAction)) {
    return {
      ok: false,
      message: 'A moderation action is required.',
      details: { fields: ['action'], allowed: [...ACTIONS] },
    };
  }
  return { ok: true, action: action as ModerationAction };
}

import { NextResponse, type NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';

import { PLATFORM_ERROR_MESSAGES, apiError, resolveRequestId, withRequestId, type ApiErrorBody } from '@/lib/api/errors';
import type { FaqEntryResponse } from '@/lib/api/types';
import { guardTutorAssignment } from '@/lib/auth/guards';
import { insertAuditLog } from '@/lib/db/queries/audit';
import { withTransaction } from '@/lib/db/transaction';
import { findPost, findThread } from '@/lib/db/queries/discussions';
import { promoteToFaq } from '@/features/discussion/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `POST /api/tutor/discussion-posts/{postId}/promote-to-faq` (`06` section 5.4, `07` section 6.2 rule 7).
 *
 * **This route exists precisely because O8 forbids the automatic version.** `06` section 7.4.4: "only a
 * tutor can create or publish an entry (D24). `source_kind = 'peer_answer'` requires
 * `source_discussion_post_id` and is only reachable through the explicit promotion action (D29, O8).
 * **There is no automatic promotion path in the API.**" `03-PRD` FR-PEER-6 states the negative form.
 *
 * The route is an adapter: the two guards that matter -- the answer must be approved, and the post must
 * be a reply rather than the thread's question -- are in `promoteToFaq`, where they are testable without
 * a request, and `ck_faq_entries_peer_answer_source` refuses an unlinked peer answer even if they were
 * removed. What lives here is the envelope, the audit row and the response shape.
 *
 * **The entry is created `PUBLISHED` and T2**, per FR-PEER-7: "A promoted answer **must** become a FAQ
 * entry at T2 with the tutor recorded as publisher, and the entry **must** show 'Published by your
 * tutor'."
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ postId: string }> },
): Promise<NextResponse<FaqEntryResponse | ApiErrorBody>> {
  const requestId = resolveRequestId(request);
  const { postId } = await context.params;

  const located = await withTransaction((tx) => findPost(tx, postId));
  if (located === null || located.deletedAt !== null) {
    return apiError('NOT_FOUND', PLATFORM_ERROR_MESSAGES.notFound, requestId);
  }

  const guarded = await guardTutorAssignment(request, requestId, located.assignmentId);
  if (!guarded.ok) return guarded.response;

  const now = new Date();
  const outcome = await withTransaction((tx) =>
    promoteToFaq(tx, {
      postId,
      tutorUserId: guarded.value.session.userId,
      now,
    }),
  );
  if (!outcome.ok) return apiError(outcome.code, outcome.message, requestId);

  const thread = await withTransaction((tx) => findThread(tx, located.threadId));

  await withTransaction((tx) =>
    insertAuditLog(tx, {
      id: randomUUID(),
      actorUserId: guarded.value.session.userId,
      actorRole: 'tutor',
      action: 'faq_entry.promoted',
      targetTable: 'faq_entries',
      targetId: outcome.value.faqEntryId,
      // The provenance link and the fact of promotion. **No post body**: `06` section 7.6.5 forbids
      // `discussion_posts.body` in this table, and the entry already holds the text.
      before: null,
      after: { sourceKind: 'peer_answer', sourceDiscussionPostId: postId },
      requestId,
    }),
  );

  const body: FaqEntryResponse = {
    id: outcome.value.faqEntryId,
    assignmentId: located.assignmentId,
    milestoneId: thread?.milestoneId ?? null,
    question: thread?.title ?? '',
    answer: located.body,
    sourceKind: 'peer_answer',
    publicationStatus: 'PUBLISHED',
    isPublished: true,
    displayOrder: outcome.value.displayOrder,
    createdAt: now.toISOString(),
    publishedAt: now.toISOString(),
    revision: 1,
  };
  return withRequestId(NextResponse.json(body, { status: 201 }), requestId);
}

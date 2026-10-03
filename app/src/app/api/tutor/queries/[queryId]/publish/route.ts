import { NextResponse, type NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';

import { PLATFORM_ERROR_MESSAGES, apiError, resolveRequestId, withRequestId, type ApiErrorBody } from '@/lib/api/errors';
import type { FaqEntryResponse } from '@/lib/api/types';
import { guardTutorAssignment } from '@/lib/auth/guards';
import { insertAuditLog } from '@/lib/db/queries/audit';
import { findQueryScope } from '@/lib/db/queries/query-threads';
import { withTransaction } from '@/lib/db/transaction';
import { publishReplyAsFaq } from '@/features/queries/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `POST /api/tutor/queries/{queryId}/publish` (`06` section 5.4, `07` section 5.4, D24, O8).
 *
 * **Publishing is an explicit tutor action and never a consequence of replying.** `07` section 5.4:
 * "Publishing a reply as a FAQ entry is an explicit tutor action", and O8 requires that no automatic path
 * exists. `addTutorReply` therefore writes only a message and a status, and this route is the separate
 * request that creates the entry.
 *
 * **The entry is T2 and the student sees it as soon as this returns.** `06` section 5.5.13's
 * `officialFaq` is read through the published-only path, so the promoted answer appears in every
 * student's Discussions tab without a second publication step -- which is what "publish to the FAQ"
 * means, and why `07` section 5.4 gives the tutor a visible confirmation rather than a queue.
 *
 * **The body must be a tutor's own reply.** The service refuses a student-authored message: their words
 * becoming the cohort's canonical answer would put unapproved student text in front of everyone, which is
 * the C3 shape of failure even though the text is not AI output.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ queryId: string }> },
): Promise<NextResponse<FaqEntryResponse | ApiErrorBody>> {
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

  const now = new Date();
  const outcome = await withTransaction((tx) =>
    publishReplyAsFaq(tx, {
      queryId,
      messageId: parsed.messageId,
      tutorUserId: guarded.value.session.userId,
      now,
    }),
  );
  if (!outcome.ok) return apiError(outcome.code, outcome.message, requestId);

  await withTransaction((tx) =>
    insertAuditLog(tx, {
      id: randomUUID(),
      actorUserId: guarded.value.session.userId,
      actorRole: 'tutor',
      action: 'faq_entry.published',
      targetTable: 'faq_entries',
      targetId: outcome.value.entry.id,
      // Provenance and the fact of publication. **No reply body**: `06` section 7.6.5 forbids
      // `query_messages.body` in this table without exception, and the entry already holds the text.
      before: null,
      after: { sourceKind: 'query_reply', sourceQueryMessageId: parsed.messageId },
      requestId,
    }),
  );

  return withRequestId(NextResponse.json(outcome.value.entry, { status: 201 }), requestId);
}

type ParsedBody =
  | { readonly ok: true; readonly messageId: string }
  | { readonly ok: false; readonly message: string; readonly details?: Record<string, unknown> };

/**
 * `{ messageId }`.
 *
 * **Required rather than defaulted to the latest reply.** A thread may hold several tutor replies, and
 * choosing one for the tutor would decide which sentence becomes the cohort's answer. The client sends
 * the reply the tutor pressed `Publish` on, and the service verifies it is a tutor message that is not
 * already published.
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
  const messageId = (raw as Record<string, unknown>)['messageId'];
  if (typeof messageId !== 'string' || messageId.trim().length === 0) {
    return { ok: false, message: 'A messageId is required.', details: { fields: ['messageId'] } };
  }
  return { ok: true, messageId };
}

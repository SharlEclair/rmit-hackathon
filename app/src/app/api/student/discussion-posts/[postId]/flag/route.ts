import { NextResponse, type NextRequest } from 'next/server';

import { PLATFORM_ERROR_MESSAGES, apiError, resolveRequestId, withRequestId, type ApiErrorBody } from '@/lib/api/errors';
import type { ModerationFlagResponse } from '@/lib/api/types';
import { guardStudentVisibleAssignment } from '@/lib/auth/guards';
import { withTransaction } from '@/lib/db/transaction';
import { findPost, listModerationQueue } from '@/lib/db/queries/discussions';
import { flagPost } from '@/features/discussion/service';
import { viewerFor } from '@/features/discussion/routes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** `05` section 9.2's student-visible reason codes. A student picks a category, never a severity. */
const REASON_CODES = [
  'HARASSMENT',
  'INAPPROPRIATE_CONTENT',
  'PERSONAL_INFORMATION',
  'PROHIBITED_ASSISTANCE',
  'SOLUTION_SHARING',
  'OTHER',
] as const;

type ReasonCode = (typeof REASON_CODES)[number];

/**
 * `POST /api/student/discussion-posts/{postId}/flag` (`06` section 5.4, 5.5.14).
 *
 * **One flag per student per post, and the enforcement is a partial unique index rather than a count.**
 * `uq_moderation_flags_student_flag` covers `(target_kind, target_id, reporter_anon_identity_id) WHERE
 * source = 'student'`, so "one flag per user per post" (D30) is implemented in the schema, and the
 * reporter is the student's **anonymous identity** rather than their user id (D54) -- which is what
 * leaves the moderator queue unable to resolve who flagged anything (`06` section 4.4).
 *
 * **A student never sees a count.** `07` section 6.5 rule 1: "After flagging, the control becomes the
 * text `Flagged for tutor review`, disabled, with no count." The response is the created flag without
 * its `reasonCode`-to-severity mapping exposed to the client beyond the row itself, and a repeat is
 * `INVALID_STATE_TRANSITION` with the doc's sentence.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ postId: string }> },
): Promise<NextResponse<ModerationFlagResponse | ApiErrorBody>> {
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
    flagPost(tx, {
      scope: guarded.value.scope,
      viewer,
      postId,
      reasonCode: parsed.reasonCode,
      now: new Date(),
    }),
  );
  if (!outcome.ok) return apiError(outcome.code, outcome.message, requestId);

  // Read the created row back through the queue projection so the response carries the contract's field
  // set and **not** the reporter: `06` section 5.5.14 has no reporter field, and a shape built from the
  // insert would have to be filtered to remove one.
  const queue = await withTransaction((tx) =>
    listModerationQueue(tx, guarded.value.scope.assignmentId),
  );
  const created = queue.find((row) => row.id === outcome.value.flagId);
  if (created === undefined) {
    return apiError('INTERNAL', PLATFORM_ERROR_MESSAGES.internal, requestId);
  }

  const body: ModerationFlagResponse = {
    id: created.id,
    targetKind: created.targetKind as ModerationFlagResponse['targetKind'],
    targetId: created.targetId,
    source: created.source as ModerationFlagResponse['source'],
    severity: created.severity as ModerationFlagResponse['severity'],
    reasonCode: created.reasonCode as ModerationFlagResponse['reasonCode'],
    status: created.status as ModerationFlagResponse['status'],
    createdAt: created.createdAt,
    reviewedAt: created.reviewedAt,
  };
  return withRequestId(NextResponse.json(body, { status: 201 }), requestId);
}

type ParsedBody =
  | { readonly ok: true; readonly reasonCode: ReasonCode }
  | { readonly ok: false; readonly message: string; readonly details?: Record<string, unknown> };

/**
 * `{ reasonCode, detail? }`.
 *
 * `detail` is accepted by the contract's column but deliberately **not** stored by this route: `07`
 * section 6.5's dialog offers five fixed categories and no free-text field, so a client sending one has
 * nothing the UI would show. Accepting it would create a second student-authored text channel that
 * moderation would have to review, which is a scope change rather than an implementation detail.
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
  const reasonCode = (raw as Record<string, unknown>)['reasonCode'];
  if (typeof reasonCode !== 'string' || !REASON_CODES.includes(reasonCode as ReasonCode)) {
    return {
      ok: false,
      message: 'A reason is required.',
      details: { fields: ['reasonCode'], allowed: [...REASON_CODES] },
    };
  }
  return { ok: true, reasonCode: reasonCode as ReasonCode };
}

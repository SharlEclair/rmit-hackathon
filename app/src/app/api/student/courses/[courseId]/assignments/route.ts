import { NextResponse, type NextRequest } from 'next/server';

import { PLATFORM_ERROR_MESSAGES, apiError, resolveRequestId, withRequestId, type ApiErrorBody } from '@/lib/api/errors';
import type { AssignmentListResponse, AssignmentStatusApi } from '@/lib/api/types';
import { AuthError, requireRole } from '@/lib/auth/roles';
import { findEnrolmentRole } from '@/lib/db/queries/courses';
import {
  findCourseForUser,
  listAssignmentCardsForStudent,
} from '@/lib/db/queries/student-workspace';
import { withTransaction } from '@/lib/db/transaction';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATUSES: readonly AssignmentStatusApi[] = [
  'draft',
  'ingesting',
  'in_review',
  'published',
  'archived',
];

/** Narrow the stored `status` text to the contract's union without asserting it is one. */
function toStatus(value: string): AssignmentStatusApi {
  const found = STATUSES.find((status) => status === value);
  // The column carries a CHECK for these five values, so the fallback is unreachable; it exists so
  // an unexpected value cannot be returned as if it were a contract member.
  return found ?? 'draft';
}

/**
 * `GET /api/student/courses/{courseId}/assignments` (`06` section 5.4, 5.5.2).
 *
 * Published assignments only (G1), with the student's own progress and open-Query count on each card.
 *
 * **Enrolment decides `NOT_FOUND` here, and the order is deliberate.** `06` section 5.2 rule 2 makes
 * an unenrolled course indistinguishable from an absent one, so the role-in-course read runs before
 * the card query and a `null` from it answers `NOT_FOUND` -- never an empty list, which would confirm
 * the course exists (trap T3's shape applied to a course rather than an assignment).
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ courseId: string }> },
): Promise<NextResponse<AssignmentListResponse | ApiErrorBody>> {
  const requestId = resolveRequestId(request);
  const { courseId } = await context.params;

  try {
    const session = await requireRole('student', request);

    const course = await withTransaction((tx) => findCourseForUser(tx, session.userId, courseId));
    const role = await withTransaction((tx) =>
      findEnrolmentRole(tx, session.userId, courseId),
    );
    if (course === null || role !== 'student') {
      return apiError('NOT_FOUND', PLATFORM_ERROR_MESSAGES.notFound, requestId);
    }

    const cards = await withTransaction((tx) =>
      listAssignmentCardsForStudent(tx, session.userId, courseId),
    );

    return withRequestId(
      NextResponse.json(
        {
          items: cards.map((card) => ({
            id: card.id,
            title: card.title,
            status: toStatus(card.status),
            dueAt: card.dueAt,
            publishedAt: card.publishedAt,
            checklistCompleted: card.checklistCompleted,
            checklistTotal: card.checklistTotal,
            openQueryCount: card.openQueryCount,
            // A student never sees the tutor's review count (`06` section 5.5.2).
            needsReviewCount: null,
          })),
        },
        { status: 200 },
      ),
      requestId,
    );
  } catch (error) {
    if (error instanceof AuthError) return apiError(error.code, error.message, requestId);
    return apiError('INTERNAL', PLATFORM_ERROR_MESSAGES.internal, requestId);
  }
}
